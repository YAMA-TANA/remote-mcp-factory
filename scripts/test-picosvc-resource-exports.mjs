import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESOURCE_EXPORTS, csvCell, readExportRows, serializeResourceExport } from '../web/app/service-resource-export.ts';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routing = source('web/app/service-resource-detail.tsx');
const component = source('web/app/service-resource-export.tsx');
const style = source('web/app/service-resource-export.css');

assert.match(routing, /ServiceResourceExport service="license"/, 'License manager must expose metadata export');
assert.match(routing, /ServiceResourceExport service="flags"/, 'Flags manager must expose snapshot export');
assert.equal(RESOURCE_EXPORTS.license.path('a/b'), '/api/picosvc/license/projects/a%2Fb/keys');
assert.equal(RESOURCE_EXPORTS.flags.path('a/b'), '/api/picosvc/flags/projects/a%2Fb/flags');
assert.throws(() => readExportRows('license', {}), /Missing keys/);
assert.throws(() => readExportRows('flags', { flags: [null] }), /Invalid flags entry/);
assert.equal(csvCell('=cmd'), '"\'=cmd"');

const license = serializeResourceExport('license', [{ id: 'abc', label: '=SUM(1,1)', revoked: false, created_at: '2026-01-01', expires_at: null, licenseKey: 'NEVER_EXPORT_KEY', metadata: { secret: 'NEVER_EXPORT_METADATA' } }]);
assert.ok(license.startsWith('\uFEFF'));
assert.ok(!license.includes('NEVER_EXPORT_KEY'));
assert.ok(!license.includes('NEVER_EXPORT_METADATA'));
assert.match(license, /'=[A-Z]+/i);

const flags = serializeResourceExport('flags', [{ key: 'checkout', value: { rollout: 50 }, enabled: true, updated_at: '2026-01-01', secret: 'NEVER_EXPORT_SECRET' }]);
const parsed = JSON.parse(flags);
assert.deepEqual(parsed.flags[0], { key: 'checkout', value: { rollout: 50 }, enabled: true, updatedAt: '2026-01-01' });
assert.ok(!flags.includes('NEVER_EXPORT_SECRET'));
assert.match(component, /await api\(definition\.path\(id\)\)/, 'Exports must use the authenticated workspace API');
assert.match(component, /URL\.revokeObjectURL/, 'Temporary download URLs must be released');
assert.match(component, /role="alert"/, 'Export failures must be accessible');
assert.match(style, /@media/, 'Export controls must be responsive');
console.log('PicoSvc License/Flags resource exports are allowlisted and safe.');
