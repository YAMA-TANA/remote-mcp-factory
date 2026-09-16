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

// Quotas are benchmarked against comparable developer tools and then capped for the
// marginal Cloudflare cost of the implementation. See docs/PRICING_BENCHMARKS.md.
// Product roles intentionally describe the currently implemented scope, not the full
// category represented by larger specialist platforms.
export const PICOSVC_PRODUCTS: PicoSvcProduct[] = [
  product({ slug: 'mcp', name: 'PicoSvc MCP', role: 'Edge-first MCP hosting / stdio-to-Remote conversion', status: 'active', endpointHost: 'mcp.picosvc.com', tiers: tiers(
    { mcps: 1, sandboxMcps: 0, sandboxActiveMinutes: 0, requests: 5_000, builds: 20 },
    { mcps: 5, sandboxMcps: 0, sandboxActiveMinutes: 0, requests: 250_000, builds: 200 },
    { mcps: 25, sandboxMcps: 2, sandboxActiveMinutes: 10_000, requests: 1_000_000, builds: 1_000 },
  ) }),
  product({ slug: 'mock', name: 'PicoSvc Mock', role: 'Static-rule Mock API', status: 'active', endpointHost: 'mock.picosvc.com', tiers: tiers(
    { endpoints: 1, requests: 1_500 },
    { endpoints: 10, requests: 25_000 },
    { endpoints: 100, requests: 250_000 },
  ) }),
  product({ slug: 'hooks', name: 'PicoSvc Hooks', role: 'Webhook inbox / manual replay', status: 'active', endpointHost: 'hooks.picosvc.com', tiers: tiers(
    { inboxes: 1, events: 500, replays: 50, history: 100, bodyBytes: 64 * 1024 },
    { inboxes: 5, events: 10_000, replays: 1_000, history: 1_000, bodyBytes: 128 * 1024 },
    { inboxes: 25, events: 100_000, replays: 10_000, history: 10_000, bodyBytes: 256 * 1024 },
  ) }),
  product({ slug: 'rss', name: 'PicoSvc RSS', role: 'Web page change to RSS', status: 'active', endpointHost: 'rss.picosvc.com', tiers: tiers(
    { feeds: 3, checks: 150, requests: 10_000, refreshMinutes: 1_440, entriesPerFeed: 5 },
    { feeds: 20, checks: 6_000, requests: 100_000, refreshMinutes: 180, entriesPerFeed: 15 },
    { feeds: 100, checks: 160_000, requests: 1_000_000, refreshMinutes: 30, entriesPerFeed: 20 },
  ) }),
  product({ slug: 'mail', name: 'PicoSvc Mail', role: 'Inbound email to webhook relay', status: 'active', endpointHost: 'picosvc.com', tiers: tiers(
    { routes: 1, mails: 100, history: 100 },
    { routes: 5, mails: 2_000, history: 1_000 },
    { routes: 25, mails: 20_000, history: 5_000 },
  ) }),
  product({ slug: 'shot', name: 'PicoSvc Shot', role: 'Browser screenshot / PDF capture', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers(
    { shots: 50 },
    { shots: 300 },
    { shots: 2_000 },
  ) }),
  product({ slug: 'fetch', name: 'PicoSvc Fetch', role: 'Single-URL Markdown / metadata extraction', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers(
    { requests: 100 },
    { requests: 1_000 },
    { requests: 5_000 },
  ) }),
  product({ slug: 'qr', name: 'PicoSvc QR', role: 'Dynamic QR redirect', status: 'active', endpointHost: 'qr.picosvc.com', tiers: tiers(
    { qrs: 5, scans: 1_000 },
    { qrs: 50, scans: 10_000 },
    { qrs: 300, scans: 150_000 },
  ) }),
  product({ slug: 'cron', name: 'PicoSvc Cron', role: 'Scheduled HTTP requests', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers(
    { jobs: 1, runs: 2_000, history: 100 },
    { jobs: 10, runs: 30_000, history: 1_000 },
    { jobs: 50, runs: 250_000, history: 10_000 },
  ) }),
  product({ slug: 'functions', name: 'PicoSvc Functions', role: 'Tiny edge JavaScript functions', status: 'active', endpointHost: 'fn.picosvc.com', tiers: tiers(
    { functions: 1, invocations: 10_000 },
    { functions: 5, invocations: 100_000 },
    { functions: 20, invocations: 1_000_000 },
  ) }),
  product({ slug: 'json', name: 'PicoSvc JSON', role: 'Token-protected JSON key/value API', status: 'active', endpointHost: 'json.picosvc.com', tiers: tiers(
    { stores: 1, documents: 100, storageBytes: 10 * 1024 * 1024, requests: 10_000 },
    { stores: 10, documents: 1_000, storageBytes: 50 * 1024 * 1024, requests: 100_000 },
    { stores: 50, documents: 10_000, storageBytes: 500 * 1024 * 1024, requests: 1_000_000 },
  ) }),
  product({ slug: 'files', name: 'PicoSvc Files', role: 'Tiny R2 object hosting', status: 'active', endpointHost: 'files.picosvc.com', tiers: tiers(
    { spaces: 1, files: 20, storageBytes: 100 * 1024 * 1024, downloads: 10_000 },
    { spaces: 5, files: 1_000, storageBytes: 1024 * 1024 * 1024, downloads: 100_000 },
    { spaces: 25, files: 10_000, storageBytes: 10 * 1024 * 1024 * 1024, downloads: 1_000_000 },
  ) }),
  product({ slug: 'license', name: 'PicoSvc License', role: 'License Key API', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers(
    { projects: 1, keys: 10, validations: 1_000 },
    { projects: 3, keys: 100, validations: 25_000 },
    { projects: 10, keys: 1_000, validations: 250_000 },
  ) }),
  product({ slug: 'flags', name: 'PicoSvc Config', role: 'Remote Config API', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers(
    { projects: 1, flags: 10, requests: 50_000 },
    { projects: 3, flags: 100, requests: 250_000 },
    { projects: 10, flags: 500, requests: 1_000_000 },
  ) }),
  product({ slug: 'monitor', name: 'PicoSvc Monitor', role: 'Web page hash-change monitor', status: 'active', endpointHost: 'api.picosvc.com', tiers: tiers(
    { monitors: 1, checks: 750, minIntervalMinutes: 60 },
    { monitors: 20, checks: 20_000, minIntervalMinutes: 15 },
    { monitors: 100, checks: 100_000, minIntervalMinutes: 5 },
  ) }),
  product({ slug: 'forms', name: 'PicoSvc Forms', role: 'Simple form submission backend', status: 'active', endpointHost: 'forms.picosvc.com', tiers: tiers(
    { forms: 3, submissions: 100, history: 100 },
    { forms: 20, submissions: 2_000, history: 1_000 },
    { forms: 100, submissions: 20_000, history: 5_000 },
  ) }),
];

export const PICOSVC_PRODUCT_MAP = new Map(PICOSVC_PRODUCTS.map((item) => [item.slug, item] as const));
