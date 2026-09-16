import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const onboarding = read('src/picosvc/reliable-onboarding.ts');
const routes = read('src/picosvc/routes.ts');
const entry = read('src/picosvc-entry.ts');
const monitorPage = read('web/app/[locale]/[service]/page.tsx');
const diagnostics = read('web/app/monitor-diagnostics.tsx');

assert.ok(routes.indexOf('reliableOnboardingRoutes,') < routes.indexOf('monitorAdvancedManagementRoutes,'), 'Reliable creation must run before Monitor management');
assert.ok(routes.indexOf('reliableOnboardingRoutes,') < routes.indexOf('automationManagementRoutes,'), 'Reliable creation must run before legacy RSS/Monitor creation');
assert.match(onboarding, /response\.status !== 201/, 'Do not interfere with validation, auth or quota error responses');
assert.match(onboarding, /feed\.last_checked_at && count > 0/, 'RSS must have content before reporting ready');
assert.match(onboarding, /initial_rss_fetch_failed/, 'Initial RSS errors must have a stable code');
assert.match(onboarding, /DELETE FROM rss_feeds WHERE id=\? AND owner=\?/, 'Failed RSS feeds must be removed');
assert.match(onboarding, /quantity=MAX\(0,quantity-1\)/, 'Failed RSS attempts must refund one monthly check');
assert.match(onboarding, /INSERT INTO monitor_options/, 'New Monitors must use tracked mode');
assert.match(onboarding, /UPDATE monitors SET enabled=0/, 'Disable legacy Monitor scheduler when tracking is enabled');
assert.match(onboarding, /monitor_setup_unavailable/, 'Missing monitoring migrations must produce a useful error');
assert.match(diagnostics, /\/events`/, 'Monitor UI must request actual event history');
assert.match(diagnostics, /\/options`/, 'Monitor UI must expose extraction configuration');
assert.match(monitorPage, /<MonitorDiagnostics\s*\/>/, 'Monitor workspace must display diagnostics');
assert.match(entry, /x-request-id,x-picosvc-image-size,x-picosvc-tier/, 'Expose actionable response metadata across CORS');
assert.match(entry, /internal_error/, 'Unexpected errors must have a stable code');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(read('schema.sql'));
db.exec(read('migrations/0010_picosvc_all_services.sql'));
db.exec(read('migrations/0027_picosvc_monitor_advanced.sql'));
const now = new Date().toISOString();
const id = '00000000-0000-4000-8000-000000000111';
db.prepare('INSERT INTO monitors(id,owner,name,target_url,enabled,created_at,updated_at) VALUES (?,?,?,?,1,?,?)')
  .run(id, 'test-owner', 'Homepage', 'https://example.com/', now, now);
// Apply the two onboarding statements using the same columns and values as production.
db.prepare(`INSERT INTO monitor_options(monitor_id,owner,enabled,content_selector,ignore_selector,strip_pattern,created_at,updated_at)
  VALUES (?,?,1,NULL,NULL,NULL,?,?)`).run(id, 'test-owner', now, now);
db.prepare('UPDATE monitors SET enabled=0,updated_at=? WHERE id=? AND owner=?').run(now, id, 'test-owner');
assert.equal(db.prepare('SELECT enabled FROM monitors WHERE id=?').get(id).enabled, 0, 'Legacy scheduler must not double-run the monitor');
assert.equal(db.prepare('SELECT enabled FROM monitor_options WHERE monitor_id=?').get(id).enabled, 1, 'Tracked scheduler must be active');
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM monitors m JOIN monitor_options o ON o.monitor_id=m.id WHERE m.enabled=0 AND o.enabled=1').get().count, 1);

const feedId = '00000000-0000-4000-8000-000000000222';
db.prepare('INSERT INTO rss_feeds(id,owner,public_id,name,source_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .run(feedId, 'test-owner', 'a'.repeat(32), 'Feed', 'https://example.com/', now, now);
db.prepare('INSERT INTO rss_entries(id,feed_id,title,link,guid,published_at) VALUES(?,?,?,?,?,?)')
  .run('entry-id', feedId, 'Test', 'https://example.com/a', 'guid', now);
db.prepare('INSERT INTO product_usage_monthly(owner,product,metric,month,quantity,updated_at) VALUES(?,?,?,?,?,?)')
  .run('test-owner', 'rss', 'checks', now.slice(0, 7), 1, now);
db.prepare('DELETE FROM rss_feeds WHERE id=? AND owner=?').run(feedId, 'test-owner');
db.prepare(`UPDATE product_usage_monthly SET quantity=MAX(0,quantity-1),updated_at=? WHERE owner=? AND product='rss' AND metric='checks' AND month=? AND quantity>0`)
  .run(now, 'test-owner', now.slice(0, 7));
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rss_entries WHERE feed_id=?').get(feedId).count, 0, 'Failed feed cleanup must cascade to entries');
assert.equal(db.prepare("SELECT quantity FROM product_usage_monthly WHERE owner='test-owner' AND product='rss'").get().quantity, 0, 'Failed feed check must be refunded');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], 'No orphaned foreign keys');
db.close();
console.log('PicoSvc onboarding contracts and D1 cleanup / scheduler isolation OK.');
