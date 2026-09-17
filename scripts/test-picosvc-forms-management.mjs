import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const wrapper = source('web/app/service-resource-detail.tsx');
const legacy = source('web/app/service-resource-detail-legacy.tsx');
const ui = source('web/app/service-forms-management.tsx');
const css = source('web/app/service-forms-management.css');
const backend = source('src/picosvc/forms-advanced.ts');
const basic = source('src/picosvc/data-services.ts');
assert.match(wrapper, /props\.service === 'forms'.*<FormsManagementDetail/, 'Forms resources need their dedicated console');
assert.match(wrapper, /<LegacyServiceResourceDetail/, 'Retain existing JSON, Files, License and Flags tools');
for (const service of ['json', 'files', 'license', 'flags']) assert.match(legacy, new RegExp(`service === '${service}'`), `Keep legacy ${service} workflows`);
assert.match(ui, /api\(`\$\{base\}\/config`\)/, 'Fetch persisted Forms configuration');
assert.match(ui, /method: 'PUT'/, 'Persist Forms protection settings through PUT');
for (const field of ['allowedOrigins', 'requiredFields', 'honeypotField', 'webhookUrl', 'successRedirect', 'requireTurnstile']) {
  assert.match(ui, new RegExp(`\\b${field}\\b`), `${field} needs an editor`);
  assert.match(backend, new RegExp(`\\b${field}\\b`), `${field} must be supported by Worker`);
}
assert.match(ui, /origins\.length > 20/, 'Enforce backend origin count');
assert.match(ui, /fields\.length > 30/, 'Enforce backend required field count');
assert.match(ui, /exactHttpsOrigin/, 'Origin input must be exact HTTPS origin');
assert.match(ui, /new TextEncoder\(\)\.encode\(JSON\.stringify\(body\)\)\.byteLength > 32 \* 1024/, 'Validate UTF-8 settings byte size');
assert.match(ui, /loadSubmissions\(appliedSearch, nextBefore\)/, 'Search pagination must use the existing cursor');
assert.match(ui, /\/search/, 'Fetch searchable submissions from authenticated API');
assert.match(ui, /\/deliveries/, 'Fetch actual webhook delivery errors');
assert.match(ui, /\/export/, 'Download CSV from server instead of exporting potentially partial client data');
assert.match(ui, /typeof response\.payload !== 'string'/, 'Reject unexpected non-CSV response');
assert.match(ui, /URL\.revokeObjectURL/, 'Release temporary CSV URL');
assert.match(ui, /<pre>\{JSON\.stringify\(entry\.payload, null, 2\)\}<\/pre>/, 'Render submitted data as text, never injected HTML');
assert.doesNotMatch(ui, /dangerouslySetInnerHTML|eval\(/, 'Never execute untrusted form input');
assert.match(ui, /window\.confirm\(t\.confirm\)/, 'Require confirmation for destructive removal');
assert.match(backend, /MAX_EXPORT_ROWS = 500/, 'CSV cap must match UI copy');
assert.match(basic, /const formMatch = url\.pathname\.match/, 'Form ownership and deletion routes exist');
assert.match(css, /@media\(max-width:500px\)/, 'Forms console must adapt to mobile screens');
console.log('PicoSvc Forms console checks OK: settings, validated origins/fields, search/pagination, delivery, CSV, legacy fallback and responsive layout.');
