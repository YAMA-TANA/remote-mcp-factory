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
  priceUsdMonthly: number | null;
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
}

export interface PicoSvcBundleDefinition {
  slug: string;
  name: string;
  status: 'active' | 'planned';
  priceUsdMonthly: number | null;
  grants: Partial<Record<PicoSvcProductSlug, PicoSvcTier>>;
}

const plannedTiers = (): Record<PicoSvcTier, TierDefinition> => ({
  free: { priceUsdMonthly: 0, limits: null },
  tiny: { priceUsdMonthly: null, limits: null },
  pro: { priceUsdMonthly: null, limits: null },
});

const product = (
  definition: Omit<PicoSvcProduct, 'billingScope' | 'bundleEligible'>,
): PicoSvcProduct => ({ ...definition, billingScope: 'product', bundleEligible: true });

export const PICOSVC_BILLING_MODEL = {
  mode: 'per-product' as const,
  description: 'Each PicoSvc product has its own subscription and quota. Bundles may grant multiple product entitlements.',
  bundlesSupported: true,
};

// Bundle checkout/pricing is intentionally not invented here. When a concrete bundle
// is launched, add it to this catalog and have the billing adapter write the matching
// bundle_entitlements rows.
export const PICOSVC_BUNDLES: PicoSvcBundleDefinition[] = [];

export const PICOSVC_PRODUCTS: PicoSvcProduct[] = [
  product({
    slug: 'mcp',
    name: 'PicoSvc MCP',
    role: 'MCP hosting / stdio-to-Remote conversion',
    status: 'active',
    endpointHost: 'mcp.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { mcps: 1 } },
      tiny: { priceUsdMonthly: 1, limits: { mcps: 5 } },
      pro: { priceUsdMonthly: 3, limits: { mcps: 25 } },
    },
  }),
  product({
    slug: 'mock',
    name: 'PicoSvc Mock',
    role: 'Mock API',
    status: 'active',
    endpointHost: 'mock.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { endpoints: 1 } },
      tiny: { priceUsdMonthly: 1, limits: { endpoints: 10 } },
      pro: { priceUsdMonthly: 3, limits: { endpoints: 100 } },
    },
  }),
  product({
    slug: 'hooks',
    name: 'PicoSvc Hooks',
    role: 'Webhook inbox / replay',
    status: 'planned',
    endpointHost: 'hooks.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { events: 500 } },
      tiny: { priceUsdMonthly: null, limits: { events: 10_000 } },
      pro: { priceUsdMonthly: null, limits: { events: 100_000 } },
    },
  }),
  product({
    slug: 'rss',
    name: 'PicoSvc RSS',
    role: 'Web to RSS',
    status: 'planned',
    endpointHost: 'rss.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { feeds: 3 } },
      tiny: { priceUsdMonthly: null, limits: { feeds: 20 } },
      pro: { priceUsdMonthly: null, limits: { feeds: 100 } },
    },
  }),
  product({
    slug: 'mail',
    name: 'PicoSvc Mail',
    role: 'Email to Webhook',
    status: 'planned',
    endpointHost: 'in.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { mails: 100 } },
      tiny: { priceUsdMonthly: null, limits: { mails: 2_000 } },
      pro: { priceUsdMonthly: null, limits: { mails: 20_000 } },
    },
  }),
  product({
    slug: 'shot',
    name: 'PicoSvc Shot',
    role: 'Screenshot / PDF',
    status: 'planned',
    endpointHost: 'api.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { shots: 20 } },
      tiny: { priceUsdMonthly: null, limits: { shots: 300 } },
      pro: { priceUsdMonthly: null, limits: { shots: 1_500 } },
    },
  }),
  product({
    slug: 'fetch',
    name: 'PicoSvc Fetch',
    role: 'URL to Markdown / metadata',
    status: 'planned',
    endpointHost: 'api.picosvc.com',
    tiers: plannedTiers(),
  }),
  product({
    slug: 'qr',
    name: 'PicoSvc QR',
    role: 'Dynamic QR / redirect',
    status: 'planned',
    endpointHost: 'qr.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { qrs: 5 } },
      tiny: { priceUsdMonthly: null, limits: { qrs: 100 } },
      pro: { priceUsdMonthly: null, limits: { qrs: 1_000 } },
    },
  }),
  product({ slug: 'cron', name: 'PicoSvc Cron', role: 'Cron execution / monitoring', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() }),
  product({ slug: 'functions', name: 'PicoSvc Functions', role: 'Tiny serverless functions', status: 'planned', endpointHost: 'fn.picosvc.com', tiers: plannedTiers() }),
  product({ slug: 'json', name: 'PicoSvc JSON', role: 'JSON API / tiny database', status: 'planned', endpointHost: 'json.picosvc.com', tiers: plannedTiers() }),
  product({ slug: 'files', name: 'PicoSvc Files', role: 'R2-backed file delivery', status: 'planned', endpointHost: 'files.picosvc.com', tiers: plannedTiers() }),
  product({ slug: 'license', name: 'PicoSvc License', role: 'License key validation', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() }),
  product({ slug: 'flags', name: 'PicoSvc Flags', role: 'Feature flags / remote config', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() }),
  product({ slug: 'monitor', name: 'PicoSvc Monitor', role: 'Web page change monitoring', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() }),
  product({ slug: 'forms', name: 'PicoSvc Forms', role: 'Form backend', status: 'planned', endpointHost: 'forms.picosvc.com', tiers: plannedTiers() }),
];

export const PICOSVC_PRODUCT_MAP = new Map(PICOSVC_PRODUCTS.map((item) => [item.slug, item] as const));
