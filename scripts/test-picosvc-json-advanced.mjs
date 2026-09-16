import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0019_picosvc_json_access.sql', import.meta.url), 'utf8');
assert.match(migration, /ADD COLUMN public_read INTEGER NOT NULL DEFAULT 0/, 'Stores must remain private by default');
assert.match(migration, /CHECK \(scope IN \('read','write','readwrite'\)\)/, 'Scoped tokens must use constrained scopes');
assert.match(migration, /FOREIGN KEY \(store_id\) REFERENCES json_stores\(id\) ON DELETE CASCADE/, 'Revoked stores must cascade token deletion');
const jsonApi = readFileSync(new URL('../src/picosvc/json-advanced.ts', import.meta.url), 'utf8');
for (const invariant of [
  /json_store_tokens/, /tokenScopeAllows/, /key\.startsWith\(scoped\.key_prefix\)/,
  /scoped\.expires_at.*Date\.parse/, /public_read/, /if-none-match/, /if-match/,
  /status: 304/, /status: 204/, /currentEtag/, /updated_at=\? AND value_json=\?/,
  /ON CONFLICT\(store_id,key\) DO NOTHING/, /MAX_EXPORT_BYTES/,
  /WHERE store_id=\? AND key>\? ORDER BY key LIMIT 101/,
  /WHERE id=\? AND owner=\?/, /WHERE store_id=\? AND owner=\?/, /DELETE FROM json_store_tokens WHERE id=\? AND store_id=\? AND owner=\?/,
]) assert.match(jsonApi, invariant, `Missing JSON invariant: ${invariant}`);
const scopedGuard = readFileSync(new URL('../src/picosvc/json-scoped-guard.ts', import.meta.url), 'utf8');
assert.match(scopedGuard, /JSON document limit reached/, 'Scoped writers must honor document count caps');
assert.match(scopedGuard, /JSON storage limit reached/, 'Scoped writers must honor storage caps');
assert.match(scopedGuard, /key\.startsWith\(scoped\.key_prefix\)/, 'Scoped writer guard must enforce key prefix');
const entry = readFileSync(new URL('../src/picosvc-entry.ts', import.meta.url), 'utf8');
assert.match(entry, /jsonScopedWriteGuard\(request, env\)/, 'Scoped quota guard must run before JSON public route');
assert.ok(entry.indexOf('jsonAdvancedRuntimeRoute,') < entry.indexOf('dataRuntimeRoute,'), 'Advanced JSON must precede legacy public handler');
const routes = readFileSync(new URL('../src/picosvc/routes.ts', import.meta.url), 'utf8');
assert.ok(routes.indexOf('jsonAdvancedManagementRoutes,') < routes.indexOf('dataManagementRoutes,'), 'Advanced management must precede legacy routes');
assert.match(entry, /if-match,if-none-match/, 'JSON conditional headers must be accepted via CORS');
assert.match(entry, /access-control-expose-headers.*etag/, 'JSON ETag must be exposed via CORS');
console.log('Advanced JSON OK: scoped/private access, ETag CAS, export, quota protection and route invariants.');
