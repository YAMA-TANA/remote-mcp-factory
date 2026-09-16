import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(new URL('../src/picosvc/mcp-observability.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/picosvc-entry.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../src/picosvc/routes.ts', import.meta.url), 'utf8');
assert.match(source, /mcp_runtime_events/);
assert.match(source, /mcp_request_daily/);
assert.match(source, /owner=\?/);
assert.match(source, /LIMIT \?/);
assert.match(source, /MAX_EVENTS_PER_SERVER = 500/);
assert.match(source, /stopRuntime/);
assert.match(source, /buildServer/);
assert.match(source, /consumeUsage\(env, row\.owner, 'mcp', 'builds'\)/);
assert.match(source, /redeploy/);
assert.match(routes, /mcpObservabilityManagementRoutes/);
assert.match(entry, /mcpObservedRuntimeRoute/);
assert.match(entry, /legacyEntry\.fetch\(request, env, ctx\)/);

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
for (const migration of readdirSync(new URL('../migrations/', import.meta.url)).filter((name) => /^00(?:1[0-9]|2[0-8])_.*\.sql$/.test(name)).sort()) {
  db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
}
const now = new Date().toISOString();
db.prepare("INSERT INTO servers (id,owner,name,repo_url,branch,subdir,token_hash,visibility,enabled,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
  .run('mcp-test01','owner-a','test','https://github.com/example/test','main','','hash','token',1,'ready',now,now);
db.prepare('INSERT INTO mcp_request_daily (server_id,owner,day,requests,errors,duration_ms,updated_at) VALUES (?,?,?,?,?,?,?)')
  .run('mcp-test01','owner-a','2026-09-16',7,2,350,now);
const metric = db.prepare('SELECT requests,errors,duration_ms FROM mcp_request_daily WHERE server_id=? AND owner=?').get('mcp-test01','owner-a');
assert.deepEqual(metric, { requests: 7, errors: 2, duration_ms: 350 });
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mcp_request_daily WHERE server_id=? AND owner=?').get('mcp-test01','owner-b').n, 0);
db.close();
console.log('PicoSvc MCP observability smoke OK');
