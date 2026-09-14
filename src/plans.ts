import { clerkClientFor } from './auth.js';
import type { AuthIdentity, Env, PlanId } from './types.js';

export interface PlanLimits {
  id: PlanId;
  label: string;
  monthlyPrice: string;
  deployments: number;
  requestsPerMonth: number;
  buildsPerMonth: number;
  allowTokenVisibility: boolean;
  privateRepos: boolean;
  teamSeats: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  hobby: {
    id: 'hobby',
    label: 'Hobby',
    monthlyPrice: '$0',
    deployments: 1,
    requestsPerMonth: 5_000,
    buildsPerMonth: 20,
    allowTokenVisibility: true,
    privateRepos: false,
    teamSeats: false,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyPrice: '$20 / month',
    deployments: 10,
    requestsPerMonth: 250_000,
    buildsPerMonth: 200,
    allowTokenVisibility: true,
    privateRepos: true,
    teamSeats: false,
  },
  team: {
    id: 'team',
    label: 'Team',
    monthlyPrice: '$20 / seat / month',
    deployments: 50,
    requestsPerMonth: 1_000_000,
    buildsPerMonth: 1_000,
    allowTokenVisibility: true,
    privateRepos: true,
    teamSeats: true,
  },
};

function activePlanSlug(subscription: any): string | null {
  if (!subscription || !Array.isArray(subscription.subscriptionItems)) return null;
  const item = subscription.subscriptionItems.find((value: any) =>
    value?.status === 'active' && typeof value?.plan?.slug === 'string' && !value?.plan?.isDefault,
  );
  return item?.plan?.slug ?? null;
}

export async function resolvePlan(env: Env, identity: AuthIdentity, forceRefresh = false): Promise<PlanLimits> {
  if (!forceRefresh) {
    const cached = await env.DB.prepare('SELECT plan_id, checked_at FROM billing_cache WHERE owner=?').bind(identity.ownerId).first<{ plan_id: PlanId; checked_at: string }>();
    if (cached && Date.now() - Date.parse(cached.checked_at) < 5 * 60_000 && PLANS[cached.plan_id]) return PLANS[cached.plan_id];
  }
  if (env.ALLOW_DEV_AUTH === 'true') {
    const forced = identity.userId.match(/^dev:(hobby|pro|team):/)?.[1] as PlanId | undefined;
    if (forced) return PLANS[forced];
  }
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) return PLANS.hobby;

  let selected: PlanId = 'hobby';
  try {
    const client = clerkClientFor(env);
    const subscription = identity.orgId
      ? await client.billing.getOrganizationBillingSubscription(identity.orgId)
      : await client.billing.getUserBillingSubscription(identity.userId);
    const slug = activePlanSlug(subscription);
    if (slug === (env.CLERK_TEAM_PLAN_SLUG || 'team')) selected = 'team';
    else if (slug === (env.CLERK_PRO_PLAN_SLUG || 'pro')) selected = 'pro';
  } catch {
    // Billing lookup failure is fail-closed to Hobby limits, not an auth bypass.
  }
  await env.DB.prepare(`
    INSERT INTO billing_cache (owner, plan_id, checked_at) VALUES (?, ?, ?)
    ON CONFLICT(owner) DO UPDATE SET plan_id=excluded.plan_id, checked_at=excluded.checked_at
  `).bind(identity.ownerId, selected, new Date().toISOString()).run();
  return PLANS[selected];
}

export async function resolvePlanForOwner(env: Env, owner: string, ownerOrg: string | null): Promise<PlanLimits> {
  return resolvePlan(env, { userId: ownerOrg ? 'server-owner' : owner, orgId: ownerOrg, ownerId: owner });
}

export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function readUsage(env: Env, owner: string) {
  const month = monthKey();
  const row = await env.DB.prepare(
    'SELECT requests, builds FROM usage_monthly WHERE owner=? AND month=?',
  ).bind(owner, month).first<{ requests: number; builds: number }>();
  return { month, requests: row?.requests ?? 0, builds: row?.builds ?? 0 };
}

export async function incrementUsage(env: Env, owner: string, field: 'requests' | 'builds', amount = 1) {
  const month = monthKey();
  const requests = field === 'requests' ? amount : 0;
  const builds = field === 'builds' ? amount : 0;
  await env.DB.prepare(`
    INSERT INTO usage_monthly (owner, month, requests, builds, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner, month) DO UPDATE SET
      requests = requests + excluded.requests,
      builds = builds + excluded.builds,
      updated_at = excluded.updated_at
  `).bind(owner, month, requests, builds, new Date().toISOString()).run();
}

export async function deploymentCount(env: Env, owner: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM servers WHERE owner=? AND enabled=1',
  ).bind(owner).first<{ count: number }>();
  return Number(row?.count ?? 0);
}
