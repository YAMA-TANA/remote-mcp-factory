import type { Env, ServerRow } from '../types.js';
import { buildServer, stopRuntime } from '../runtime.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';

const MAX_EVENTS_PER_SERVER = 500;

function validServerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{5,40}$/.test(value);
}

async function ownedServer(request: Request, env: Env, id: string): Promise<ServerRow | Response> {
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?').bind(id, identity.ownerId).first<ServerRow>();
  return row || json({ error: 'MCP deployment not found' }, 404);
}

async function appendEvent(env: Env, row: ServerRow, kind: 'build' | 'runtime', status: string, durationMs: number, httpStatus: number | null, message: string | null): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO mcp_runtime_events (id,server_id,owner,kind,status,http_status,duration_ms,message,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), row.id, row.owner, kind, status.slice(0, 40), httpStatus, Math.max(0, Math.round(durationMs)), message?.slice(0, 1000) || null, now),
    env.DB.prepare('DELETE FROM mcp_runtime_events WHERE server_id=? AND id NOT IN (SELECT id FROM mcp_runtime_events WHERE server_id=? ORDER BY created_at DESC LIMIT ?)')
      .bind(row.id, row.id, MAX_EVENTS_PER_SERVER),
  ]);
}

export async function recordMcpRuntime(env: Env, row: ServerRow, response: Response, durationMs: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const error = response.status >= 400 ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO mcp_request_daily (server_id,owner,day,requests,errors,duration_ms,updated_at)
      VALUES (?,?,?,1,?,?,?)
      ON CONFLICT(server_id,day) DO UPDATE SET
        requests=mcp_request_daily.requests+1,
        errors=mcp_request_daily.errors+excluded.errors,
        duration_ms=mcp_request_daily.duration_ms+excluded.duration_ms,
        updated_at=excluded.updated_at`)
      .bind(row.id, row.owner, day, error, Math.max(0, Math.round(durationMs)), now),
    env.DB.prepare('INSERT INTO mcp_runtime_events (id,server_id,owner,kind,status,http_status,duration_ms,message,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), row.id, row.owner, 'runtime', error ? 'error' : 'ok', response.status, Math.max(0, Math.round(durationMs)), null, now),
    env.DB.prepare('DELETE FROM mcp_runtime_events WHERE server_id=? AND id NOT IN (SELECT id FROM mcp_runtime_events WHERE server_id=? ORDER BY created_at DESC LIMIT ?)')
      .bind(row.id, row.id, MAX_EVENTS_PER_SERVER),
  ]);
}

export async function mcpObservedRuntimeRoute(request: Request, env: Env, delegate: () => Promise<Response>): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/mcp\/([a-z0-9][a-z0-9-]{5,40})(?:\/.*)?$/i);
  if (!match) return null;
  const row = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(match[1]).first<ServerRow>();
  const started = Date.now();
  const response = await delegate();
  if (row) await recordMcpRuntime(env, row, response, Date.now() - started).catch(() => undefined);
  return response;
}

export async function mcpObservabilityManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/picosvc\/mcp\/servers\/([a-z0-9][a-z0-9-]{5,40})(?:\/(logs|metrics|redeploy))?$/i);
  if (!match || !validServerId(match[1])) return null;
  const row = await ownedServer(request, env, match[1]);
  if (row instanceof Response) return row;
  const action = match[2] || '';

  if (action === 'logs' && request.method === 'GET') {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));
    const rows = await env.DB.prepare('SELECT kind,status,http_status,duration_ms,message,created_at FROM mcp_runtime_events WHERE server_id=? AND owner=? ORDER BY created_at DESC LIMIT ?')
      .bind(row.id, row.owner, limit).all();
    return json({ serverId: row.id, events: rows.results || [] });
  }

  if (action === 'metrics' && request.method === 'GET') {
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 30)));
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const rows = await env.DB.prepare('SELECT day,requests,errors,duration_ms FROM mcp_request_daily WHERE server_id=? AND owner=? AND day>=? ORDER BY day')
      .bind(row.id, row.owner, since).all<any>();
    const data = rows.results || [];
    const summary = data.reduce((acc: { requests: number; errors: number; durationMs: number }, item: any) => ({ requests: acc.requests + Number(item.requests || 0), errors: acc.errors + Number(item.errors || 0), durationMs: acc.durationMs + Number(item.duration_ms || 0) }), { requests: 0, errors: 0, durationMs: 0 });
    return json({ serverId: row.id, days, summary: { ...summary, averageDurationMs: summary.requests ? summary.durationMs / summary.requests : 0, errorRate: summary.requests ? summary.errors / summary.requests : 0 }, daily: data });
  }

  if (action === 'redeploy' && request.method === 'POST') {
    const quota = await consumeUsage(env, row.owner, 'mcp', 'builds');
    if (!quota.ok) return json({ error: 'MCP build quota reached', tier: quota.tier, limit: quota.limit, used: quota.used }, 429);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE servers SET status='queued',error=NULL,updated_at=? WHERE id=? AND owner=?").bind(now, row.id, row.owner).run();
    await stopRuntime(env, row).catch(() => undefined);
    const started = Date.now();
    try {
      await buildServer(env, { ...row, status: 'queued', error: null, updated_at: now } as ServerRow);
      const current = await env.DB.prepare('SELECT status,detected_runtime,error,updated_at FROM servers WHERE id=? AND owner=?').bind(row.id, row.owner).first<any>();
      const ready = current?.status === 'ready';
      await appendEvent(env, row, 'build', ready ? 'ready' : 'failed', Date.now() - started, null, ready ? 'Manual redeploy completed' : (current?.error || 'Manual redeploy did not reach ready state'));
      return json({ serverId: row.id, redeployed: ready, deployment: current }, ready ? 200 : 502);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendEvent(env, row, 'build', 'failed', Date.now() - started, null, message);
      return json({ error: 'MCP redeploy failed', detail: message.slice(0, 500) }, 502);
    }
  }

  if (!action && request.method === 'GET') {
    const edge = await env.DB.prepare('SELECT status,compiler_version,size_bytes,tool_count,reason,updated_at FROM edge_builds WHERE server_id=?').bind(row.id).first();
    return json({ server: { id: row.id, name: row.name, status: row.status, enabled: Boolean(row.enabled), detectedRuntime: row.detected_runtime, error: row.error, updatedAt: row.updated_at }, edge });
  }

  return new Response('Method Not Allowed', { status: 405, headers: { allow: action === 'redeploy' ? 'POST' : 'GET' } });
}
