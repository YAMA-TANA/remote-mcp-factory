import { clerkIdentity } from '../auth.js';
import type { AuthIdentity, Env } from '../types.js';
import type { PicoSvcProductSlug } from './catalog.js';
import { incrementProductUsage, monthKey, productLimit } from './entitlements.js';

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function requireIdentity(request: Request, env: Env): Promise<AuthIdentity | Response> {
  const identity = await clerkIdentity(request, env);
  return identity || json({ error: 'Authentication required', signInUrl: env.CLERK_SIGN_IN_URL || null }, 401);
}

export async function usageState(
  env: Env,
  owner: string,
  product: PicoSvcProductSlug,
  metric: string,
): Promise<{ tier: 'free' | 'tiny' | 'pro'; limit: number | null; used: number }> {
  const { tier, limit } = await productLimit(env, owner, product, metric);
  const row = await env.DB.prepare(`
    SELECT quantity FROM product_usage_monthly
    WHERE owner=? AND product=? AND metric=? AND month=?
  `).bind(owner, product, metric, monthKey()).first<{ quantity: number }>();
  return { tier, limit, used: Number(row?.quantity || 0) };
}

export async function consumeUsage(
  env: Env,
  owner: string,
  product: PicoSvcProductSlug,
  metric: string,
  amount = 1,
): Promise<{ ok: boolean; tier: 'free' | 'tiny' | 'pro'; limit: number | null; used: number }> {
  const state = await usageState(env, owner, product, metric);
  if (state.limit !== null && state.used + amount > state.limit) return { ok: false, ...state };
  await incrementProductUsage(env, owner, product, metric, amount);
  return { ok: true, ...state, used: state.used + amount };
}

export async function resourceCapacity(
  env: Env,
  owner: string,
  product: PicoSvcProductSlug,
  metric: string,
  table: string,
): Promise<{ ok: boolean; tier: 'free' | 'tiny' | 'pro'; limit: number | null; used: number }> {
  if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table name');
  const { tier, limit } = await productLimit(env, owner, product, metric);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE owner=?`).bind(owner).first<{ count: number }>();
  const used = Number(row?.count || 0);
  return { ok: limit === null || used < limit, tier, limit, used };
}

export function cleanName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback;
}

export function publicOrigin(request: Request): string {
  return new URL(request.url).origin;
}
