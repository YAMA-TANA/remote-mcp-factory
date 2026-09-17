import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const guard = read('src/picosvc/flags-write-guard.ts');
const data = read('src/picosvc/data-services.ts');
const routes = read('src/picosvc/routes.ts');
assert.ok(routes.indexOf('flagsWriteGuard,') < routes.indexOf('dataManagementRoutes,'), 'Null-safe write handling must precede legacy');
for (const fragment of ['request.clone().json()', 'requireIdentity(request, env)', 'id=? AND owner=?', "productLimit(env, owner, 'flags', 'flags')", "bind(project.id, key, 'null', enabled, now)"]) {
  assert.ok(guard.includes(fragment), `Missing null write protection: ${fragment}`);
}
assert.match(data, /WHERE project_id=\? AND enabled=1 ORDER BY key/, 'Only enabled flags may be publicly returned');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(read('schema.sql'));
const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter(file => /^00(?:1[0-9]|[2-9][0-9])_.*\.sql$/.test(file) && Number(file.slice(0, 4)) >= 10).sort();
for (const file of migrations) db.exec(read(`migrations/${file}`));
const time = '2026-09-17T00:00:00.000Z';
const insertProject = db.prepare('INSERT INTO flag_projects (id,owner,public_id,name,created_at,updated_at) VALUES (?,?,?,?,?,?)');
insertProject.run('project-a', 'owner-a', 'a'.repeat(32), 'A', time, time);
insertProject.run('project-b', 'owner-b', 'b'.repeat(32), 'B', time, time);
const write = db.prepare(`INSERT INTO feature_flags (project_id,key,value_json,enabled,updated_at) VALUES (?,?,?,?,?)
  ON CONFLICT(project_id,key) DO UPDATE SET value_json=excluded.value_json,enabled=excluded.enabled,updated_at=excluded.updated_at`);
write.run('project-a', 'nullable', 'null', 1, time);
write.run('project-a', 'hidden', 'true', 0, time);
write.run('project-b', 'nullable', 'false', 1, time);
const published = db.prepare('SELECT key,value_json FROM feature_flags WHERE project_id=? AND enabled=1 ORDER BY key').all('project-a');
assert.deepEqual(published.map(row => [row.key, JSON.parse(row.value_json)]), [['nullable', null]], 'Disabled flags must be absent, explicit null must roundtrip');
assert.equal(db.prepare('SELECT COUNT(*) AS total FROM feature_flags WHERE project_id=?').get('project-b').total, 1, 'Other tenants must remain unchanged');
write.run('project-a', 'nullable', 'null', 0, time);
assert.deepEqual(db.prepare('SELECT key FROM feature_flags WHERE project_id=? AND enabled=1').all('project-a'), [], 'Unpublishing must hide the flag');
write.run('project-a', 'nullable', 'null', 1, time);
assert.equal(JSON.parse(db.prepare('SELECT value_json FROM feature_flags WHERE project_id=? AND key=?').get('project-a', 'nullable').value_json), null, 'Republishing cannot turn null into false');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
db.close();
console.log('PicoSvc Flags SQL smoke: null roundtrip, disabled exclusion, publication and tenant separation OK.');
