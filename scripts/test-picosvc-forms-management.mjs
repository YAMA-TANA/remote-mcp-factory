import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const wrapper = source('web/app/service-resource-detail.tsx');
const legacy = source('web/app/service-resource-detail-legacy.tsx');
const ui = source('web/app/service-forms-management.tsx');
const css = source('web/app/service-forms-management.css');
const backend = source('src/picosvc/forms-advanced.ts');
const search = source('src/picosvc/forms-search.ts');
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

// The initial-load callback must remain stable when form drafts or search queries change.
assert.match(ui, /const refresh = useCallback\(async \(q = '', replaceSettings = true\) =>/, 'Initial load accepts explicit query and draft replacement');
assert.match(ui, /Promise\.all\(\[loadSettings\(replaceSettings\), loadSubmissions\(q\), loadDeliveries\(\)\]\)/, 'Refresh uses explicit arguments');
assert.match(ui, /\}, \[loadSettings, loadSubmissions, loadDeliveries\]\);\s*useEffect\(\(\) => \{ void refresh\(\); \}, \[refresh\]\);/, 'Draft and search state must not re-trigger the initial-load effect');
assert.match(ui, /void refresh\(appliedSearch, !dirty\)/, 'Manual refresh retains applied search and unsaved draft');
assert.match(ui, /busy \|\| \(dirty && !window\.confirm\(t\.discard\)\)/, 'Reload must confirm before replacing unsaved settings');
assert.match(ui, /setBusy\('reload-settings'\)/, 'Settings reload must block competing edits');
assert.match(ui, /nextBefore:|result\.nextBefore/, 'UI must accept the corrected opaque pagination cursor');
assert.match(search, /received_at = \? AND id < \?/, 'Backend must paginate same-timestamp submissions by id');
assert.doesNotMatch(ui, /同時刻の投稿はページ境界で省略される可能性|identical timestamps may be skipped|时间戳相同的记录可能在分页时跳过/, 'Remove outdated data-loss warnings in every language');
for (const text of ['同時刻の投稿も投稿ID', 'share the same timestamp', '同一时间戳的记录']) assert.ok(ui.includes(text), `Corrected cursor copy missing: ${text}`);
console.log('PicoSvc Forms console checks OK: safe draft refresh, corrected cursor guidance, protection settings, search, delivery and CSV.');
