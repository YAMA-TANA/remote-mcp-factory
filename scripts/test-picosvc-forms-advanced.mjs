import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const src = read('src/picosvc/forms-advanced.ts');
const routes = read('src/picosvc/routes.ts');
const entry = read('src/picosvc-entry.ts');
for (const fragment of [
  'allowedOrigins', 'requiredFields', 'honeypotField', 'verifyTurnstile',
  'TURNSTILE_SECRET_KEY', 'form_deliveries', 'fetchPublic(settings.webhookUrl',
  'consumeUsage(env, form.owner', 'text/csv', 'successRedirect',
  'form_id=? AND owner=?', 'form_id=?',
]) assert.ok(src.includes(fragment), `Missing Forms control: ${fragment}`);
assert.ok(routes.indexOf('formsAdvancedManagementRoutes,') < routes.indexOf('dataManagementRoutes,'), 'Advanced Forms management must precede legacy');
assert.ok(entry.indexOf('formsAdvancedRuntimeRoute,') < entry.indexOf('dataRuntimeRoute,'), 'Advanced Forms runtime must precede legacy');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(read('schema.sql'));
const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter((file) => /^00(?:1[0-9]|[2-9][0-9])_.*\.sql$/.test(file) && Number(file.slice(0, 4)) >= 10).sort();
for (const file of migrations) db.exec(read(`migrations/${file}`));
const now = '2026-09-16T00:00:00.000Z';
db.prepare('INSERT INTO forms(id,owner,public_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('f1', 'owner-a', 'public1', 'Form', now, now);
db.prepare('INSERT INTO form_options(form_id,owner,allowed_origins_json,required_fields_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('f1','owner-a','["https://example.com"]','["email"]',now,now);
db.prepare('INSERT INTO form_submissions(id,form_id,owner,payload_json,received_at) VALUES(?,?,?,?,?)').run('s1','f1','owner-a','{"email":"a@example.com"}',now);
db.prepare('INSERT INTO form_deliveries(id,form_id,submission_id,owner,destination,delivered_at) VALUES(?,?,?,?,?,?)').run('d1','f1','s1','owner-a','https://example.com/hook',now);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM form_deliveries WHERE owner=?').get('owner-a').n, 1);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM form_deliveries WHERE owner=?').get('owner-b').n, 0);
db.prepare('DELETE FROM forms WHERE id=?').run('f1');
for (const table of ['form_options','form_submissions','form_deliveries']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, `Orphaned ${table}`);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
db.close();
console.log('Forms advanced route, spam/validation controls and SQL cascade smoke OK.');
