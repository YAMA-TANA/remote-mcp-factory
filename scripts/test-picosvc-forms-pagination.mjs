import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { escapeFormSearch, formCursor, parseFormCursor } from '../src/picosvc/forms-search.ts';

const source = readFileSync(new URL('../src/picosvc/forms-search.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../src/picosvc/routes.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../web/app/service-forms-management.tsx', import.meta.url), 'utf8');
assert.ok(routes.indexOf('formsSearchManagementRoutes,') < routes.indexOf('formsAdvancedManagementRoutes,'), 'Fixed search must run before legacy search');
assert.match(source, /requireIdentity\(request, env\)/, 'Search must require user identity');
assert.match(source, /WHERE id=\? AND owner=\?/, 'Form must belong to requesting owner');
assert.match(source, /WHERE form_id=\? AND owner=\?/, 'Submission query must enforce tenant isolation');
assert.match(source, /LIMIT \?/, 'Search and export queries must have a SQL limit');
assert.match(source, /ESCAPE '\\\\'/, 'LIKE must have an explicit single-character escape');
assert.match(ui, /result\.nextBefore/, 'Existing UI must forward the opaque cursor');
assert.match(ui, /\{ before \}/, 'Client must URL-encode the cursor via URLSearchParams');

const now = '2026-09-17T07:00:00.000Z';
assert.equal(parseFormCursor(null), null);
assert.deepEqual(parseFormCursor(now), { timestamp: now, id: '' }, 'Old timestamp cursors remain accepted');
for (const invalid of ['', 'hello', '2026-99-17T07:00:00.000Z', now + '~bad', now + '~' + 'a'.repeat(500)]) assert.equal(parseFormCursor(invalid), undefined, `Reject malformed cursor ${invalid}`);
const identity = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
assert.deepEqual(parseFormCursor(formCursor({ received_at: now, id: identity(125) })), { timestamp: now, id: identity(125) });
assert.equal(escapeFormSearch('a%b_c\\d'), 'a\\%b\\_c\\\\d');

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE form_submissions (id TEXT PRIMARY KEY, form_id TEXT NOT NULL, owner TEXT NOT NULL, payload_json TEXT NOT NULL, received_at TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO form_submissions (id,form_id,owner,payload_json,received_at) VALUES (?,?,?,?,?)');
for (let n = 1; n <= 205; n++) insert.run(identity(n), 'form-a', 'owner-a', JSON.stringify({ text: `row-${n}` }), now);
for (let n = 206; n <= 207; n++) insert.run(identity(n), 'form-a', 'owner-a', JSON.stringify({ text: `older-${n}` }), '2026-09-16T07:00:00.000Z');
insert.run(identity(208), 'form-a', 'owner-a', JSON.stringify({ text: 'newer' }), '2026-09-18T07:00:00.000Z');
for (let n = 209; n <= 212; n++) insert.run(identity(n), 'form-a', 'owner-b', JSON.stringify({ text: 'other owner' }), now);
for (let n = 213; n <= 215; n++) insert.run(identity(n), 'form-b', 'owner-a', JSON.stringify({ text: 'other form' }), now);

function page(raw, query = '') {
  const decoded = parseFormCursor(raw);
  assert.notEqual(decoded, undefined);
  const { timestamp, id } = decoded || { timestamp: '9999-12-31T23:59:59.999Z', id: '~' };
  const values = db.prepare(`SELECT id,payload_json,received_at FROM form_submissions
    WHERE form_id=? AND owner=? AND (received_at < ? OR (received_at = ? AND id < ?))
      AND payload_json LIKE ? ESCAPE '\\'
    ORDER BY received_at DESC,id DESC LIMIT ?`)
    .all('form-a', 'owner-a', timestamp, timestamp, id, `%${escapeFormSearch(query)}%`, 101);
  const result = values.slice(0, 100);
  return { rows: result, next: values.length > 100 ? formCursor(result.at(-1)) : null };
}
const ids = [];
let before = null;
let count = 0;
do {
  const result = page(before);
  ids.push(...result.rows.map(row => row.id));
  before = result.next;
  count++;
  assert.ok(count <= 4, 'Pagination must terminate');
} while (before);
assert.equal(count, 3, '208 items require 100 + 100 + 8 pages');
assert.equal(ids.length, 208);
assert.equal(new Set(ids).size, 208, 'No duplicate submission across timestamp ties');
assert.equal(ids[0], identity(208), 'Newest timestamp first');
assert.equal(ids[1], identity(205), 'Stable descending ID order for timestamp ties');
assert.equal(ids.at(-1), identity(206), 'Older timestamp last');
assert.equal(page(now).rows.length, 2, 'Legacy timestamp-only cursor remains exclusive');

insert.run(identity(216), 'form-a', 'owner-a', JSON.stringify({ text: 'has % literal' }), '2026-09-19T07:00:00.000Z');
insert.run(identity(217), 'form-a', 'owner-a', JSON.stringify({ text: 'has _ literal' }), '2026-09-19T07:00:00.000Z');
insert.run(identity(218), 'form-a', 'owner-a', JSON.stringify({ text: 'has \\ literal' }), '2026-09-19T07:00:00.000Z');
assert.deepEqual(page(null, '%').rows.map(row => row.id), [identity(216)], 'Percent is not a wildcard');
assert.deepEqual(page(null, '_').rows.map(row => row.id), [identity(217)], 'Underscore is not a wildcard');
assert.deepEqual(page(null, '\\').rows.map(row => row.id), [identity(218)], 'Backslash is matched literally');
assert.deepEqual(db.prepare('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }]);
db.close();
console.log('Forms lossless pagination: 3 pages without drops/duplicates, tenant filtering, literal %, _ and backslash, legacy cursors OK.');
