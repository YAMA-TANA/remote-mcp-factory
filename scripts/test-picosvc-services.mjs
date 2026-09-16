import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PICOSVC_PRODUCTS } from '../src/picosvc/catalog.ts';

const expected = [
  'mcp','mock','hooks','rss','mail','shot','fetch','qr','cron','functions','json','files','license','flags','monitor','forms',
];
assert.deepEqual(PICOSVC_PRODUCTS.map((product) => product.slug), expected);
assert.equal(PICOSVC_PRODUCTS.find((product) => product.slug === 'mail')?.endpointHost, 'picosvc.com', 'Mail must use the apex domain');
const mcpProduct = PICOSVC_PRODUCTS.find((product) => product.slug === 'mcp');
assert.equal(mcpProduct?.tiers.free.limits?.sandboxActiveMinutes, 0, 'MCP Free must not include Sandbox active minutes');
assert.equal(mcpProduct?.tiers.tiny.limits?.sandboxActiveMinutes, 0, 'MCP Pico must stay Edge-only');
assert.equal(mcpProduct?.tiers.pro.limits?.sandboxActiveMinutes, 10_000, 'MCP PicoPlus must have a hard monthly Sandbox active-minute cap');
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
const hooksR2Migration = readFileSync(new URL('../migrations/0012_picosvc_hooks_r2.sql', import.meta.url), 'utf8');
assert.match(hooksR2Migration, /ADD COLUMN body_r2_key TEXT/, 'Hooks R2 body pointer migration required');
const sandboxMinuteMigration = readFileSync(new URL('../migrations/0013_picosvc_mcp_sandbox_minutes.sql', import.meta.url), 'utf8');
assert.match(sandboxMinuteMigration, /CREATE TABLE IF NOT EXISTS mcp_sandbox_active_minutes/, 'MCP Sandbox minute ledger required');
assert.match(sandboxMinuteMigration, /PRIMARY KEY \(owner, server_id, active_minute\)/, 'Sandbox minute ledger must deduplicate active minutes per MCP');

const entry = readFileSync(new URL('../src/picosvc-entry.ts', import.meta.url), 'utf8');
assert.match(entry, /scheduled\s*\(/, 'scheduled handler required');
assert.match(entry, /email\s*\(/, 'email handler required');
assert.match(entry, /picoSvcRuntimeGuardrails/, 'PicoSvc runtime guardrails must run before public service handlers');
assert.match(entry, /picoSvcPostResponseGuardrails/, 'PicoSvc post-response retention guardrails must run');
assert.match(entry, /picoSvcScheduledGuardrails/, 'scheduled retention pruning must run');
assert.match(entry, /picoSvcEmailGuardrails/, 'mail retention pruning must run after inbound email');
assert.match(entry, /mcpSandboxActiveMinuteGuard/, 'Sandbox active-minute metering must run before the legacy MCP runtime');
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
assert.match(hooks, /R2_BODY_THRESHOLD_BYTES/, 'Hooks must have an R2 offload threshold for raw bodies');
assert.match(hooks, /body_r2_key/, 'Hooks must persist an R2 body pointer');
assert.match(hooks, /env\.ARTIFACTS\.put\(r2Key, bytes/, 'Hooks must offload large bodies to R2');
assert.match(hooks, /loadEventBody/, 'Hooks replay/detail must transparently load D1 or R2 bodies');
assert.match(hooks, /deleteR2Keys/, 'Hooks retention/deletion must clean R2 bodies');

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
assert.match(data, /MAX_FORM_BYTES/, 'Forms must reject oversized submissions before storing them');

const guardrails = readFileSync(new URL('../src/picosvc/cost-guardrails.ts', import.meta.url), 'utf8');
assert.match(guardrails, /productLimit\(env, owner, 'json', 'documents'\)/, 'JSON must enforce account-wide document limits');
assert.match(guardrails, /productLimit\(env, owner, 'json', 'storageBytes'\)/, 'JSON must enforce account-wide storage-byte limits');
assert.match(guardrails, /LENGTH\(CAST\(d\.value_json AS BLOB\)\)/, 'JSON storage accounting must count bytes, not characters');
assert.match(guardrails, /consumeUsage\(env, space\.owner, 'files', 'downloads'\)/, 'Files public delivery must consume download quota');
assert.match(guardrails, /consumeUsage\(env, feed\.owner, 'rss', 'requests'\)/, 'RSS public delivery must consume request quota');
assert.match(guardrails, /productLimit\(env, feed\.owner, 'rss', 'refreshMinutes'\)/, 'Manual RSS refresh must honor tier refresh interval');
assert.match(guardrails, /productLimit\(env, inbox\.owner, 'hooks', 'bodyBytes'\)/, 'Hooks must enforce tier-specific body size limits');
assert.match(guardrails, /consumeUsage\(env, event\.owner, 'hooks', 'replays'\)/, 'Hooks replay must consume replay quota');
assert.match(guardrails, /pruneHistory\(env, form\.owner, 'forms', 'form_submissions', 'received_at'\)/, 'Forms must prune retained submission history');
assert.match(guardrails, /pruneHistory\(env, route\.owner, 'mail', 'mail_events', 'received_at'\)/, 'Mail must prune retained delivery history');
assert.match(guardrails, /pruneOwnersAboveMinimum\(env, 'cron', 'cron_runs', 'ran_at'\)/, 'Cron must prune retained execution history');

const sandboxMeter = readFileSync(new URL('../src/picosvc/mcp-sandbox-meter.ts', import.meta.url), 'utf8');
assert.match(sandboxMeter, /SANDBOX_IDLE_LEASE_MINUTES = 10/, 'Sandbox metering must match the runtime 10-minute sleep lease');
assert.match(sandboxMeter, /productLimit\(env, row\.owner, 'mcp', 'sandboxActiveMinutes'\)/, 'Sandbox meter must use the product active-minute cap');
assert.match(sandboxMeter, /ON CONFLICT\(owner,server_id,active_minute\) DO NOTHING/, 'Sandbox active minutes must be deduplicated');
assert.match(sandboxMeter, /consumeUsage\(env, row\.owner, 'mcp', 'sandboxActiveMinutes', claimed\.length\)/, 'Sandbox minute claims must consume the atomic monthly quota');
assert.match(sandboxMeter, /requestAuthorizedForServer/, 'Protected MCPs must authenticate before active-minute usage can be charged');

const functions = readFileSync(new URL('../src/picosvc/functions-service.ts', import.meta.url), 'utf8');
assert.match(functions, /MAX_FUNCTION_CPU_MS = 10/, 'Functions must cap Dynamic Worker CPU at 10 ms per invocation');
assert.match(functions, /MAX_FUNCTION_WALL_MS = 5_000/, 'Functions must cap wall-clock execution at 5 seconds');
assert.match(functions, /limits:\s*\{\s*cpuMs:\s*MAX_FUNCTION_CPU_MS,\s*subRequests:\s*32\s*\}/, 'Functions must apply CPU/subrequest limits to Dynamic Workers');
assert.match(functions, /new AbortController\(\)/, 'Functions must abort long-running requests');
assert.match(functions, /status[^\n]*504|\}, 504\)/, 'Functions must return a timeout status when wall-clock execution is exceeded');

const edgeRuntime = readFileSync(new URL('../src/edge-runtime.ts', import.meta.url), 'utf8');
assert.match(edgeRuntime, /EDGE_CPU_MS_PER_REQUEST = 50/, 'Edge MCPs must have a pricing-safe CPU ceiling');
assert.match(edgeRuntime, /EDGE_SUBREQUESTS_PER_REQUEST = 64/, 'Edge MCPs must have a bounded subrequest ceiling');

const mcpRuntime = readFileSync(new URL('../src/runtime.ts', import.meta.url), 'utf8');
assert.match(mcpRuntime, /productLimit\(env, row\.owner, 'mcp', 'sandboxMcps'\)/, 'MCP Sandbox fallback must be plan-gated');
assert.match(mcpRuntime, /Sandbox fallback, but .* is Edge-only/, 'Edge-only tiers must reject Sandbox fallback');
assert.match(mcpRuntime, /assertExistingSandboxAllowed/, 'Existing Sandbox MCPs must be rechecked after billing changes');

console.log(`PicoSvc services OK: ${PICOSVC_PRODUCTS.length} active products, quota guards and runtime invariants present.`);
