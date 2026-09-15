import type { Env } from '../types.js';
import { PICOSVC_PRODUCT_MAP, type PicoSvcProductSlug, type PicoSvcTier } from './catalog.js';

export async function resolveProductTier(env: Env, owner: string, product: PicoSvcProductSlug): Promise<PicoSvcTier> {
  const row = await env.DB.prepare(`
    SELECT tier
    FROM product_entitlements
    WHERE owner=? AND product=? AND active=1
  `).bind(owner, product).first<{ tier: PicoSvcTier }>();

  return row?.tier === 'tiny' || row?.tier === 'pro' ? row.tier : 'free';
}

export async function productLimit(
  env: Env,
  owner: string,
  product: PicoSvcProductSlug,
  metric: string,
): Promise<{ tier: PicoSvcTier; limit: number | null }> {
  const tier = await resolveProductTier(env, owner, product);
  const definition = PICOSVC_PRODUCT_MAP.get(product)?.tiers[tier];
  const value = definition?.limits?.[metric];
  return { tier, limit: typeof value === 'number' ? value : null };
}

export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function incrementProductUsage(
  env: Env,
  owner: string,
  product: PicoSvcProductSlug,
  metric: string,
  amount = 1,
): Promise<void> {
  const month = monthKey();
  await env.DB.prepare(`
    INSERT INTO product_usage_monthly (owner, product, metric, month, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, product, metric, month) DO UPDATE SET
      quantity = quantity + excluded.quantity,
      updated_at = excluded.updated_at
  `).bind(owner, product, metric, month, amount, new Date().toISOString()).run();
}
