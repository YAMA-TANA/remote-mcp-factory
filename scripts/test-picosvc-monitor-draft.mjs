import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const route = read('src/picosvc/monitor-preview-draft.ts');
const router = read('src/picosvc/routes.ts');
const ui = read('web/app/monitor-diagnostics.tsx');
const advanced = read('src/picosvc/monitor-advanced.ts');

assert.ok(router.includes('monitorDraftPreviewRoute,'), 'Draft preview must be registered');
assert.ok(router.indexOf('monitorDraftPreviewRoute,') < router.indexOf('monitorAdvancedManagementRoutes,'), 'Draft preview must precede saved-only legacy preview');
assert.match(route, /request\.text\(\)/, 'Read drafts even when Content-Length is absent');
assert.match(route, /owner=\?/, 'Only the owner may inspect the monitor');
assert.match(route, /requireIdentity\(request, env\)/, 'Require authentication');
assert.match(route, /consumeUsage\(env, identity\.ownerId, 'monitor', 'checks'\)/, 'Preview must be metered once');
assert.match(route, /fetchPublic\(monitor\.target_url/, 'Use the redirect-safe public fetch wrapper');
assert.match(route, /length > MAX_HTML_BYTES/, 'Stream must enforce response size when Content-Length is missing');
assert.match(route, /empty_extraction/, 'No visible text must return an actionable failure');
assert.match(route, /validStripPattern\(stripRaw\)/, 'Preview must validate regex safety');
assert.doesNotMatch(route, /(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:monitor_options|monitors|monitor_events)/i, 'Preview must not persist draft settings or reset the baseline');
assert.match(ui, /JSON\.stringify\(\{ contentSelector: options\.contentSelector, ignoreSelector: options\.ignoreSelector, stripPattern: options\.stripPattern \}\)/, 'Test button must submit unsaved form values');
assert.match(ui, /disabled=\{busy \|\| !dirty\}/, 'Unchanged settings must not reset the comparison baseline');
assert.match(advanced, /last_content_hash=NULL,last_text=NULL/, 'Saving a new configuration intentionally resets the baseline');
console.log('PicoSvc Monitor draft preview and unchanged-form safety contracts OK.');
