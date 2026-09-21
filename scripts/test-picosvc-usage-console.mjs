import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterUsage, readUsageReport, thresholdFor, usageCsv } from '../web/app/usage/usage-model.ts';
const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const raw = { month: '2026-09', ownerId: 'private-owner', secret: '=HYPERLINK("https://evil.example")', products: [
  { slug: 'mcp', name: 'PicoSvc MCP', tier: 'free', dimensions: [
    { metric: 'sandboxMcps', kind: 'inventory', used: 0, limit: 0, percent: 0, threshold: null },
    { metric: 'requests', kind: 'monthly', used: 450, limit: 500, percent: 90, threshold: 90 },
    { metric: 'mcps', kind: 'inventory', used: 1, limit: 1, percent: 100, threshold: 100 },
    { metric: 'sandboxActiveMinutes', kind: 'monthly', used: 0, limit: 0, percent: 0, threshold: null },
  ] },
  { slug: 'fetch', name: 'Fetch', tier: 'tiny', dimensions: [ { metric: 'requests', kind: 'monthly', used: 700, limit: 1000, percent: 70, threshold: 70 }, { metric: 'refreshMinutes', kind: 'policy', used: null, limit: 60, percent: null, threshold: null } ] },
] };
const report = readUsageReport(raw);
assert.equal(thresholdFor(0, 0), null, 'zero capacity with zero usage is not an alert');
assert.equal(thresholdFor(1, 0), 100, 'usage beyond a zero limit is an alert');
assert.equal(thresholdFor(69, 100), null);
assert.equal(thresholdFor(70, 100), 70);
assert.equal(thresholdFor(90, 100), 90);
assert.equal(thresholdFor(100, 100), 100);
assert.equal(report.products[0].dimensions[0].percent, 0);
assert.equal(report.products[0].dimensions[0].threshold, null);
assert.deepEqual(filterUsage(report, '', 'attention').map(p => p.dimensions.length), [2, 1]);
assert.deepEqual(filterUsage(report, '', 'exhausted').map(p => p.slug), ['mcp']);
assert.deepEqual(filterUsage(report, 'FETCH', 'all').map(p => p.slug), ['fetch']);
assert.deepEqual(filterUsage(report, 'sandboxMcps', 'all').map(p => p.dimensions.map(d => d.metric)), [['sandboxMcps']]);
assert.deepEqual(filterUsage(report, 'missing', 'all'), []);
const csv = usageCsv(report, filterUsage(report, '', 'attention'));
assert.ok(csv.startsWith('\ufeff"month","product"'), 'CSV has BOM and explicit metadata schema');
assert.ok(csv.includes('"mcp","free","requests","monthly","450","500"'));
assert.ok(!csv.includes('sandboxMcps') && !csv.includes('refreshMinutes'), 'Export only filtered metrics');
assert.ok(!csv.includes(raw.ownerId) && !csv.includes(raw.secret), 'Never export owner IDs, opaque fields or secrets');
assert.throws(() => readUsageReport({ ...raw, month: '../../bad' }), /Invalid usage response/);
assert.throws(() => readUsageReport({ ...raw, products: [...raw.products, raw.products[0]] }), /Invalid usage product/);
assert.throws(() => readUsageReport({ ...raw, products: [{ ...raw.products[0], slug: 'not-a-product' }] }), /Invalid usage product/);
assert.throws(() => readUsageReport({ ...raw, products: [{ ...raw.products[0], dimensions: [{ metric: 'requests', kind: 'monthly', used: -1, limit: 100 }] }] }), /Invalid usage count/);
assert.throws(() => readUsageReport({ ...raw, products: [{ ...raw.products[0], dimensions: [{ metric: 'requests', kind: 'monthly', used: 1, limit: '100' }] }] }), /Invalid usage limit/);
const consoleSource = source('web/app/usage/usage-console.tsx');
const page = source('web/app/usage/page.tsx');
const navigation = source('web/app/customer-workspace-header.tsx');
assert.match(consoleSource, /filterUsage\(report, query, filter\)/, 'Filters must be derived from the owner-scoped report');
assert.match(consoleSource, /usageCsv\(report, visible\)/, 'Only filtered dimensions are exported');
assert.match(consoleSource, /localizedHref\(`\/\$\{product\.slug\}\/app`\)/, 'Each product links to its existing workspace');
assert.match(page, /readUsageReport\(payload\)/, 'Validate authenticated backend responses before rendering');
assert.match(page, /requestVersion\.current/, 'Out-of-order refreshes are ignored');
assert.match(navigation, /\/usage\//, 'Existing service workspaces link to the usage console');
assert.match(source('web/app/usage/usage-console.css'), /@media\(max-width:640px\)/, 'Console must support narrow screens');
console.log('PicoSvc usage console: thresholds, zero limits, filters, CSV privacy, malformed data, auth wiring and responsive UI OK.');
