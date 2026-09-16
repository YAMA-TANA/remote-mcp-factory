import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0020_picosvc_license_activations.sql', import.meta.url), 'utf8');
assert.match(migration, /activation_limit INTEGER CHECK/, 'Activation cap must be persisted');
assert.match(migration, /UNIQUE \(key_id, device_hash\)/, 'Device activations must deduplicate');
assert.match(migration, /FOREIGN KEY \(key_id\) REFERENCES license_keys\(id\) ON DELETE CASCADE/, 'Deleting keys must delete activation records');
const service = readFileSync(new URL('../src/picosvc/license-advanced.ts', import.meta.url), 'utf8');
for (const invariant of [
  /consumeUsage\(env, project\.owner, 'license', 'validations'\)/,
  /MAX_VALIDATE_BYTES = 16 \* 1024/,
  /await sha256Hex\(deviceId\)/,
  /activation_limit_reached/,
  /device_id_required/,
  /ON CONFLICT\(key_id,device_hash\) DO NOTHING RETURNING id/,
  /MAX_HISTORY = 100/,
  /ORDER BY checked_at DESC,id DESC LIMIT -1 OFFSET \?/,
  /WHERE id=\? AND owner=\?/,
  /SELECT device_hash,activated_at,last_seen_at FROM license_activations WHERE key_id=\? AND owner=\?/,
  /SELECT valid,reason,device_hash,checked_at FROM license_validation_history WHERE key_id=\? AND owner=\?/,
  /Device binding requires an activationLimit/,
]) assert.match(service, invariant, `Missing license invariant: ${invariant}`);
const routes = readFileSync(new URL('../src/picosvc/routes.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/picosvc-entry.ts', import.meta.url), 'utf8');
assert.ok(routes.indexOf('licenseAdvancedManagementRoutes,') < routes.indexOf('dataManagementRoutes,'), 'License management must intercept legacy route');
assert.ok(entry.indexOf('licenseAdvancedRuntimeRoute,') < entry.indexOf('dataRuntimeRoute,'), 'License validation must intercept legacy route');
console.log('Advanced License OK: per-device cap, owner authorization and bounded validation history invariants.');
