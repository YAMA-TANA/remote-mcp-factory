import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const migrations = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((file) => /^00(?:1[0-9]|[2-9][0-9])_.*\.sql$/.test(file))
  .filter((file) => Number(file.slice(0, 4)) >= 10)
  .sort();
assert.ok(migrations.length >= 19, 'Expected PicoSvc additive migrations 0010–0028');
for (const migration of migrations) {
  const sql = readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8');
  try { db.exec(sql); }
  catch (error) { throw new Error(`${migration}: ${error instanceof Error ? error.message : String(error)}`); }
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', `${migration}: SQLite integrity check failed`);
}
const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
for (const table of [
  'rss_feeds', 'rss_entries', 'webhook_events', 'webhook_deliveries', 'mock_endpoints', 'mock_rules', 'mock_requests',
  'qr_links', 'qr_scan_daily', 'flag_projects', 'feature_flags', 'mcp_sandbox_active_minutes', 'mcp_runtime_events', 'mcp_request_daily',
  'mail_events', 'mail_attachments', 'cron_runs', 'cron_job_options', 'cron_dispatch_claims',
  'cron_run_attempts', 'cron_notifications', 'file_objects', 'json_documents', 'json_store_tokens',
  'license_activations', 'license_validation_history', 'function_revisions', 'function_secrets', 'function_invocations',
  'form_options', 'form_deliveries', 'monitor_options', 'monitor_events',
]) assert.ok(columns(table).size > 0, `${table}: missing table`);
assert.ok(columns('webhook_events').has('body_r2_key'), 'Hooks R2 pointer missing');
assert.ok(columns('rss_feeds').has('item_selector'), 'RSS item selector missing');
assert.ok(columns('rss_feeds').has('date_selector'), 'RSS date selector missing');
assert.ok(columns('flag_projects').has('version'), 'Remote Config version missing');
assert.ok(columns('qr_scan_daily').has('country'), 'QR country analytics missing');
assert.ok(columns('json_stores').has('public_read'), 'JSON private/public setting missing');
assert.ok(columns('license_keys').has('activation_limit'), 'License activation cap missing');
assert.ok(columns('license_keys').has('device_binding'), 'License device binding setting missing');
assert.ok(columns('license_keys').has('customer_ref'), 'License customer reference missing');
assert.ok(columns('file_spaces').has('access_mode'), 'Files access mode missing');
assert.ok(columns('file_objects').has('cache_control'), 'Files cache metadata missing');
assert.ok(columns('mail_routes').has('signing_ciphertext'), 'Mail signing key encryption missing');
assert.ok(columns('mail_events').has('next_retry_at'), 'Mail retry scheduling missing');
assert.ok(columns('mail_events').has('payload_r2_key'), 'Mail retry payload pointer missing');
assert.ok(columns('cron_job_options').has('timezone'), 'Cron timezone missing');
assert.ok(columns('cron_job_options').has('expected_status'), 'Cron expected status missing');
assert.ok(columns('function_apps').has('current_revision'), 'Function revision pointer missing');
assert.ok(columns('function_revisions').has('revision_no'), 'Function revision log missing');
assert.ok(columns('function_invocations').has('status_code'), 'Function execution log missing');
assert.ok(columns('form_options').has('require_turnstile'), 'Forms Turnstile control missing');
assert.ok(columns('form_deliveries').has('response_status'), 'Forms forwarding status missing');
assert.ok(columns('monitor_options').has('last_content_hash'), 'Monitor content baseline missing');
assert.ok(columns('monitor_events').has('event_type'), 'Monitor change/error events missing');
assert.ok(columns('mcp_runtime_events').has('duration_ms'), 'MCP runtime event timing missing');
assert.ok(columns('mcp_request_daily').has('errors'), 'MCP request error metrics missing');
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_mail_retry_cap'").get(), 'Mail retry cap trigger missing');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], 'Foreign key validation failed');
console.log(`D1 migration smoke OK: schema.sql + ${migrations.length} additive migrations (${migrations[0]} to ${migrations.at(-1)}).`);
db.close();
