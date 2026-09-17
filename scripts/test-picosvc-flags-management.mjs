import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAG_KEY_PATTERN, MAX_FLAG_VALUE_BYTES, parseFlagDraft } from '../web/app/flag-editor-validation.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = read('web/app/service-flags-management.tsx');
const router = read('web/app/service-resource-detail.tsx');
const legacy = read('web/app/service-resource-detail-legacy.tsx');
const style = read('web/app/service-flags-management.css');
const api = read('src/picosvc/data-services.ts');
const guard = read('src/picosvc/flags-write-guard.ts');
const dispatch = read('src/picosvc/routes.ts');

assert.equal(FLAG_KEY_PATTERN.test('prod.checkout-v2'), true);
assert.equal(parseFlagDraft('checkout', 'false').value, false);
assert.equal(parseFlagDraft('checkout', 'null').value, null, 'Explicit null must remain null');
assert.equal(parseFlagDraft('checkout', '0').value, 0);
assert.equal(parseFlagDraft('checkout', '""').value, '');
assert.deepEqual(parseFlagDraft('checkout', '{"variant":"A"}').value, { variant: 'A' });
assert.deepEqual(parseFlagDraft('checkout', '[true,false]').value, [true, false]);
for (const key of ['', 'space key', 'x'.repeat(101), '__proto__', 'constructor', 'prototype']) {
  assert.throws(() => parseFlagDraft(key, 'true'), /Flag keys/);
}
assert.throws(() => parseFlagDraft('checkout', '{bad'), /valid JSON/);
assert.throws(() => parseFlagDraft('checkout', '"' + 'a'.repeat(MAX_FLAG_VALUE_BYTES) + '"'), /64 KiB/);
assert.throws(() => parseFlagDraft('checkout', '"' + '界'.repeat(22000) + '"'), /64 KiB/, 'Validate UTF-8 bytes, not just characters');
assert.equal(parseFlagDraft('checkout', '"' + 'a'.repeat(100) + '"').key, 'checkout');

assert.match(router, /service === 'flags'\) return <FlagsManagementDetail/, 'Flags must open dedicated management');
assert.match(router, /service === 'forms'\) return <FormsManagementDetail/, 'Forms must remain specialized');
assert.match(router, /service === 'license'\) return <LicenseManagementDetail/, 'License must remain specialized');
assert.match(router, /<LegacyServiceResourceDetail/, 'JSON and Files must retain existing tools');
assert.match(legacy, /async function uploadFile\(/, 'File upload must remain accessible');
assert.match(legacy, /async function saveDocument\(/, 'JSON document editing must remain accessible');
assert.match(ui, /api\(base\)/, 'Load persisted flags through owner-authenticated management API');
assert.match(ui, /method: 'PUT'.*JSON\.stringify\(\{ \.\.\.payload, enabled: draft\.enabled \}\)/, 'Save JSON values and publication together');
assert.match(ui, /method: 'PUT'.*JSON\.stringify\(\{ key, value: item\.value, enabled: !wasEnabled \}\)/, 'Toggle with full existing value, never silently rewrite it');
assert.match(ui, /method: 'DELETE'/, 'Delete from authenticated management API');
assert.match(ui, /!window\.confirm\(t\.confirmDelete\)/, 'Confirm permanent deletion');
assert.match(ui, /window\.confirm\(wasEnabled \? t\.confirmUnpublish : t\.confirmPublish\)/, 'Confirm public configuration changes');
assert.match(ui, /dirty && !window\.confirm\(t\.discard\)/, 'Do not silently discard editor changes');
assert.match(ui, /aria-pressed=\{filter === option\}/, 'Expose active filter to assistive technology');
assert.match(ui, /public API.*quota|公開API.*利用枠|公开 API.*配额/i, 'Explain that public requests are metered');
assert.match(ui, /<pre>\{pretty\(item\.value\)\}<\/pre>/, 'Escape user-authored JSON rather than executing HTML');
assert.match(api, /enabled=1 ORDER BY key/, 'Public API must omit disabled flags');
assert.match(guard, /await request\.clone\(\)\.json\(\)/, 'Do not consume request bodies that the legacy handler needs');
assert.match(guard, /draft\.value !== null\) return null/, 'Keep existing non-null writes unchanged');
assert.match(guard, /requireIdentity\(request, env\)/, 'Guard must authenticate before writing explicit null');
assert.match(guard, /id=\? AND owner=\?/, 'Guard must enforce project ownership');
assert.match(guard, /productLimit\(env, owner, 'flags', 'flags'\)/, 'New null-valued flags must enforce plan quotas');
assert.match(guard, /\.bind\(project\.id, key, 'null', enabled, now\)/, 'Persist literal JSON null without false coercion');
assert.match(dispatch, /flagsWriteGuard,[\s\S]*?dataManagementRoutes,/, 'Null guard must run before original data management');
assert.match(style, /@media\(max-width:820px\)/, 'Flag console must fit mobile screens');
console.log('PicoSvc Flags: JSON validation, editing, publish controls, null persistence guard and existing managers OK.');
