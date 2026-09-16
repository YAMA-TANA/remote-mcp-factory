export type PicoSvcProductSlug =
  | 'mcp'
  | 'mock'
  | 'hooks'
  | 'rss'
  | 'mail'
  | 'shot'
  | 'fetch'
  | 'qr'
  | 'cron'
  | 'functions'
  | 'json'
  | 'files'
  | 'license'
  | 'flags'
  | 'monitor'
  | 'forms';

export type PicoSvcTier = 'free' | 'tiny' | 'pro';
export type ProductStatus = 'active' | 'planned';

export interface TierDefinition {
  displayName: 'Free' | 'Pico' | 'PicoPlus';
  priceUsdMonthly: number;
  limits: Record<string, number> | null;
}

export interface PicoSvcProduct {
  slug: PicoSvcProductSlug;
  name: string;
  role: string;
  status: ProductStatus;
  endpointHost: string;
  billingScope: 'product';
  bundleEligible: boolean;
  tiers: Record<PicoSvcTier, TierDefinition>;
  customPlan: { displayName: 'Custom'; pricing: 'contact'; contactPath: '/contact' };
}

export interface PicoSvcBundleDefinition {
  slug: string;
  name: string;
  status: 'active' | 'planned';
  priceUsdMonthly: number;
  grants: Partial<Record<PicoSvcProductSlug, PicoSvcTier>>;
}

const ALL_PRODUCT_SLUGS: PicoSvcProductSlug[] = [
  'mcp', 'mock', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr',
  'cron', 'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
];

function tiers(
  freeLimits: Record<string, number> | null,
  picoLimits: Record<string, number> | null,
  picoPlusLimits: Record<string, number> | null,
): Record<PicoSvcTier, TierDefinition> {
  return {
    free: { displayName: 'Free', priceUsdMonthly: 0, limits: freeLimits },
    tiny: { displayName: 'Pico', priceUsdMonthly: 1, limits: picoLimits },
    pro: { displayName: 'PicoPlus', priceUsdMonthly: 5, limits: picoPlusLimits },
  };
}

const product = (
  definition: Omit<PicoSvcProduct, 'billingScope' | 'bundleEligible' | 'customPlan'>,
): PicoSvcProduct => ({
  ...definition,
  billingScope: 'product',
  bundleEligible: true,
  customPlan: { displayName: 'Custom', pricing: 'contact', contactPath: '/contact' },
});

function grantAll(tier: PicoSvcTier): Partial<Record<PicoSvcProductSlug, PicoSvcTier>> {
  return Object.fromEntries(ALL_PRODUCT_SLUGS.map((slug) => [slug, tier])) as Partial<Record<PicoSvcProductSlug, PicoSvcTier>>;
}

export const PICOSVC_BILLING_MODEL = {
  mode: 'per-product' as const,
  currency: 'USD' as const,
  billingPeriod: 'month' as const,
  description: 'Every PicoSvc service uses the same paid pricing: Pico is $1/month, PicoPlus is $5/month, and larger/custom usage is handled by contact. Bundles grant the same tier across the suite.',
  tierLabels: { free: 'Free', tiny: 'Pico', pro: 'PicoPlus' } as const,
  customPlan: { name: 'Custom', pricing: 'contact' as const, contactPath: '/contact' },
  bundlesSupported: true,
};

export const PICOSVC_BUNDLES: PicoSvcBundleDefinition[] = [
  { slug: 'bundle-pico', name: 'Bundle Pico', status: 'active', priceUsdMonthly: 5, grants: grantAll('tiny') },
  { slug: 'bundle-pro', name: 'Bundle Pro', status: 'active', priceUsdMonthly: 22, grants: grantAll('pro') },
];

export const PICOSVC_PRODUCTS: PicoSvcProduct[] = [
  product({ slug: 'mcp', name: 'PicoSvc MCP', role: 'MCP hosting / stdio-to-Remote conversion', status: 'active', endpointHost: 'mcp.picosvc.com', tiers: tiers({ mcps: 1 }, { mcps: 5 }, { mcps: 25 }) }),
  product({ slug: 'mock', name: 'PicoSvc Mock', role: 'Mock API', status: 'active', endpointHost: 'mock.picosvc.com', tiers: tiers({ endpoints: 1 }, { endpoints: 10 }, { endpoints: 100 }) }),
  product({ slug: 'hooks', name: 'PicoSvc Hooks', role: 'Webhook inbox / replay', status: 'active', endpointHost: 'hooks.picosvc.com', tiers: tiers({ events: 500 }, { events: 10_000 }, { events: 100_000 }) }),
  product({ slug: 'rss', name: 'PicoSvc RSS', role: 'Web to RSS', status: 'active', endpointHost: 'rss.picosvc.com', tiers: tiers({ feeds: 3 }, { feeds: 20 }, { feeds: 100 }) }),
  product({ slug: 'mail', name: 'PicoSvc Mail', role: 'Email to Webhook', status: 'active', endpointHost: 'in.picosvc.com', tiers: tiers({ routes: 1, mails: 100 }, { routes: 5, mails: 2_000 }, { routes: 25, mails: 20_000 }) }),
  product({ slug: 'shot', name: 'PicoSvc Shot', role: 'Screenshot / PDF', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers({ shots: 20 }, { shots: 300 }, { shots: 1_500 }) }),
  product({ slug: 'fetch', name: 'PicoSvc Fetch', role: 'URL to Markdown / metadata', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers({ requests: 20 }, { requests: 1_000 }, { requests: 10_000 }) }),
  product({ slug: 'qr', name: 'PicoSvc QR', role: 'Dynamic QR / redirect', status: 'active', endpointHost: 'qr.picosvc.com', tiers: tiers({ qrs: 5 }, { qrs: 100 }, { qrs: 1_000 }) }),
  product({ slug: 'cron', name: 'PicoSvc Cron', role: 'Cron execution / monitoring', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers({ jobs: 1, runs: 100 }, { jobs: 10, runs: 5_000 }, { jobs: 50, runs: 25_000 }) }),
  product({ slug: 'functions', name: 'PicoSvc Functions', role: 'Tiny serverless functions', status: 'active', endpointHost: 'fn.picosvc.com', tiers: tiers({ functions: 1, invocations: 1_000 }, { functions: 10, invocations: 100_000 }, { functions: 50, invocations: 500_000 }) }),
  product({ slug: 'json', name: 'PicoSvc JSON', role: 'JSON API / tiny database', status: 'active', endpointHost: 'json.picosvc.com', tiers: tiers({ stores: 1, requests: 1_000 }, { stores: 10, requests: 100_000 }, { stores: 50, requests: 500_000 }) }),
  product({ slug: 'files', name: 'PicoSvc Files', role: 'R2-backed file delivery', status: 'active', endpointHost: 'files.picosvc.com', tiers: tiers({ files: 10 }, { files: 500 }, { files: 5_000 }) }),
  product({ slug: 'license', name: 'PicoSvc License', role: 'License key validation', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers({ keys: 10, validations: 1_000 }, { keys: 1_000, validations: 100_000 }, { keys: 10_000, validations: 500_000 }) }),
  product({ slug: 'flags', name: 'PicoSvc Flags', role: 'Feature flags / remote config', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers({ flags: 5, requests: 5_000 }, { flags: 100, requests: 500_000 }, { flags: 1_000, requests: 2_000_000 }) }),
  product({ slug: 'monitor', name: 'PicoSvc Monitor', role: 'Web page change monitoring', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers({ monitors: 1, checks: 100 }, { monitors: 20, checks: 10_000 }, { monitors: 100, checks: 50_000 }) }),
  product({ slug: 'forms', name: 'PicoSvc Forms', role: 'Form backend', status: 'active', endpointHost: 'forms.picosvc.com', tiers: tiers({ forms: 1, submissions: 100 }, { forms: 10, submissions: 10_000 }, { forms: 100, submissions: 100_000 }) }),
];

export const PICOSVC_PRODUCT_MAP = new Map(PICOSVC_PRODUCTS.map((item) => [item.slug, item] as const));
