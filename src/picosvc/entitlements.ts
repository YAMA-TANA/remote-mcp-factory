import type { Env } from '../types.js';
import { syncClerkBillingEntitlements } from './billing-sync.js';
import { PICOSVC_PRODUCT_MAP, type PicoSvcProductSlug, type PicoSvcTier } from './catalog.js';

const TIER_RANK: Record<PicoSvcTier, number> = { free: 0, tiny: 1, pro: 2 };

function normalizeTier(value: unknown): PicoSvcTier {
  return value === 'tiny' || value === 'pro' ? value : 'free';
}

function higherTier(a: PicoSvcTier, b: PicoSvcTier): PicoSvcTier {
  return TIER_RANK[b] > TIER_RANK[a] ? b : a;
}

export async function resolveProductTier(env: Env, owner: string, product: PicoSvcProductSlug): Promise<PicoSvcTier> {
  await syncClerkBillingEntitlements(env, owner).catch(() => undefined);

  const direct = await env.DB.prepare(`
    SELECT tier
    FROM product_entitlements
    WHERE owner=? AND product=? AND active=1
  `).bind(owner, product).first<{ tier: PicoSvcTier }>();

  let tier = normalizeTier(direct?.tier);

  try {
    const bundleRows = await env.DB.prepare(`
      SELECT tier
      FROM bundle_entitlements
      WHERE owner=? AND product=? AND active=1
    `).bind(owner, product).all<{ tier: PicoSvcTier }>();

    for (const row of bundleRows.results || []) {
      tier = higherTier(tier, normalizeTier(row.tier));
    }
  } catch {
    // Migration may not have reached this environment yet.
  }

  return tier;
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
