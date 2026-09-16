import assert from 'node:assert/strict';
import {
  PICOSVC_BILLING_MODEL,
  PICOSVC_BUNDLES,
  PICOSVC_PRODUCTS,
} from '../src/picosvc/catalog.ts';
import { PICOSVC_QUOTAS } from '../web/app/pricing-data.ts';

assert.equal(PICOSVC_BILLING_MODEL.currency, 'USD');
assert.equal(PICOSVC_BILLING_MODEL.billingPeriod, 'month');
assert.deepEqual(PICOSVC_BILLING_MODEL.tierLabels, {
  free: 'Free',
  tiny: 'Pico',
  pro: 'PicoPlus',
});
assert.equal(PICOSVC_BILLING_MODEL.customPlan.pricing, 'contact');

assert.ok(PICOSVC_PRODUCTS.length > 0);
for (const product of PICOSVC_PRODUCTS) {
  assert.equal(product.tiers.free.priceUsdMonthly, 0, `${product.slug}: Free must be $0`);
  assert.equal(product.tiers.tiny.displayName, 'Pico', `${product.slug}: tiny must display as Pico`);
  assert.equal(product.tiers.tiny.priceUsdMonthly, 1, `${product.slug}: Pico must be $1/month`);
  assert.equal(product.tiers.pro.displayName, 'PicoPlus', `${product.slug}: pro must display as PicoPlus`);
  assert.equal(product.tiers.pro.priceUsdMonthly, 5, `${product.slug}: PicoPlus must be $5/month`);
  assert.equal(product.customPlan.pricing, 'contact', `${product.slug}: larger usage must be contact`);
}

const expectedLimits = {
  mcp: [
    { mcps: 1, sandboxMcps: 0, sandboxActiveMinutes: 0, requests: 5_000, builds: 20 },
    { mcps: 5, sandboxMcps: 0, sandboxActiveMinutes: 0, requests: 200_000, builds: 200 },
    { mcps: 25, sandboxMcps: 2, sandboxActiveMinutes: 10_000, requests: 500_000, builds: 1_000 },
  ],
  mock: [
    { endpoints: 1, rules: 5, history: 100, requests: 1_500 },
    { endpoints: 10, rules: 50, history: 1_000, requests: 25_000 },
    { endpoints: 100, rules: 500, history: 10_000, requests: 250_000 },
  ],
  hooks: [
    { inboxes: 1, events: 500, replays: 50, history: 100, bodyBytes: 64 * 1024 },
    { inboxes: 5, events: 10_000, replays: 1_000, history: 1_000, bodyBytes: 128 * 1024 },
    { inboxes: 25, events: 100_000, replays: 10_000, history: 10_000, bodyBytes: 256 * 1024 },
  ],
  rss: [
    { feeds: 3, checks: 150, requests: 10_000, refreshMinutes: 1_440, entriesPerFeed: 5 },
    { feeds: 20, checks: 6_000, requests: 100_000, refreshMinutes: 180, entriesPerFeed: 15 },
    { feeds: 100, checks: 160_000, requests: 1_000_000, refreshMinutes: 30, entriesPerFeed: 20 },
  ],
  mail: [
    { routes: 1, mails: 100, history: 100 },
    { routes: 5, mails: 2_000, history: 1_000 },
    { routes: 25, mails: 20_000, history: 5_000 },
  ],
  shot: [{ shots: 50 }, { shots: 300 }, { shots: 2_000 }],
  fetch: [{ requests: 100 }, { requests: 1_000 }, { requests: 5_000 }],
  qr: [
    { qrs: 5, scans: 1_000 },
    { qrs: 50, scans: 10_000 },
    { qrs: 300, scans: 150_000 },
  ],
  cron: [
    { jobs: 1, runs: 2_000, history: 100 },
    { jobs: 10, runs: 30_000, history: 1_000 },
    { jobs: 50, runs: 250_000, history: 10_000 },
  ],
  functions: [
    { functions: 1, invocations: 10_000 },
    { functions: 5, invocations: 100_000 },
    { functions: 20, invocations: 1_000_000 },
  ],
  json: [
    { stores: 1, documents: 100, storageBytes: 10 * 1024 * 1024, requests: 10_000 },
    { stores: 10, documents: 1_000, storageBytes: 50 * 1024 * 1024, requests: 100_000 },
    { stores: 50, documents: 10_000, storageBytes: 500 * 1024 * 1024, requests: 1_000_000 },
  ],
  files: [
    { spaces: 1, files: 20, storageBytes: 100 * 1024 * 1024, downloads: 10_000 },
    { spaces: 5, files: 1_000, storageBytes: 1024 * 1024 * 1024, downloads: 100_000 },
    { spaces: 25, files: 10_000, storageBytes: 10 * 1024 * 1024 * 1024, downloads: 1_000_000 },
  ],
  license: [
    { projects: 1, keys: 10, validations: 1_000 },
    { projects: 3, keys: 100, validations: 25_000 },
    { projects: 10, keys: 1_000, validations: 250_000 },
  ],
  flags: [
    { projects: 1, flags: 10, requests: 50_000 },
    { projects: 3, flags: 100, requests: 250_000 },
    { projects: 10, flags: 500, requests: 1_000_000 },
  ],
  monitor: [
    { monitors: 1, checks: 750, minIntervalMinutes: 60 },
    { monitors: 20, checks: 20_000, minIntervalMinutes: 15 },
    { monitors: 100, checks: 100_000, minIntervalMinutes: 5 },
  ],
  forms: [
    { forms: 3, submissions: 100, history: 100 },
    { forms: 20, submissions: 2_000, history: 1_000 },
    { forms: 100, submissions: 20_000, history: 5_000 },
  ],
};

for (const product of PICOSVC_PRODUCTS) {
  const expected = expectedLimits[product.slug];
  assert.ok(expected, `${product.slug}: benchmarked quotas must be locked in tests`);
  assert.deepEqual(product.tiers.free.limits, expected[0], `${product.slug}: Free quota mismatch`);
  assert.deepEqual(product.tiers.tiny.limits, expected[1], `${product.slug}: Pico quota mismatch`);
  assert.deepEqual(product.tiers.pro.limits, expected[2], `${product.slug}: PicoPlus quota mismatch`);
}

assert.equal(PICOSVC_QUOTAS.length, PICOSVC_PRODUCTS.length, 'Public pricing page must list every PicoSvc service');
for (const product of PICOSVC_PRODUCTS) {
  const displayName = product.name.replace(/^PicoSvc\s+/, '');
  assert.ok(PICOSVC_QUOTAS.some((row) => row.service === displayName), `${product.slug}: missing public quota row`);
}

const mcpPublicQuota = PICOSVC_QUOTAS.find((row) => row.service === 'MCP');
assert.match(mcpPublicQuota?.free || '', /Edge MCP/, 'Free MCP must be advertised as Edge-only');
assert.match(mcpPublicQuota?.pico || '', /200k req/, 'Pico MCP must publish the margin-safe request cap');
assert.match(mcpPublicQuota?.picoPlus || '', /2 Sandbox slots/, 'PicoPlus must publish its Sandbox slot limit');
assert.match(mcpPublicQuota?.picoPlus || '', /10k active min/, 'PicoPlus must publish its Sandbox active-minute cap');
assert.match(mcpPublicQuota?.picoPlus || '', /500k req/, 'PicoPlus MCP must publish the margin-safe request cap');
assert.equal(PICOSVC_PRODUCTS.find((product) => product.slug === 'flags')?.name, 'PicoSvc Config', 'Remote Config must not be marketed as feature targeting');

const bundlePico = PICOSVC_BUNDLES.find((bundle) => bundle.slug === 'bundle-pico');
const bundlePro = PICOSVC_BUNDLES.find((bundle) => bundle.slug === 'bundle-pro');
assert.ok(bundlePico, 'Bundle Pico must exist');
assert.ok(bundlePro, 'Bundle Pro must exist');
assert.equal(bundlePico.name, 'Bundle Pico');
assert.equal(bundlePico.priceUsdMonthly, 5);
assert.equal(bundlePico.status, 'active');
assert.equal(bundlePro.name, 'Bundle Pro');
assert.equal(bundlePro.priceUsdMonthly, 22);
assert.equal(bundlePro.status, 'active');

for (const product of PICOSVC_PRODUCTS) {
  assert.equal(bundlePico.grants[product.slug], 'tiny', `Bundle Pico must grant Pico for ${product.slug}`);
  assert.equal(bundlePro.grants[product.slug], 'pro', `Bundle Pro must grant PicoPlus for ${product.slug}`);
}

console.log(`Pricing OK: ${PICOSVC_PRODUCTS.length} products with benchmarked quotas, Pico $1, PicoPlus $5, Bundle Pico $5, Bundle Pro $22.`);
