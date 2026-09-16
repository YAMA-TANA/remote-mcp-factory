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

console.log(`PicoSvc services OK: ${PICOSVC_PRODUCTS.length} active products, DB/runtime/scheduler/email invariants present.`);
