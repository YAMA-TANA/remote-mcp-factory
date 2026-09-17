import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { downloadManagementCsv, filterHookInventory, filterMockInventory, hookInventoryCsv, mockInventoryCsv, validReplayDestination } from '../web/app/service-standalone-management.ts';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const mock = read('web/app/mock/page.tsx');
const hooks = read('web/app/hooks/page.tsx');
const styles = read('web/app/service-standalone-management.css');
const mockRows = [
  { id: 'a', name: '=HYPERLINK("bad")', method: 'GET', path: 'api/one', statusCode: 200, contentType: 'application/json', enabled: true, updatedAt: '2026-09-17', body: 'TOP_SECRET_BODY', headers: { Authorization: 'SECRET_HEADER' } },
  { id: 'b', name: 'Second', method: 'POST', path: 'api/two', statusCode: 201, contentType: 'text/plain', enabled: false, updatedAt: '2026-09-16', body: 'ALSO_PRIVATE', headers: {} },
];
assert.deepEqual(filterMockInventory(mockRows, 'API/ONE', 'all').map(row => row.id), ['a']);
assert.deepEqual(filterMockInventory(mockRows, 'text/PLAIN', 'POST').map(row => row.id), ['b']);
assert.deepEqual(filterMockInventory(mockRows, '', 'GET').map(row => row.id), ['a']);
const csv = mockInventoryCsv(mockRows);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes("\"'=HYPERLINK("), 'Spreadsheet formulas must be escaped');
assert.ok(!csv.includes('TOP_SECRET_BODY') && !csv.includes('SECRET_HEADER') && !csv.includes('ALSO_PRIVATE'), 'Never export Mock response content or headers');
const hookRows = [
  { id: '1', method: 'POST', path: '=cmd', contentType: 'application/json', sizeBytes: 17, receivedAt: '2026-09-17', bodyPreview: 'SECRET_BODY', bodyBase64: 'SECRET_BASE64', headers: { Authorization: 'TOKEN' }, query: [['token', 'SECRET_QUERY']] },
  { id: '2', method: 'GET', path: '/health', contentType: null, sizeBytes: 0, receivedAt: '2026-09-16' },
];
assert.deepEqual(filterHookInventory(hookRows, 'json', 'POST').map(row => row.id), ['1']);
assert.deepEqual(filterHookInventory(hookRows, 'HEALTH', 'all').map(row => row.id), ['2']);
const hookCsv = hookInventoryCsv(hookRows);
assert.ok(hookCsv.includes("\"'=cmd\""));
for (const sensitive of ['SECRET_BODY', 'SECRET_BASE64', 'TOKEN', 'SECRET_QUERY']) assert.ok(!hookCsv.includes(sensitive), `Do not export ${sensitive}`);
for (const url of ['https://example.com/path', 'http://example.com/webhook?ok=1']) assert.equal(validReplayDestination(url), true);
for (const url of ['', 'javascript:alert(1)', 'file:///secret', 'https://user:pass@example.com/', 'https://example.com/#secret', 'not a URL']) assert.equal(validReplayDestination(url), false);
assert.equal(typeof downloadManagementCsv, 'function');
assert.match(mock, /dirtyEdit\(\) && !window\.confirm\(extra\.discard\)/, 'Switching or canceling a dirty Mock editor requires confirmation');
assert.match(mock, /filterMockInventory\(data\.endpoints, filterQuery, methodFilter\)/, 'Mock filters visible endpoints');
assert.match(mock, /mockInventoryCsv\(filtered\)/, 'Mock exports only filtered metadata');
assert.match(mock, /role="status"/, 'Mock exposes inventory totals accessibly');
assert.match(hooks, /!window\.confirm\(`\$\{t\.deleteInboxConfirm\}/, 'Confirm permanent inbox deletion');
assert.match(hooks, /!window\.confirm\(t\.deleteEventConfirm\)/, 'Confirm event deletion');
assert.match(hooks, /validReplayDestination\(replayUrl\)/, 'Validate replay destination before request');
assert.match(hooks, /!window\.confirm\(`\$\{t\.replayConfirm\}/, 'Warn replay can cause duplicate effects');
assert.match(hooks, /filterHookInventory\(events, filterQuery, methodFilter\)/, 'Filter captured events');
assert.match(hooks, /hookInventoryCsv\(visible\)/, 'Only export currently filtered loaded events');
assert.match(hooks, /eventRequest\.current/, 'Ignore stale event-page responses');
assert.match(hooks, /detailRequest\.current/, 'Ignore stale event-detail responses');
assert.match(hooks, /MAX_LOADED_EVENTS = 500/, 'Cap loaded events');
assert.match(hooks, /standaloneEventButton/, 'Event selection uses a keyboard-accessible button');
assert.match(hooks, /role="alert"/, 'Errors must be announced');
assert.match(styles, /@media\(max-width:620px\)/, 'Responsive search controls');
console.log('PicoSvc standalone managers: safe CSV, filters, dirty editor, replay/deletion confirmation, stale-request and accessibility checks OK.');
