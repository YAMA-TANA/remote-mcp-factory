import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  operationsFilter, operationsPaths, parseFunctionRevisions, parseMonitorOptions,
  parseOperationsEvents, parseOperationsItems, publicFunctionEndpoint, validateOperationsEdit,
} from '../web/app/service-operations-desk-model.ts';

const id = '11111111-2222-4333-8444-555555555555';
const forbidden = 'PRIVATE_TOKEN_DO_NOT_RENDER';
const fn = parseOperationsItems({ apps: [{ id, name: 'Worker', enabled: 1, public_id: 'a'.repeat(32), updated_at: '2026-09-21T00:00:00Z', code: forbidden, bearerToken: forbidden, endpoint: `https://bad.example/${forbidden}` }] }, 'functions');
assert.equal(fn.length, 1);
assert.equal(fn[0].publicId, 'a'.repeat(32));
assert.equal(fn[0].enabled, true);
assert.equal(JSON.stringify(fn).includes(forbidden), false);
assert.equal(publicFunctionEndpoint('https://api.example.com/private', fn[0]), `https://api.example.com/fn/${'a'.repeat(32)}`);
const monitors = parseOperationsItems({ monitors: [{ id, name: 'Homepage', enabled: true, advanced: true, interval_minutes: 15, target_url: forbidden, webhook_url: forbidden, last_error: forbidden, last_checked_at: '2026-09-21T00:00:00Z' }] }, 'monitor');
assert.equal(monitors[0].advanced, true);
assert.equal(monitors[0].intervalMinutes, 15);
assert.equal(JSON.stringify(monitors).includes(forbidden), false);
assert.equal(operationsFilter(monitors, 'HOME', 'enabled').length, 1);
assert.equal(operationsFilter(monitors, '', 'paused').length, 0);
assert.throws(() => parseOperationsItems({ apps: [{ id: '../../etc', name: 'invalid', enabled: 1 }] }, 'functions'));
assert.throws(() => parseOperationsItems({ apps: [{ id, name: 'same', enabled: 1 }, { id, name: 'duplicate', enabled: 1 }] }, 'functions'));
assert.throws(() => parseOperationsItems({ apps: Array.from({ length: 501 }, () => ({})) }, 'functions'));
const logs = parseOperationsEvents({ logs: [{ id, method: 'GET', status_code: 500, duration_ms: 23, revision_no: 2, error: forbidden, occurred_at: '2026-09-21T00:00:00Z' }] }, 'functions');
assert.equal(logs[0].status, 500);
assert.equal(logs[0].durationMs, 23);
assert.equal(JSON.stringify(logs).includes(forbidden), false);
const changes = parseOperationsEvents({ events: [{ id, event_type: 'change', diff_text: forbidden, error: forbidden, webhook_error: forbidden, webhook_status: 204, created_at: '2026-09-21T00:00:00Z' }] }, 'monitor');
assert.equal(changes[0].kind, 'change');
assert.equal(JSON.stringify(changes).includes(forbidden), false);
assert.throws(() => parseOperationsEvents({ events: [{ event_type: 'unknown' }] }, 'monitor'));
assert.equal(parseFunctionRevisions({ currentRevision: 3, revisions: [{ revision_no: 3, code: forbidden, created_at: '2026-09-21T00:00:00Z' }] }).current, 3);
assert.equal(JSON.stringify(parseFunctionRevisions({ currentRevision: 3, revisions: [{ revision_no: 3, code: forbidden }] })).includes(forbidden), false);
assert.throws(() => parseFunctionRevisions({ revisions: [{ revision_no: 1 }, { revision_no: 1 }] }));
const opts = parseMonitorOptions({ advanced: true, contentSelector: 'article', ignoreSelector: '.ad', stripPattern: 'foo', lastError: forbidden, lastText: forbidden });
assert.deepEqual(opts, { advanced: true, contentSelector: 'article', ignoreSelector: '.ad', stripPattern: 'foo' });
assert.equal(JSON.stringify(opts).includes(forbidden), false);
assert.throws(() => parseMonitorOptions({ advanced: true, contentSelector: 'x'.repeat(201) }));
assert.equal(operationsPaths('functions', id).rollback, `/api/picosvc/functions/apps/${id}/rollback`);
assert.equal(operationsPaths('monitor', id).options, `/api/picosvc/monitor/${id}/options`);
assert.throws(() => operationsPaths('monitor', '../bad'));
assert.deepEqual(validateOperationsEdit('  My app  '), { name: 'My app' });
assert.throws(() => validateOperationsEdit('x', 1));
assert.throws(() => validateOperationsEdit('x', 11.5));

const root = new URL('../', import.meta.url);
const page = readFileSync(new URL('web/app/[locale]/[service]/manage/page.tsx', root), 'utf8');
const ui = readFileSync(new URL('web/app/service-operations-desk.tsx', root), 'utf8');
const nav = readFileSync(new URL('web/app/customer-workspace-header.tsx', root), 'utf8');
for (const service of ['functions', 'monitor']) {
  assert.ok(page.includes(`'${service}'`), `Missing static route: ${service}`);
  assert.ok(nav.includes(`service === '${service}'`), `Missing workspace navigation: ${service}`);
}
for (const endpoint of ['.events', '.revisions', '.rollback', '.options', '.preview', '.item']) assert.ok(ui.includes(endpoint), `Missing management operation ${endpoint}`);
assert.ok(ui.includes('instance.addListener'), 'Session / organization switch must invalidate editor');
assert.ok(ui.includes('key={revision}'), 'Editor must remount on owner switch');
assert.ok(ui.includes('detailSeq.current'), 'Selected-resource requests must be invalidated');
assert.ok(ui.includes('inventorySeq.current'), 'Inventory requests must be invalidated');
assert.ok(ui.includes('window.confirm(t.rollbackConfirm)'), 'Rollback needs explicit confirmation');
assert.ok(ui.includes('window.confirm(t.advancedConfirm)'), 'Baseline reset needs confirmation');
assert.ok(ui.includes('window.confirm(t.previewConfirm)'), 'Quota-consuming preview needs confirmation');
assert.ok(ui.includes('setPreviewHash(result.hash.slice(0, 12))'), 'Do not display extracted text');
for (const unsafe of ['event.error}', 'event.diff_text}', 'event.webhook_error}', 'result.text}']) assert.equal(ui.includes(unsafe), false);
console.log('Functions and Monitor individual management desks: model, safety and UI checks passed');
