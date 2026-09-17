import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routing = read('web/app/service-advanced-detail.tsx');
const functionUi = read('web/app/service-function-operations.tsx');
const monitorUi = read('web/app/service-monitor-operations.tsx');
const css = read('web/app/service-advanced-operations.css');
const functionApi = read('src/picosvc/functions-advanced.ts');
const monitorApi = read('src/picosvc/monitor-advanced.ts');

for (const route of ['rss', 'cron', 'qr', 'mail']) assert.match(routing, new RegExp(`props\\.service === '${route}'`), `Preserve ${route} management`);
assert.match(routing, /<FunctionsManagementDetail[^>]*key=/, 'Rollback must remount the function editor to load the restored source');
assert.match(routing, /<FunctionOperations/, 'Function operations must appear in the management screen');
assert.match(routing, /<MonitorOperations/, 'Monitor events and configuration must appear in the management screen');
assert.match(routing, /<MonitorManagementDetail[^>]*key=/, 'Monitor option changes must update the primary management editor');
assert.match(routing, /<LegacyServiceAdvancedDetail/, 'Other services must retain existing management');
for (const path of ['/logs', '/revisions', '/secrets', '/rollback']) {
  assert.ok(functionUi.includes(path), `Function management needs ${path}`);
  assert.ok(functionApi.includes(path.replace(/^\//, "'")) || functionApi.includes(path.slice(1)), `Function backend needs ${path}`);
}
assert.match(functionUi, /JSON\.stringify\(\{ revision: selectedRevision \}\)/, 'Rollback must identify a selected revision');
assert.match(functionUi, /window\.confirm\(t\.rollbackConfirm\)/, 'Rollback must confirm discarded editor changes');
assert.match(functionUi, /onRollback\(\)/, 'Rollback must refresh the source editor');
assert.match(functionUi, /new TextEncoder\(\)\.encode\(secretValue\)\.byteLength > 8192/, 'Secret values must be bounded');
assert.match(functionUi, /type=\{reveal \? 'text' : 'password'\}/, 'Secret entry should be masked by default');
assert.match(functionUi, /setSecretValue\(''\)/, 'Clear plaintext secrets after a successful write');
assert.doesNotMatch(functionUi, /entry\.ciphertext|entry\.signing_ciphertext/, 'Never display secret ciphertext');
assert.match(functionApi, /SELECT name,updated_at FROM function_secrets/, 'Secret list must return metadata only');
assert.match(functionApi, /currentRevision/, 'Revision metadata must exist server-side');
assert.match(functionApi, /function_invocations/, 'Execution logs must exist server-side');
for (const route of ['/options', '/events', '/preview']) {
  assert.ok(monitorUi.includes(route), `Monitor management needs ${route}`);
  assert.ok(monitorApi.includes(route.slice(1)), `Monitor backend needs ${route}`);
}
assert.match(monitorUi, /method: 'PUT'/, 'Save monitor extraction settings using PUT');
assert.match(monitorUi, /window\.confirm\(t\.baseline\)/, 'Warn users before resetting the monitor comparison baseline');
assert.match(monitorUi, /disabled=\{busy \|\| loading \|\| dirty\}/, 'Do not preview unsaved selector settings');
assert.match(monitorUi, /method: 'POST'/, 'Use the metered monitor preview endpoint');
for (const field of ['diff_text', 'webhook_error', 'event_type', 'ignoreSelector', 'contentSelector', 'stripPattern']) assert.ok(monitorUi.includes(field), `Monitor needs ${field}`);
assert.match(monitorApi, /DELETE FROM monitor_events/, 'Monitor history must have retention');
assert.match(monitorApi, /consumeUsage\(env, owner, 'monitor', 'checks'\)/, 'Preview must consume usage');
assert.match(css, /@media\(max-width:900px\)/, 'Advanced operations must remain responsive');
console.log('Functions logs/revisions/secrets/rollback and Monitor options/events/metered preview: API-backed UI contracts OK.');
