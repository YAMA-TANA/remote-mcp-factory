import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PICOSVC_PRODUCTS } from '../src/picosvc/catalog.ts';

const expected = [
  'mcp','mock','hooks','rss','mail','shot','fetch','qr','cron','functions','json','files','license','flags','monitor','forms',
];
assert.deepEqual(PICOSVC_PRODUCTS.map((product) => product.slug), expected);
assert.equal(PICOSVC_PRODUCTS.find((product) => product.slug === 'mail')?.endpointHost, 'picosvc.com', 'Mail must use the apex domain');
for (const product of PICOSVC_PRODUCTS) {
  assert.equal(product.status, 'active', `${product.slug} must be active`);
  assert.ok(product.tiers.free.limits && Object.keys(product.tiers.free.limits).length > 0, `${product.slug} needs Free limits`);
  assert.ok(product.tiers.tiny.limits && Object.keys(product.tiers.tiny.limits).length > 0, `${product.slug} needs Pico limits`);
  assert.ok(product.tiers.pro.limits && Object.keys(product.tiers.pro.limits).length > 0, `${product.slug} needs PicoPlus limits`);
}

const migration = readFileSync(new URL('../migrations/0010_picosvc_all_services.sql', import.meta.url), 'utf8');
for (const table of [
  'rss_feeds','rss_entries','mail_routes','mail_events','qr_links','cron_jobs','cron_runs','function_apps','json_stores','json_documents','file_spaces','file_objects','license_projects','license_keys','flag_projects','feature_flags','monitors','forms','form_submissions',
]) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `missing ${table}`);
}

const entry = readFileSync(new URL('../src/picosvc-entry.ts', import.meta.url), 'utf8');
assert.match(entry, /scheduled\s*\(/, 'scheduled handler required');
assert.match(entry, /email\s*\(/, 'email handler required');
const mailService = readFileSync(new URL('../src/picosvc/mail-service.ts', import.meta.url), 'utf8');
assert.match(mailService, /const MAIL_DOMAIN = 'picosvc\.com'/, 'Mail domain must be picosvc.com');
assert.match(mailService, /domain !== MAIL_DOMAIN/, 'Mail handler must reject other domains');
assert.doesNotMatch(mailService, /in\.picosvc\.com/, 'Legacy in.picosvc.com must not remain');
for (const runtime of ['qrRuntimeRoute','dataRuntimeRoute','functionRuntimeRoute','rssRuntimeRoute','hooksRuntimeRoute','mockRuntimeRoute']) {
  assert.match(entry, new RegExp(runtime), `missing runtime ${runtime}`);
}

const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
assert.match(wrangler, /"browser"\s*:\s*\{[\s\S]*?"binding"\s*:\s*"BROWSER"/, 'Browser Run binding required');
assert.match(wrangler, /"crons"\s*:\s*\[[\s\S]*?"\* \* \* \* \*"/, 'minutely scheduler required');

const cron = readFileSync(new URL('../src/picosvc/cron-service.ts', import.meta.url), 'utf8');
assert.match(cron, /validCronExpressionStrict/, 'strict Cron validator required');

const serviceUtils = readFileSync(new URL('../src/picosvc/service-utils.ts', import.meta.url), 'utf8');
assert.match(serviceUtils, /RETURNING quantity/, 'usage consumption must return the atomically consumed quantity');
assert.match(serviceUtils, /product_usage_monthly\.quantity \+ excluded\.quantity <= \?/, 'usage quotas must be enforced inside the D1 upsert');

const mock = readFileSync(new URL('../src/picosvc/mock.ts', import.meta.url), 'utf8');
assert.match(mock, /consumeUsage\(env, row\.owner, 'mock', 'requests'\)/, 'Mock public requests must consume the plan request quota');

const hooks = readFileSync(new URL('../src/picosvc/hooks.ts', import.meta.url), 'utf8');
assert.match(hooks, /resourceCapacity\(env, owner, 'hooks', 'inboxes', 'webhook_inboxes'\)/, 'Hooks must cap inbox count');
assert.match(hooks, /productLimit\(env, owner, 'hooks', 'history'\)/, 'Hooks must expose retained-history limits');
assert.match(hooks, /pruneWebhookHistory/, 'Hooks must prune retained event history');
assert.match(hooks, /consumeUsage\(env, inbox\.owner, 'hooks', 'events'\)/, 'Hooks inbound events must atomically consume quota');

const utility = readFileSync(new URL('../src/picosvc/utility-services.ts', import.meta.url), 'utf8');
assert.match(utility, /consumeUsage\(env, row\.owner, 'qr', 'scans'\)/, 'Dynamic QR redirects must consume scan quota');

const automation = readFileSync(new URL('../src/picosvc/automation-services.ts', import.meta.url), 'utf8');
assert.match(automation, /productLimit\(env, feed\.owner, 'rss', 'refreshMinutes'\)/, 'RSS scheduler must honor tier refresh intervals');
assert.match(automation, /consumeUsage\(env, feed\.owner, 'rss', 'checks'\)/, 'RSS refreshes must consume check quota');
assert.match(automation, /productLimit\(env, monitor\.owner, 'monitor', 'minIntervalMinutes'\)/, 'Monitor scheduler must honor tier minimum intervals');
assert.match(automation, /productLimit\(env, feed\.owner, 'rss', 'entriesPerFeed'\)/, 'RSS retention must honor tier entry limits');

const data = readFileSync(new URL('../src/picosvc/data-services.ts', import.meta.url), 'utf8');
assert.match(data, /fileStorageState/, 'Files must track owner storage usage');
assert.match(data, /productLimit\(env, owner, 'files', 'storageBytes'\)/, 'Files must enforce storage-byte quotas');
assert.match(data, /resourceCapacity\(env, owner, 'files', 'spaces', 'file_spaces'\)/, 'Files must cap spaces');
assert.match(data, /resourceCapacity\(env, owner, 'license', 'projects', 'license_projects'\)/, 'License must cap projects');
assert.match(data, /resourceCapacity\(env, owner, 'flags', 'projects', 'flag_projects'\)/, 'Flags must cap projects');
assert.match(data, /deleteR2Prefix/, 'Files space deletion must clean the full R2 prefix');

const mcpRuntime = readFileSync(new URL('../src/runtime.ts', import.meta.url), 'utf8');
assert.match(mcpRuntime, /productLimit\(env, row\.owner, 'mcp', 'sandboxMcps'\)/, 'MCP Sandbox fallback must be plan-gated');
assert.match(mcpRuntime, /Sandbox fallback, but .* is Edge-only/, 'Edge-only tiers must reject Sandbox fallback');
assert.match(mcpRuntime, /assertExistingSandboxAllowed/, 'Existing Sandbox MCPs must be rechecked after billing changes');

console.log(`PicoSvc services OK: ${PICOSVC_PRODUCTS.length} active products, quota guards and runtime invariants present.`);
