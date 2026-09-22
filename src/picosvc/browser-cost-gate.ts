import type { Env } from '../types.js';
import { monthKey, productLimit } from './entitlements.js';
import { json } from './service-utils.js';

export type BrowserProduct = 'fetch' | 'shot';

// These limits supplement, rather than replace, the published request allowances.
// Free: 2 minutes; Pico: 30 minutes; PicoPlus: 3 hours per browser service/month.
const MONTHLY_MS = { free: 120_000, tiny: 1_800_000, pro: 10_800_000 } as const;
export const BROWSER_NAVIGATION_TIMEOUT_MS = 10_000;
export const BROWSER_ACTION_TIMEOUT_MS = 10_000;
const RESERVED_MS = BROWSER_NAVIGATION_TIMEOUT_MS + BROWSER_ACTION_TIMEOUT_MS;
const LEASE_MS = 45_000;
const COOLDOWN_MS = 2_000;

type Lease = { token: string };

async function acquireLease(env: Env, owner: string, product: BrowserProduct, now: number): Promise<Lease | Response> {
  const token = crypto.randomUUID();
  const claimed = await env.DB.prepare(`
    INSERT INTO picosvc_browser_gates (owner, product, token, leased_until_ms, next_allowed_ms)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner, product) DO UPDATE SET
      token=excluded.token,
      leased_until_ms=excluded.leased_until_ms,
      next_allowed_ms=excluded.next_allowed_ms
    WHERE picosvc_browser_gates.leased_until_ms <= ?
      AND picosvc_browser_gates.next_allowed_ms <= ?
    RETURNING token
  `).bind(owner, product, token, now + LEASE_MS, now + COOLDOWN_MS, now, now).first<Lease>();
  if (claimed) return claimed;
  const current = await env.DB.prepare(`
    SELECT leased_until_ms, next_allowed_ms FROM picosvc_browser_gates WHERE owner=? AND product=?
  `).bind(owner, product).first<{ leased_until_ms: number; next_allowed_ms: number }>();
  const retry = Math.max(1, Math.ceil((Math.max(current?.leased_until_ms || 0, current?.next_allowed_ms || 0) - now) / 1000));
  return Response.json({ error: 'Browser request already running or submitted too quickly', retryAfterSeconds: retry }, {
    status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(retry) },
  });
}

async function releaseLease(env: Env, owner: string, product: BrowserProduct, token: string): Promise<void> {
  // Compare-and-set: an old request must not unlock a replacement lease.
  await env.DB.prepare(`
    UPDATE picosvc_browser_gates SET leased_until_ms=0, next_allowed_ms=?
    WHERE owner=? AND product=? AND token=?
  `).bind(Date.now() + COOLDOWN_MS, owner, product, token).run();
}

async function reserveBudget(env: Env, owner: string, product: BrowserProduct): Promise<{ ok: true; month: string } | Response> {
  const { tier } = await productLimit(env, owner, product, product === 'fetch' ? 'requests' : 'shots');
  const limit = MONTHLY_MS[tier];
  const month = monthKey();
  const reserved = await env.DB.prepare(`
    INSERT INTO picosvc_browser_usage (owner, product, month, used_ms)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner, product, month) DO UPDATE SET used_ms=picosvc_browser_usage.used_ms + excluded.used_ms
    WHERE picosvc_browser_usage.used_ms + excluded.used_ms <= ?
    RETURNING used_ms
  `).bind(owner, product, month, RESERVED_MS, limit).first<{ used_ms: number }>();
  if (reserved) return { ok: true, month };
  const used = await env.DB.prepare(`
    SELECT used_ms FROM picosvc_browser_usage WHERE owner=? AND product=? AND month=?
  `).bind(owner, product, month).first<{ used_ms: number }>();
  return json({ error: 'Monthly browser-time budget reached', tier, usedMs: used?.used_ms || 0, limitMs: limit }, 429);
}

async function settleBudget(env: Env, owner: string, product: BrowserProduct, month: string, actualMs: number): Promise<void> {
  // Missing provider metering is charged at the full reservation; never guess zero.
  const adjustment = actualMs - RESERVED_MS;
  if (!adjustment) return;
  await env.DB.prepare(`
    UPDATE picosvc_browser_usage SET used_ms=MAX(0, used_ms + ?)
    WHERE owner=? AND product=? AND month=?
  `).bind(adjustment, owner, product, month).run();
}

/**
 * Browser Run owns the actual termination: its navigation/action/PDF timeouts stop
 * the operation. Do not Promise.race() a browser RPC: that abandons the response
 * without proving the underlying browser stopped, and can leak billable time.
 */
export async function runMeteredBrowserAction(
  env: Env,
  owner: string,
  product: BrowserProduct,
  action: 'markdown' | 'screenshot' | 'pdf',
  options: Record<string, unknown>,
): Promise<Response> {
  if (!env.BROWSER) return json({ error: 'Browser Run binding is not configured' }, 503);
  const acquired = await acquireLease(env, owner, product, Date.now());
  if (acquired instanceof Response) return acquired;
  let reservation: { ok: true; month: string } | null = null;
  let measuredMs = RESERVED_MS;
  try {
    const budget = await reserveBudget(env, owner, product);
    if (budget instanceof Response) return budget;
    reservation = budget;
    const response = await env.BROWSER.quickAction(action, {
      ...options,
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: BROWSER_NAVIGATION_TIMEOUT_MS },
      actionTimeout: BROWSER_ACTION_TIMEOUT_MS,
      ...(action === 'pdf' ? {
        pdfOptions: { ...((options.pdfOptions as Record<string, unknown> | undefined) || {}), timeout: BROWSER_ACTION_TIMEOUT_MS },
      } : {}),
    });
    const providerMs = response.headers.get('X-Browser-Ms-Used');
    if (providerMs !== null && Number.isFinite(Number(providerMs)) && Number(providerMs) >= 0) {
      measuredMs = Math.ceil(Number(providerMs));
    }
    const headers = new Headers(response.headers);
    headers.set('x-picosvc-browser-ms-used', String(measuredMs));
    headers.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error('PicoSvc Browser Run failed', product, error instanceof Error ? error.name : 'unknown');
    return json({ error: 'Browser rendering failed or timed out' }, 504);
  } finally {
    try {
      if (reservation) await settleBudget(env, owner, product, reservation.month, measuredMs);
    } finally {
      await releaseLease(env, owner, product, acquired.token);
    }
  }
}
