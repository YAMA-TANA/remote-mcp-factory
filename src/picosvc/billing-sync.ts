import { clerkClientFor } from '../auth.js';
import type { Env } from '../types.js';
import { PICOSVC_PRODUCTS, type PicoSvcProductSlug, type PicoSvcTier } from './catalog.js';

const SYNC_TTL_MS = 5 * 60_000;
const PRODUCT_SLUGS = new Set(PICOSVC_PRODUCTS.map((product) => product.slug));

type Grant = { product: PicoSvcProductSlug; tier: PicoSvcTier; source: string };
type BundleGrant = { bundle: string; product: PicoSvcProductSlug; tier: PicoSvcTier; source: string };

function subscriptionPlanSlugs(subscription: any): string[] {
  if (!subscription || !Array.isArray(subscription.subscriptionItems)) return [];
  return subscription.subscriptionItems
    .filter((item: any) => item?.status === 'active' && typeof item?.plan?.slug === 'string')
    .map((item: any) => String(item.plan.slug).toLowerCase());
}

function parseStandalone(slug: string): Grant | null {
  // Clerk Billing plan keys accept lowercase alphanumerics and underscores,
  // while older deployments used hyphenated slugs. Accept both spellings.
  const match = slug.match(/^picosvc[-_]([a-z]+)[-_](pico|picoplus)$/);
  if (match && PRODUCT_SLUGS.has(match[1] as PicoSvcProductSlug)) {
    return {
      product: match[1] as PicoSvcProductSlug,
      tier: match[2] === 'picoplus' ? 'pro' : 'tiny',
      source: `clerk:${slug}`,
    };
  }

  // MCP compatibility while old Clerk products are migrated.
  if (slug === 'pico' || slug === 'pro') return { product: 'mcp', tier: 'tiny', source: `clerk:${slug}` };
  if (slug === 'picoplus' || slug === 'team') return { product: 'mcp', tier: 'pro', source: `clerk:${slug}` };
  return null;
}

function parseBundle(slug: string): BundleGrant[] {
  const normalized = slug.replaceAll('_', '-');
  const tier: PicoSvcTier | null = normalized === 'picosvc-bundle-pico' ? 'tiny' : normalized === 'picosvc-bundle-pro' ? 'pro' : null;
  if (!tier) return [];
  const bundle = tier === 'tiny' ? 'bundle-pico' : 'bundle-pro';
  return PICOSVC_PRODUCTS.map((product) => ({ bundle, product: product.slug, tier, source: `clerk:${slug}` }));
}

async function shouldSync(env: Env, owner: string, force: boolean): Promise<boolean> {
  if (force) return true;
  try {
    const row = await env.DB.prepare('SELECT checked_at FROM billing_sync_state WHERE owner=?').bind(owner).first<{ checked_at: string }>();
    if (!row) return true;
    return Date.now() - Date.parse(row.checked_at) >= SYNC_TTL_MS;
  } catch {
    // Migration 0011 may not have reached a rolling deployment yet.
    return false;
  }
}

export async function syncClerkBillingEntitlements(env: Env, owner: string, force = false): Promise<boolean> {
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) return false;
  if (!owner.startsWith('user_') && !owner.startsWith('org_')) return false;
  if (!(await shouldSync(env, owner, force))) return false;

  let slugs: string[];
  try {
    const client = clerkClientFor(env);
    const subscription = owner.startsWith('org_')
      ? await client.billing.getOrganizationBillingSubscription(owner)
      : await client.billing.getUserBillingSubscription(owner);
    slugs = subscriptionPlanSlugs(subscription);
  } catch {
    // Keep the previous entitlement snapshot on temporary Clerk failures.
    return false;
  }

  const direct = new Map<PicoSvcProductSlug, Grant>();
  const bundles: BundleGrant[] = [];
  for (const slug of slugs) {
    const grant = parseStandalone(slug);
    if (grant) {
      const existing = direct.get(grant.product);
      if (!existing || (existing.tier === 'tiny' && grant.tier === 'pro')) direct.set(grant.product, grant);
    }
    bundles.push(...parseBundle(slug));
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM product_entitlements WHERE owner=? AND source LIKE 'clerk:%'").bind(owner),
    env.DB.prepare("DELETE FROM bundle_entitlements WHERE owner=? AND source LIKE 'clerk:%'").bind(owner),
  ];

  for (const grant of direct.values()) {
    statements.push(env.DB.prepare(`
      INSERT INTO product_entitlements (owner,product,tier,source,active,updated_at)
      VALUES (?,?,?,?,1,?)
      ON CONFLICT(owner,product) DO UPDATE SET
        tier=excluded.tier, source=excluded.source, active=1, updated_at=excluded.updated_at
    `).bind(owner, grant.product, grant.tier, grant.source, now));
  }

  for (const grant of bundles) {
    statements.push(env.DB.prepare(`
      INSERT INTO bundle_entitlements (owner,bundle,product,tier,source,active,updated_at)
      VALUES (?,?,?,?,?,1,?)
      ON CONFLICT(owner,bundle,product) DO UPDATE SET
        tier=excluded.tier, source=excluded.source, active=1, updated_at=excluded.updated_at
    `).bind(owner, grant.bundle, grant.product, grant.tier, grant.source, now));
  }

  statements.push(env.DB.prepare(`
    INSERT INTO billing_sync_state (owner,checked_at,updated_at) VALUES (?,?,?)
    ON CONFLICT(owner) DO UPDATE SET checked_at=excluded.checked_at, updated_at=excluded.updated_at
  `).bind(owner, now, now));

  try {
    await env.DB.batch(statements);
    return true;
  } catch {
    // Rolling deploy compatibility if billing tables/migrations are not ready.
    return false;
  }
}
