import type { Env } from '../types.js';
import { json } from './service-utils.js';

// Shared across Fetch and Shot, including concurrent requests on different isolates.
// A long lease is deliberate: an abandoned Quick Action cannot be cancelled through
// the current binding API, so a response-only timeout must not immediately admit more.
const LEASE_MS = 180_000;
const START_GAP_MS = 2_000;
const ERROR_COOLDOWN_MS = 10_000;

type BrowserLease = { owner: string; token: string };

export async function acquireBrowserLease(env: Env, owner: string): Promise<BrowserLease | Response> {
  const now = Date.now();
  const token = crypto.randomUUID();
  try {
    // D1 serializes this single upsert. No read-then-write concurrency race.
    const acquired = await env.DB.prepare(`
      INSERT INTO picosvc_browser_leases (owner, token, lease_until_ms, next_allowed_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner) DO UPDATE SET
        token = excluded.token,
        lease_until_ms = excluded.lease_until_ms,
        next_allowed_ms = excluded.next_allowed_ms,
        updated_at_ms = excluded.updated_at_ms
      WHERE picosvc_browser_leases.lease_until_ms <= ?
        AND picosvc_browser_leases.next_allowed_ms <= ?
      RETURNING token
    `).bind(owner, token, now + LEASE_MS, now + START_GAP_MS, now, now, now)
      .first<{ token: string }>();
    if (acquired?.token === token) return { owner, token };
    const state = await env.DB.prepare(`
      SELECT lease_until_ms, next_allowed_ms FROM picosvc_browser_leases WHERE owner=?
    `).bind(owner).first<{ lease_until_ms: number; next_allowed_ms: number }>();
    const retrySeconds = Math.max(1, Math.ceil((Math.max(state?.lease_until_ms || 0, state?.next_allowed_ms || 0) - now) / 1000));
    return Response.json({ error: { code: 'browser_busy', message: 'Finish the current browser job or retry after the cooldown.' }, retryAfterSeconds: retrySeconds },
      { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(retrySeconds) } });
  } catch {
    // Fail closed if the migration is not yet applied; never silently remove the gate.
    return json({ error: { code: 'browser_gate_unavailable', message: 'Browser execution is temporarily unavailable.' } }, 503);
  }
}

export async function releaseBrowserLease(env: Env, lease: BrowserLease, failed = false): Promise<void> {
  const now = Date.now();
  try {
    await env.DB.prepare(`
      UPDATE picosvc_browser_leases
      SET lease_until_ms=0, next_allowed_ms=MAX(next_allowed_ms, ?), updated_at_ms=?
      WHERE owner=? AND token=?
    `).bind(now + (failed ? ERROR_COOLDOWN_MS : 0), now, lease.owner, lease.token).run();
  } catch {
    // The lease stays locked until expiry if D1 becomes unavailable on cleanup.
    console.error('PicoSvc browser lease release failed');
  }
}
