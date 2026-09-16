import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0018_picosvc_qr_analytics.sql', import.meta.url), 'utf8');
assert.match(migration, /CREATE TABLE IF NOT EXISTS qr_scan_daily/, 'QR daily analytics table required');
assert.match(migration, /PRIMARY KEY \(link_id, day, country, device, referrer\)/, 'QR analytics must aggregate bounded dimensions');

const utility = readFileSync(new URL('../src/picosvc/utility-advanced.ts', import.meta.url), 'utf8');

// Fetch category-core.
assert.match(utility, /schema: 'picosvc\.fetch\.v1'/, 'Fetch must return a stable output schema');
assert.match(utility, /body\?\.readable === true/, 'Fetch must support readable-content extraction');
assert.match(utility, /MAX_FETCH_BYTES = 2 \* 1024 \* 1024/, 'Fetch must have a hard upstream body ceiling');
assert.match(utility, /MAX_FETCH_OUTPUT = 2 \* 1024 \* 1024/, 'Fetch must have a hard output ceiling');
assert.match(utility, /MAX_BROWSER_TIMEOUT_MS = 20_000/, 'Fetch/Shot must have a bounded browser timeout');
assert.match(utility, /upstream_too_large/, 'Fetch must return categorized errors');
assert.match(utility, /browser_timeout|timeout/, 'Fetch must surface timeout errors');

// Shot category-core.
assert.match(utility, /viewport: \{ width, height, deviceScaleFactor \}/, 'Shot must support viewport controls');
assert.match(utility, /waitForTimeout/, 'Shot must support bounded wait/delay');
assert.match(utility, /options\.selector = selector/, 'Shot must support element screenshots');
assert.match(utility, /setExtraHTTPHeaders/, 'Shot must support extra HTTP headers');
assert.match(utility, /cookies\.length \? \{ cookies \}/, 'Shot must support cookies');
assert.match(utility, /quickActionWithDeadline/, 'Shot must enforce a hard wall deadline around Browser Run');

// QR category-core.
assert.match(utility, /qr_scan_daily/, 'QR redirect must record daily analytics');
assert.match(utility, /deviceCategory/, 'QR analytics must aggregate device class');
assert.match(utility, /referrerCategory/, 'QR analytics must aggregate referrer');
assert.match(utility, /cf\?: \{ country\?: string \}/, 'QR analytics must record country when Cloudflare supplies it');
assert.match(utility, /QRCode\.toDataURL/, 'QR must support PNG download');
assert.match(utility, /QRCode\.toString/, 'QR must support SVG download');
assert.match(utility, /errorCorrectionLevel/, 'QR must support error-correction controls');
assert.match(utility, /dark.*light/s, 'QR must support basic color styling');
assert.match(utility, /\/analytics\$/, 'QR must expose analytics endpoint');
assert.match(utility, /\/code\$/, 'QR must expose authenticated code download endpoint');

const routes = readFileSync(new URL('../src/picosvc/routes.ts', import.meta.url), 'utf8');
assert.match(routes, /utilityAdvancedManagementRoutes/, 'Advanced utility management routes must be wired');
const entry = readFileSync(new URL('../src/picosvc-entry.ts', import.meta.url), 'utf8');
assert.match(entry, /utilityAdvancedRuntimeRoute/, 'Analytics-aware QR runtime must be wired');

console.log('PicoSvc advanced utilities OK: Fetch, Shot and QR category-core invariants present.');
