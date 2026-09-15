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
  priceUsdMonthly: number;
  limits: Record<string, number> | null;
}

export interface PicoSvcProduct {
  slug: PicoSvcProductSlug;
  name: string;
  role: string;
  status: ProductStatus;
  endpointHost: string;
  tiers: Record<PicoSvcTier, TierDefinition>;
}

const plannedTiers = (): Record<PicoSvcTier, TierDefinition> => ({
  free: { priceUsdMonthly: 0, limits: null },
  tiny: { priceUsdMonthly: 1, limits: null },
  pro: { priceUsdMonthly: 3, limits: null },
});

export const PICOSVC_PRODUCTS: PicoSvcProduct[] = [
  {
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
  },
  {
    slug: 'mock',
    name: 'PicoSvc Mock',
    role: 'Mock API',
    status: 'planned',
    endpointHost: 'mock.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { endpoints: 1 } },
      tiny: { priceUsdMonthly: 1, limits: { endpoints: 10 } },
      pro: { priceUsdMonthly: 3, limits: { endpoints: 100 } },
    },
  },
  {
    slug: 'hooks',
    name: 'PicoSvc Hooks',
    role: 'Webhook inbox / replay',
    status: 'planned',
    endpointHost: 'hooks.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { events: 500 } },
      tiny: { priceUsdMonthly: 1, limits: { events: 10_000 } },
      pro: { priceUsdMonthly: 3, limits: { events: 100_000 } },
    },
  },
  {
    slug: 'rss',
    name: 'PicoSvc RSS',
    role: 'Web to RSS',
    status: 'planned',
    endpointHost: 'rss.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { feeds: 3 } },
      tiny: { priceUsdMonthly: 1, limits: { feeds: 20 } },
      pro: { priceUsdMonthly: 3, limits: { feeds: 100 } },
    },
  },
  {
    slug: 'mail',
    name: 'PicoSvc Mail',
    role: 'Email to Webhook',
    status: 'planned',
    endpointHost: 'in.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { mails: 100 } },
      tiny: { priceUsdMonthly: 1, limits: { mails: 2_000 } },
      pro: { priceUsdMonthly: 3, limits: { mails: 20_000 } },
    },
  },
  {
    slug: 'shot',
    name: 'PicoSvc Shot',
    role: 'Screenshot / PDF',
    status: 'planned',
    endpointHost: 'api.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { shots: 20 } },
      tiny: { priceUsdMonthly: 1, limits: { shots: 300 } },
      pro: { priceUsdMonthly: 3, limits: { shots: 1_500 } },
    },
  },
  {
    slug: 'fetch',
    name: 'PicoSvc Fetch',
    role: 'URL to Markdown / metadata',
    status: 'planned',
    endpointHost: 'api.picosvc.com',
    tiers: plannedTiers(),
  },
  {
    slug: 'qr',
    name: 'PicoSvc QR',
    role: 'Dynamic QR / redirect',
    status: 'planned',
    endpointHost: 'qr.picosvc.com',
    tiers: {
      free: { priceUsdMonthly: 0, limits: { qrs: 5 } },
      tiny: { priceUsdMonthly: 1, limits: { qrs: 100 } },
      pro: { priceUsdMonthly: 3, limits: { qrs: 1_000 } },
    },
  },
  { slug: 'cron', name: 'PicoSvc Cron', role: 'Cron execution / monitoring', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() },
  { slug: 'functions', name: 'PicoSvc Functions', role: 'Tiny serverless functions', status: 'planned', endpointHost: 'fn.picosvc.com', tiers: plannedTiers() },
  { slug: 'json', name: 'PicoSvc JSON', role: 'JSON API / tiny database', status: 'planned', endpointHost: 'json.picosvc.com', tiers: plannedTiers() },
  { slug: 'files', name: 'PicoSvc Files', role: 'R2-backed file delivery', status: 'planned', endpointHost: 'files.picosvc.com', tiers: plannedTiers() },
  { slug: 'license', name: 'PicoSvc License', role: 'License key validation', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() },
  { slug: 'flags', name: 'PicoSvc Flags', role: 'Feature flags / remote config', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() },
  { slug: 'monitor', name: 'PicoSvc Monitor', role: 'Web page change monitoring', status: 'planned', endpointHost: 'api.picosvc.com', tiers: plannedTiers() },
  { slug: 'forms', name: 'PicoSvc Forms', role: 'Form backend', status: 'planned', endpointHost: 'forms.picosvc.com', tiers: plannedTiers() },
];

export const PICOSVC_PRODUCT_MAP = new Map(PICOSVC_PRODUCTS.map((product) => [product.slug, product] as const));
