import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(`
  CREATE TABLE json_stores (id TEXT PRIMARY KEY, owner TEXT NOT NULL);
  CREATE TABLE json_documents (store_id TEXT NOT NULL REFERENCES json_stores(id) ON DELETE CASCADE,
    key TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(store_id,key));
  INSERT INTO json_stores VALUES ('a','alice'),('b','alice'),('c','bob');
  INSERT INTO json_documents VALUES ('a','x','"hello"'),('a','y','"world"'),('b','z','"漢字"'),('c','x','"bob"');
`);
db.exec(source('migrations/0031_picosvc_resource_guards.sql'));
const state = store => db.prepare('SELECT documents,bytes FROM json_store_usage WHERE store_id=?').get(store);
const byteLength = text => Buffer.byteLength(text, 'utf8');
assert.deepEqual(state('a'), { documents: 2, bytes: byteLength('"hello"') + byteLength('"world"') });
assert.deepEqual(state('b'), { documents: 1, bytes: byteLength('"漢字"') });
assert.deepEqual(state('c'), { documents: 1, bytes: byteLength('"bob"') });
db.exec(`INSERT INTO json_documents VALUES ('a','new','"🚀"');`);
assert.deepEqual(state('a'), { documents: 3, bytes: byteLength('"hello"') + byteLength('"world"') + byteLength('"🚀"') });
db.exec(`UPDATE json_documents SET value_json='"updated"' WHERE store_id='a' AND key='x';`);
assert.deepEqual(state('a'), { documents: 3, bytes: byteLength('"updated"') + byteLength('"world"') + byteLength('"🚀"') });
db.exec(`DELETE FROM json_documents WHERE store_id='a' AND key='y';`);
assert.deepEqual(state('a'), { documents: 2, bytes: byteLength('"updated"') + byteLength('"🚀"') });
assert.throws(() => db.exec(`UPDATE json_documents SET store_id='c' WHERE store_id='a';`), /Moving JSON documents/);
assert.deepEqual(state('c'), { documents: 1, bytes: byteLength('"bob"') });
db.exec(`DELETE FROM json_stores WHERE id='a';`);
assert.equal(state('a'), undefined, 'Store usage must cascade away with its store');
assert.deepEqual(state('b'), { documents: 1, bytes: byteLength('"漢字"') });
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

const browserGate = source('src/picosvc/browser-execution-gate.ts');
assert.match(browserGate, /ON CONFLICT\(owner\) DO UPDATE/, 'Browser lease must be an atomic upsert');
assert.match(browserGate, /lease_until_ms <= \?/, 'An active lease must reject a concurrent browser job');
assert.match(browserGate, /WHERE owner=\? AND token=\?/, 'A stale completion cannot release a newer lease');
const acquire = db.prepare(`
 INSERT INTO picosvc_browser_leases (owner,token,lease_until_ms,next_allowed_ms,updated_at_ms)
 VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET token=excluded.token,
 lease_until_ms=excluded.lease_until_ms,next_allowed_ms=excluded.next_allowed_ms,updated_at_ms=excluded.updated_at_ms
 WHERE picosvc_browser_leases.lease_until_ms <= ? AND picosvc_browser_leases.next_allowed_ms <= ?
 RETURNING token
`);
assert.equal(acquire.get('alice','first',180000,2000,0,0,0).token,'first');
assert.equal(acquire.get('alice','second',180001,2001,1,1,1),undefined, 'Overlapping job must be rejected');
const staleRelease = db.prepare('UPDATE picosvc_browser_leases SET lease_until_ms=0 WHERE owner=? AND token=?');
staleRelease.run('alice','other');
assert.equal(acquire.get('alice','early',180002,2002,2,2,2),undefined);
staleRelease.run('alice','first');
assert.equal(acquire.get('alice','cooldown',180003,2003,3,3,3),undefined, 'Cooldown must survive release');
assert.equal(acquire.get('alice','new',182001,4001,2001,2001,2001).token,'new');
assert.equal(acquire.get('bob','independent',180000,2000,0,0,0).token,'independent');

const jsonGuard = source('src/picosvc/cost-guardrails.ts');
assert.match(jsonGuard, /FROM json_store_usage u JOIN json_stores s/, 'JSON PUT must use per-store counters');
assert.doesNotMatch(jsonGuard, /FROM json_documents d\s+JOIN json_stores/, 'JSON PUT must not scan all documents');
assert.match(source('src/picosvc/json-scoped-guard.ts'), /jsonWriteGuard\(/, 'Scoped tokens must use the same capacity guard');
assert.match(source('src/picosvc/json-export-gate.ts'), /consumeUsage\(env, store.owner, 'json', 'requests'\)/, 'Exports must consume the existing monthly quota');
assert.doesNotMatch(source('src/picosvc/shot-quality.ts'), /Promise\.race\(/, 'Shot must not orphan a timed-out browser');
assert.doesNotMatch(source('src/picosvc/fetch-reliable.ts'), /Promise\.race\(/, 'Fetch must not orphan a timed-out browser');
console.log('PicoSvc resource gates OK: lease/cooldown isolation, JSON insert/update/delete/cascade and abuse guards.');
db.close();
