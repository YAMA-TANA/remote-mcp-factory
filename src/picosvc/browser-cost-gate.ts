import type { Env } from '../types.js';
import { monthKey, productLimit } from './entitlements.js';
import { json } from './service-utils.js';

export type BrowserProduct = 'fetch' | 'shot';

// Independent browser-time budgets: existing published request limits are untouched.
// Free: 10 minutes; Pico: 2 hours; PicoPlus: 10 hours per service/month.
// These budgets exceed the benchmark assumptions of 5s/Fetch and 10s/Shot
// at the published tier request caps; they primarily block extreme slow pages.
const MONTHLY_MS = { free: 600_000, tiny: 7_200_000, pro: 36_000_000 } as const;
export const BROWSER_NAVIGATION_TIMEOUT_MS = 8_000;
export const BROWSER_ACTION_TIMEOUT_MS = 8_000;
const BROWSER_SELECTOR_TIMEOUT_MS = 2_000;
const BROWSER_WAIT_TIMEOUT_MS = 2_000;
const RESERVED_MS = 20_000;
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
  // Compare-and-set: an expired, replaced request cannot release another's lease.
  await env.DB.prepare(`
    UPDATE picosvc_browser_gates SET leased_until_ms=0, next_allowed_ms=?
    WHERE owner=? AND product=? AND token=?
  `).bind(Date.now() + COOLDOWN_MS, owner, product, token).run();
}

async function reserveBudget(env: Env, owner: string, product: BrowserProduct): Promise<{ month: string } | Response> {
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
  if (reserved) return { month };
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

function boundedMs(value: unknown, ceiling: number): number {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.min(ceiling, Math.floor(amount)) : ceiling;
}

/**
 * Browser Run itself stops navigation/action/PDF work at the configured timers.
 * Do not Promise.race() the browser RPC: a timed-out outer promise cannot prove
 * that the underlying browser stopped and may leak billable browser-time.
 * The stage timers approximate a 20s total; provider/transport overhead is not
 * covered by a guaranteed 20s wall-clock deadline.
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
  let reservation: { month: string } | null = null;
  let measuredMs = RESERVED_MS;
  try {
    const budget = await reserveBudget(env, owner, product);
    if (budget instanceof Response) return budget;
    reservation = budget;
    const goto = (options.gotoOptions as Record<string, unknown> | undefined) || {};
    const selector = options.waitForSelector as Record<string, unknown> | undefined;
    const response = await env.BROWSER.quickAction(action, {
      ...options,
      gotoOptions: {
        ...goto,
        timeout: boundedMs(goto.timeout, BROWSER_NAVIGATION_TIMEOUT_MS),
      },
      actionTimeout: boundedMs(options.actionTimeout, BROWSER_ACTION_TIMEOUT_MS),
      ...(options.waitForTimeout !== undefined ? { waitForTimeout: boundedMs(options.waitForTimeout, BROWSER_WAIT_TIMEOUT_MS) } : {}),
      ...(selector ? { waitForSelector: { ...selector, timeout: boundedMs(selector.timeout, BROWSER_SELECTOR_TIMEOUT_MS) } } : {}),
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
