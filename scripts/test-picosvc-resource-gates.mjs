import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
for (const filename of readdirSync(new URL('../migrations/', import.meta.url))
  .filter((name) => /^00\d\d_.*\.sql$/.test(name) && Number(name.slice(0, 4)) >= 10).sort()) {
  db.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
}
const store = db.prepare('INSERT INTO json_stores (id,owner,public_id,name,token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
const insert = db.prepare('INSERT INTO json_documents (store_id,key,value_json,updated_at) VALUES (?,?,?,?)');
const update = db.prepare('UPDATE json_documents SET value_json=? WHERE store_id=? AND key=?');
const total = () => ({ ...db.prepare('SELECT documents,storage_bytes FROM picosvc_json_totals WHERE owner=?').get('alice') });
store.run('store-a', 'alice', 'a'.repeat(32), 'A', 'token-a', 'now', 'now');
store.run('store-b', 'alice', 'b'.repeat(32), 'B', 'token-b', 'now', 'now');
assert.deepEqual(total(), { documents: 0, storage_bytes: 0 }, 'Store creation creates a zero counter');
insert.run('store-a', 'first', '12345', 'now');
insert.run('store-b', 'second', 'abcdef', 'now');
assert.deepEqual(total(), { documents: 2, storage_bytes: 11 }, 'Documents across stores share one owner counter');
update.run('x', 'store-a', 'first');
assert.deepEqual(total(), { documents: 2, storage_bytes: 7 }, 'Overwrite uses byte delta, not a full scan');
// SQLite enforces limits inside each document write, even if two callers pass
// an application-level precheck based on the same previous counter value.
db.prepare('UPDATE picosvc_json_totals SET document_limit=2,byte_limit=8 WHERE owner=?').run('alice');
assert.throws(() => insert.run('store-a', 'third', 'a', 'now'), /json_quota_exceeded/, 'Concurrent insert cannot bypass the document cap');
assert.throws(() => update.run('12345', 'store-a', 'first'), /json_quota_exceeded/, 'Growing a value cannot bypass the byte cap');
update.run('', 'store-b', 'second');
assert.deepEqual(total(), { documents: 2, storage_bytes: 1 }, 'Shrinking remains possible at quota');
db.prepare('DELETE FROM json_documents WHERE store_id=? AND key=?').run('store-a', 'first');
assert.deepEqual(total(), { documents: 1, storage_bytes: 0 }, 'Deleting a document frees quota');
db.prepare('DELETE FROM json_stores WHERE id=?').run('store-b');
assert.deepEqual(total(), { documents: 0, storage_bytes: 0 }, 'Cascading store deletion frees quota exactly once');

const acquire = db.prepare(`
  INSERT INTO picosvc_browser_gates (owner,product,token,leased_until_ms,next_allowed_ms)
  VALUES (?,?,?,?,?)
  ON CONFLICT(owner,product) DO UPDATE SET token=excluded.token,
    leased_until_ms=excluded.leased_until_ms,next_allowed_ms=excluded.next_allowed_ms
  WHERE picosvc_browser_gates.leased_until_ms<=? AND picosvc_browser_gates.next_allowed_ms<=?
  RETURNING token
`);
assert.equal(acquire.get('alice', 'shot', 'first', 45000, 2000, 0, 0).token, 'first');
assert.equal(acquire.get('alice', 'shot', 'second', 45001, 2001, 1, 1), undefined, 'Concurrent browser call rejected');
assert.equal(acquire.get('alice', 'fetch', 'fetch', 45001, 2001, 1, 1).token, 'fetch', 'Separate service can run');
const release = db.prepare('UPDATE picosvc_browser_gates SET leased_until_ms=0,next_allowed_ms=? WHERE owner=? AND product=? AND token=?');
release.run(3000, 'alice', 'shot', 'first');
assert.equal(acquire.get('alice', 'shot', 'too-soon', 45002, 2002, 1000, 1000), undefined, 'Cooldown blocks rapid requests');
assert.equal(acquire.get('alice', 'shot', 'new', 48001, 5001, 3001, 3001).token, 'new');
release.run(4000, 'alice', 'shot', 'first');
assert.equal(db.prepare('SELECT token FROM picosvc_browser_gates WHERE owner=? AND product=?').get('alice', 'shot').token, 'new', 'Old lease cannot unlock replacement');

const reserve = db.prepare(`
  INSERT INTO picosvc_browser_usage (owner,product,month,used_ms) VALUES (?,?,?,20000)
  ON CONFLICT(owner,product,month) DO UPDATE SET used_ms=picosvc_browser_usage.used_ms+excluded.used_ms
  WHERE picosvc_browser_usage.used_ms+excluded.used_ms<=120000 RETURNING used_ms
`);
for (let index = 1; index <= 6; index++) assert.equal(reserve.get('alice', 'shot', '2026-09').used_ms, index * 20000);
assert.equal(reserve.get('alice', 'shot', '2026-09'), undefined, 'Browser-time cap rejects new actions');
db.prepare('UPDATE picosvc_browser_usage SET used_ms=used_ms-15000 WHERE owner=? AND product=? AND month=?').run('alice', 'shot', '2026-09');
assert.equal(reserve.get('alice', 'shot', '2026-09'), undefined, 'Reservation must fit remaining time');
db.prepare('UPDATE picosvc_browser_usage SET used_ms=used_ms-5000 WHERE owner=? AND product=? AND month=?').run('alice', 'shot', '2026-09');
assert.equal(reserve.get('alice', 'shot', '2026-09').used_ms, 120000, 'Measured time refund restores available budget');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
console.log('PicoSvc resource gates OK: JSON delta counters, atomic caps, store cascades, browser concurrency, cooldown and monthly budget.');
db.close();
