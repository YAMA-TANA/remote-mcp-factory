import type { Env } from '../types.js';
import { PICOSVC_PRODUCTS, type PicoSvcProductSlug } from './catalog.js';
import { resolveProductTier } from './entitlements.js';
import { json, requireIdentity } from './service-utils.js';

/** Resource quantities are instantaneous; all other consumable counters are monthly. */
const RESOURCE_COUNTS: Partial<Record<PicoSvcProductSlug, Record<string, string>>> = {
  mcp: {
    mcps: 'SELECT COUNT(*) AS quantity FROM servers WHERE owner=?',
    sandboxMcps: "SELECT COUNT(*) AS quantity FROM servers WHERE owner=? AND detected_runtime LIKE 'sandbox-%' AND enabled=1",
  },
  mock: { endpoints: 'SELECT COUNT(*) AS quantity FROM mock_endpoints WHERE owner=?', rules: 'SELECT COUNT(*) AS quantity FROM mock_rules WHERE owner=?' },
  hooks: { inboxes: 'SELECT COUNT(*) AS quantity FROM webhook_inboxes WHERE owner=?' },
  rss: { feeds: 'SELECT COUNT(*) AS quantity FROM rss_feeds WHERE owner=?' },
  mail: { routes: 'SELECT COUNT(*) AS quantity FROM mail_routes WHERE owner=?' },
  qr: { qrs: 'SELECT COUNT(*) AS quantity FROM qr_links WHERE owner=?' },
  cron: { jobs: 'SELECT COUNT(*) AS quantity FROM cron_jobs WHERE owner=?' },
  functions: { functions: 'SELECT COUNT(*) AS quantity FROM function_apps WHERE owner=?' },
  json: {
    stores: 'SELECT COUNT(*) AS quantity FROM json_stores WHERE owner=?',
    documents: 'SELECT COUNT(*) AS quantity FROM json_documents d JOIN json_stores s ON s.id=d.store_id WHERE s.owner=?',
    storageBytes: 'SELECT COALESCE(SUM(LENGTH(CAST(d.value_json AS BLOB))),0) AS quantity FROM json_documents d JOIN json_stores s ON s.id=d.store_id WHERE s.owner=?',
  },
  files: {
    spaces: 'SELECT COUNT(*) AS quantity FROM file_spaces WHERE owner=?',
    files: 'SELECT COUNT(*) AS quantity FROM file_objects WHERE owner=?',
    storageBytes: 'SELECT COALESCE(SUM(size_bytes),0) AS quantity FROM file_objects WHERE owner=?',
  },
  license: { projects: 'SELECT COUNT(*) AS quantity FROM license_projects WHERE owner=?', keys: 'SELECT COUNT(*) AS quantity FROM license_keys WHERE owner=?' },
  flags: { projects: 'SELECT COUNT(*) AS quantity FROM flag_projects WHERE owner=?', flags: 'SELECT COUNT(*) AS quantity FROM feature_flags f JOIN flag_projects p ON p.id=f.project_id WHERE p.owner=?' },
  monitor: { monitors: 'SELECT COUNT(*) AS quantity FROM monitors WHERE owner=?' },
  forms: { forms: 'SELECT COUNT(*) AS quantity FROM forms WHERE owner=?' },
};

const POLICY_METRICS = new Set(['refreshMinutes', 'entriesPerFeed', 'bodyBytes', 'minIntervalMinutes']);
const THRESHOLDS = [70, 90, 100] as const;

export async function picoSvcUsageDashboard(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/picosvc/usage') return null;
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;
  const month = new Date().toISOString().slice(0, 7);
  const usageRows = await env.DB.prepare('SELECT product, metric, quantity FROM product_usage_monthly WHERE owner=? AND month=?')
    .bind(owner, month).all<{ product: string; metric: string; quantity: number }>();
  const monthly = new Map((usageRows.results || []).map((row) => [`${row.product}:${row.metric}`, Number(row.quantity)]));
  const products = [];
  const alerts = [];
  for (const product of PICOSVC_PRODUCTS) {
    const tier = await resolveProductTier(env, owner, product.slug);
    const dimensions = [];
    for (const [metric, limit] of Object.entries(product.tiers[tier].limits || {})) {
      if (POLICY_METRICS.has(metric)) {
        dimensions.push({ metric, kind: 'policy', used: null, limit, percent: null, threshold: null });
        continue;
      }
      const inventorySql = RESOURCE_COUNTS[product.slug]?.[metric];
      const count = inventorySql
        ? await env.DB.prepare(inventorySql).bind(owner).first<{ quantity: number }>()
        : null;
      const used = Math.max(0, Number(inventorySql ? count?.quantity || 0 : monthly.get(`${product.slug}:${metric}`) || 0));
      const percent = limit > 0 ? Math.round(used * 10000 / limit) / 100 : used > 0 ? 100 : 0;
      const threshold = [...THRESHOLDS].reverse().find((threshold) => percent >= threshold) || null;
      const kind = inventorySql ? (metric === 'storageBytes' ? 'storage' : 'inventory') : 'monthly';
      dimensions.push({ metric, kind, used, limit, remaining: Math.max(0, limit - used), percent, threshold });
      if (threshold !== null) alerts.push({ product: product.slug, metric, used, limit, percent, threshold });
    }
    products.push({ slug: product.slug, name: product.name, tier, dimensions });
  }
  return json({ ownerId: owner, month, products, alerts, thresholds: THRESHOLDS });
}
