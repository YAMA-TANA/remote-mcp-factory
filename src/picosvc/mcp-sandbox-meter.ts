import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { consumeUsage, json } from './service-utils.js';
import { sha256Hex } from './security.js';

const SANDBOX_IDLE_LEASE_MINUTES = 10;

interface SandboxServer {
  id: string;
  owner: string;
  token_hash: string;
  visibility: string;
  enabled: number;
  status: string;
  detected_runtime: string | null;
}

function activeMinuteKey(timestamp: number): string {
  const date = new Date(timestamp);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function requestAuthorizedForServer(request: Request, row: SandboxServer): Promise<boolean> {
  if (row.visibility !== 'token') return true;
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(token) && await sha256Hex(token) === row.token_hash;
}

async function claimLeaseMinutes(env: Env, row: SandboxServer, now: Date): Promise<string[]> {
  const minute = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
  );
  const keys = Array.from({ length: SANDBOX_IDLE_LEASE_MINUTES }, (_, index) => activeMinuteKey(minute + index * 60_000));
  const createdAt = now.toISOString();
  const values = keys.map(() => '(?,?,?,?)').join(',');
  const binds = keys.flatMap((key) => [row.owner, row.id, key, createdAt]);
  const inserted = await env.DB.prepare(`
    INSERT INTO mcp_sandbox_active_minutes (owner,server_id,active_minute,created_at)
    VALUES ${values}
    ON CONFLICT(owner,server_id,active_minute) DO NOTHING
    RETURNING active_minute
  `).bind(...binds).all<{ active_minute: string }>();
  return (inserted.results || []).map((entry) => entry.active_minute);
}

async function releaseLeaseMinutes(env: Env, row: SandboxServer, minutes: string[]): Promise<void> {
  if (minutes.length === 0) return;
  const placeholders = minutes.map(() => '?').join(',');
  await env.DB.prepare(`
    DELETE FROM mcp_sandbox_active_minutes
    WHERE owner=? AND server_id=? AND active_minute IN (${placeholders})
  `).bind(row.owner, row.id, ...minutes).run();
}

export async function mcpSandboxActiveMinuteGuard(request: Request, env: Env): Promise<Response | null> {
  if (env.ALLOW_DEV_AUTH === 'true') return null;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/mcp\/([a-z0-9][a-z0-9-]{5,40})\/?$/);
  if (!match) return null;

  const row = await env.DB.prepare(`
    SELECT id,owner,token_hash,visibility,enabled,status,detected_runtime
    FROM servers
    WHERE id=?
  `).bind(match[1]).first<SandboxServer>();
  if (!row || !row.enabled || row.status !== 'ready' || !row.detected_runtime?.startsWith('sandbox-')) return null;
  if (!(await requestAuthorizedForServer(request, row))) return null;

  const plan = await productLimit(env, row.owner, 'mcp', 'sandboxActiveMinutes');
  if (plan.limit !== null && plan.limit <= 0) {
    return json({
      error: 'Sandbox MCP runtime is not included in this tier',
      tier: plan.tier,
      limit: plan.limit,
    }, 402);
  }

  const now = new Date();
  await env.DB.prepare('DELETE FROM mcp_sandbox_active_minutes WHERE owner=? AND active_minute<?')
    .bind(row.owner, monthStartIso(now)).run();

  const claimed = await claimLeaseMinutes(env, row, now);
  if (claimed.length === 0 || plan.limit === null) return null;

  try {
    const usage = await consumeUsage(env, row.owner, 'mcp', 'sandboxActiveMinutes', claimed.length);
    if (usage.ok) return null;
    await releaseLeaseMinutes(env, row, claimed);
    return json({
      error: 'Sandbox active-minute quota reached',
      tier: usage.tier,
      limit: usage.limit,
      used: usage.used,
      requestedMinutes: claimed.length,
    }, 429);
  } catch (error) {
    await releaseLeaseMinutes(env, row, claimed).catch(() => undefined);
    throw error;
  }
}
