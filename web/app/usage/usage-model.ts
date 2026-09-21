/** Owner-scoped usage response: only allowlisted, non-secret data reaches the UI/export. */
export const PRODUCT_SLUGS = ['mcp','mock','hooks','rss','mail','shot','fetch','qr','cron','functions','json','files','license','flags','monitor','forms'] as const;
export type ProductSlug = typeof PRODUCT_SLUGS[number];
export type UsageKind = 'monthly' | 'inventory' | 'storage' | 'policy';
export type UsageDimension = { metric: string; kind: UsageKind; used: number | null; limit: number; remaining: number | null; percent: number | null; threshold: 70 | 90 | 100 | null };
export type UsageProduct = { slug: ProductSlug; name: string; tier: 'free' | 'tiny' | 'pro'; dimensions: UsageDimension[] };
export type UsageReport = { month: string; products: UsageProduct[] };
export type UsageFilter = 'all' | 'attention' | 'exhausted';
const PRODUCTS = new Set<string>(PRODUCT_SLUGS);
const KINDS = new Set<string>(['monthly','inventory','storage','policy']);
const TIERS = new Set<string>(['free','tiny','pro']);
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function count(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; }
export function thresholdFor(used: number, limit: number): 70 | 90 | 100 | null {
  if (limit === 0) return used > 0 ? 100 : null;
  const ratio = used / limit;
  return ratio >= 1 ? 100 : ratio >= 0.9 ? 90 : ratio >= 0.7 ? 70 : null;
}
export function readUsageReport(raw: unknown): UsageReport {
  const body = record(raw);
  if (!body || typeof body.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) || !Array.isArray(body.products) || body.products.length > PRODUCT_SLUGS.length) throw new Error('Invalid usage response.');
  const seen = new Set<string>();
  const products: UsageProduct[] = body.products.map(entry => {
    const product = record(entry);
    if (!product || typeof product.slug !== 'string' || !PRODUCTS.has(product.slug) || seen.has(product.slug) || typeof product.name !== 'string' || product.name.length > 120 || !TIERS.has(String(product.tier)) || !Array.isArray(product.dimensions) || product.dimensions.length > 24) throw new Error('Invalid usage product.');
    seen.add(product.slug);
    const seenMetrics = new Set<string>();
    const dimensions: UsageDimension[] = product.dimensions.map(value => {
      const item = record(value);
      if (!item || typeof item.metric !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,47}$/.test(item.metric) || seenMetrics.has(item.metric) || typeof item.kind !== 'string' || !KINDS.has(item.kind)) throw new Error('Invalid usage dimension.');
      seenMetrics.add(item.metric);
      const limit = count(item.limit);
      if (limit === null) throw new Error('Invalid usage limit.');
      if (item.kind === 'policy') return { metric: item.metric, kind: 'policy', used: null, limit, remaining: null, percent: null, threshold: null };
      const used = count(item.used);
      if (used === null) throw new Error('Invalid usage count.');
      const percent = limit === 0 ? (used > 0 ? 100 : 0) : Math.round((used / limit) * 10000) / 100;
      return { metric: item.metric, kind: item.kind as UsageKind, used, limit, remaining: Math.max(0, limit - used), percent, threshold: thresholdFor(used, limit) };
    });
    return { slug: product.slug as ProductSlug, name: product.name, tier: product.tier as UsageProduct['tier'], dimensions };
  });
  return { month: body.month, products };
}
export function filterUsage(report: UsageReport, query: string, filter: UsageFilter): UsageProduct[] {
  const term = query.trim().toLocaleLowerCase().slice(0, 100);
  return report.products.flatMap(product => {
    const matchesProduct = `${product.name} ${product.slug}`.toLocaleLowerCase().includes(term);
    const dimensions = product.dimensions.filter(item => {
      if (filter === 'attention' && item.threshold === null) return false;
      if (filter === 'exhausted' && item.threshold !== 100) return false;
      return matchesProduct || item.metric.toLocaleLowerCase().includes(term);
    });
    return dimensions.length ? [{ ...product, dimensions }] : [];
  });
}
function csvCell(value: string | number): string {
  let text = String(value).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');
  // Neutralize formulas even if preceded by whitespace or Unicode direction/space marks.
  if (/^[\s\u200b-\u200f\u202a-\u202e\ufeff]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
/** Export strictly metadata; never include account IDs, user input, resource URLs or tokens. */
export function usageCsv(report: UsageReport, products: UsageProduct[]): string {
  const rows: (string | number)[][] = [['month','product','tier','metric','kind','used','limit','remaining','percent','threshold']];
  for (const product of products) for (const d of product.dimensions) rows.push([report.month, product.slug, product.tier, d.metric, d.kind, d.used ?? '', d.limit, d.remaining ?? '', d.percent ?? '', d.threshold ?? '']);
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
