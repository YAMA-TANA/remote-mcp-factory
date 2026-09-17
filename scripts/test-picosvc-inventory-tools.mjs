import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectJsonBackup, FILE_INVENTORY_LIMIT, MAX_BACKUP_BYTES, MAX_BACKUP_PAGES, fileInventoryCsv, filterFileInventory, readFileInventory } from '../web/app/service-inventory-data.ts';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const id = '00000000-0000-4000-8000-000000000001';
const row = (key, value = null) => ({ key, value, updatedAt: '2026-09-17T00:00:00Z', bearerToken: 'DO_NOT_EXPORT' });
const calls = [];
const complete = await collectJsonBackup(id, async path => {
  calls.push(path);
  return { payload: path.includes('?after=') ? { storeId: id, documents: [row('b', { result: true })], nextCursor: null } : { storeId: id, documents: [row('a')], nextCursor: 'a' } };
});
assert.equal(complete.complete, true);
assert.equal(complete.count, 2);
assert.equal(complete.pages, 2);
assert.equal(complete.nextCursor, null);
assert.deepEqual(calls, [`/api/picosvc/json/stores/${id}/export`, `/api/picosvc/json/stores/${id}/export?after=a`]);
assert.deepEqual(JSON.parse(complete.content).documents.map(doc => doc.value), [null, { result: true }]);
assert.ok(!complete.content.includes('DO_NOT_EXPORT'), 'Export only allowlisted document properties');
assert.ok(complete.bytes <= MAX_BACKUP_BYTES);
let count = 0;
const partial = await collectJsonBackup(id, async () => {
  const key = String.fromCharCode(97 + count++);
  return { payload: { storeId: id, documents: [row(key)], nextCursor: key } };
});
assert.equal(count, MAX_BACKUP_PAGES, 'Cap remote API calls');
assert.equal(partial.complete, false);
assert.equal(partial.nextCursor, 'j');
assert.equal(JSON.parse(partial.content).complete, false);
const empty = await collectJsonBackup(id, async () => ({ payload: { storeId: id, documents: [], nextCursor: null } }));
assert.equal(empty.count, 0);
assert.equal(empty.complete, true);
await assert.rejects(collectJsonBackup(id, async () => ({ payload: { storeId: id, documents: [row('a')], nextCursor: 'wrong' } })), /cursor/);
await assert.rejects(collectJsonBackup(id, async () => ({ payload: { storeId: 'another-store', documents: [row('a')], nextCursor: null } })), /Invalid JSON export page/);
await assert.rejects(collectJsonBackup(id, async () => ({ payload: { storeId: id, documents: [row('a'), row('a')], nextCursor: null } })), /repeated/);
await assert.rejects(collectJsonBackup(id, async () => ({ payload: { storeId: id, documents: [], nextCursor: 'a' } })), /cursor/);
await assert.rejects(collectJsonBackup('not-a-store', async () => ({ payload: {} })), /store ID/);
await assert.rejects(collectJsonBackup(id, async () => ({ payload: { storeId: id, documents: [row('a', 'x'.repeat(MAX_BACKUP_BYTES))], nextCursor: null } })), /8 MiB/);
const inventory = readFileInventory({ objects: [
  { path: 'images/logo.png', content_type: 'image/png', size_bytes: 120, created_at: '2026-09-01', updated_at: '2026-09-17', secret: 'DO_NOT_EXPORT' },
  { path: '=HYPERLINK("x")', content_type: 'text/plain', size_bytes: 20, created_at: '2026-09-02', updated_at: '2026-09-16' },
] });
assert.equal(inventory.length, 2);
assert.deepEqual(filterFileInventory(inventory, 'IMAGE', 'size').map(item => item.path), ['images/logo.png']);
assert.deepEqual(filterFileInventory(inventory, '', 'path').map(item => item.path), ['=HYPERLINK("x")', 'images/logo.png']);
assert.deepEqual(filterFileInventory(inventory, '', 'size').map(item => item.sizeBytes), [120, 20]);
const csv = fileInventoryCsv(inventory);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes("\"'=HYPERLINK("), 'Prevent spreadsheet formula execution');
assert.ok(!csv.includes('DO_NOT_EXPORT'), 'Never serialize non-allowlisted inventory fields');
assert.throws(() => readFileInventory({ objects: Array.from({ length: FILE_INVENTORY_LIMIT + 1 }, () => ({})) }), /inventory response/);
assert.throws(() => readFileInventory({ objects: [null] }), /inventory entry/);
assert.throws(() => readFileInventory({ objects: [{ path: 'x', size_bytes: -1, content_type: 'x', created_at: '', updated_at: '' }] }), /inventory entry/);
const routing = read('web/app/service-resource-detail.tsx');
const ui = read('web/app/service-inventory-tools.tsx');
const css = read('web/app/service-inventory-tools.css');
assert.match(routing, /<JsonBackupTools/, 'JSON manager includes backup tools');
assert.match(routing, /<FilesInventoryTools/, 'Files manager includes inventory tools');
assert.match(ui, /await collectJsonBackup\(id, api\)/, 'Use authenticated workspace API for backup');
assert.match(ui, /await api\(`\/api\/picosvc\/files\/spaces\//, 'Use authenticated workspace API for inventory');
assert.match(ui, /visible\.slice\(0, 100\)/, 'Limit DOM rows');
assert.match(ui, /fileInventoryCsv\(visible\)/, 'Export the entire filtered result rather than the table preview');
assert.match(ui, /URL\.revokeObjectURL/, 'Release temporary browser URLs');
assert.match(ui, /role="alert"/, 'Announce errors accessibly');
assert.match(css, /@media/, 'Responsive tools');
console.log('PicoSvc JSON/Files inventory tools: bounded paging, honest partial exports, CSV escaping and manager routing OK.');
