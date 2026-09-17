import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readQrAnalytics, qrAnalyticsCsv, rssSettingsSnapshot, validQrRange } from '../web/app/service-link-insights-data.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const id = '00000000-0000-4000-8000-000000000001';
const payload = {
  linkId: id, days: 30, since: '2026-08-19',
  daily: [{ day: '2026-09-16', scans: 2 }, { day: '2026-09-17', scans: 3 }],
  countries: [{ country: 'JP', scans: 4 }], devices: [{ device: 'mobile', scans: 5 }],
  referrers: [{ referrer: '=HYPERLINK("https://unsafe.test")', scans: 1 }],
  owner: 'DO_NOT_EXPORT', userAgent: 'DO_NOT_EXPORT', ip: 'DO_NOT_EXPORT',
};
assert.ok(validQrRange(7) && validQrRange(30) && validQrRange(90) && validQrRange(365));
assert.equal(validQrRange(366), false);
const analytics = readQrAnalytics(payload, id, 30);
assert.equal(analytics.total, 5);
assert.equal(analytics.daily.length, 2);
const csv = qrAnalyticsCsv(analytics);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('"day","2026-09-16","2"'));
assert.ok(csv.includes("'=HYPERLINK"), 'Escape formula-like referrers');
assert.ok(!csv.includes('DO_NOT_EXPORT'), 'Never include unapproved visitor fields');
assert.throws(() => readQrAnalytics(payload, 'another-id', 30), /Invalid QR analytics response/);
assert.throws(() => readQrAnalytics(payload, id, 7), /Invalid QR analytics response/);
assert.throws(() => readQrAnalytics({ ...payload, daily: [{ day: 'today', scans: 2 }] }, id, 30), /date/);
assert.throws(() => readQrAnalytics({ ...payload, countries: [{ country: 'JP', scans: -1 }] }, id, 30), /row/);
assert.throws(() => readQrAnalytics({ ...payload, referrers: Array.from({ length: 51 }, () => ({ referrer: 'a', scans: 1 })) }, id, 30), /response/);
assert.throws(() => readQrAnalytics({ ...payload, daily: Array.from({ length: 366 }, () => ({ day: '2026-09-17', scans: 1 })) }, id, 30), /response/);
const resource = { id, owner: 'DO_NOT_EXPORT', name: 'News feed', enabled: true, source_url: 'https://example.com/?token=SECRET_QUERY', item_selector: '.post', titleSelector: 'h2', last_hash: 'DO_NOT_EXPORT' };
const privateSnapshot = rssSettingsSnapshot(resource, false);
assert.equal(JSON.parse(privateSnapshot).schema, 'picosvc.rss.settings.v1');
assert.equal(JSON.parse(privateSnapshot).feed.selectors.itemSelector, '.post');
assert.equal(JSON.parse(privateSnapshot).feed.selectors.titleSelector, 'h2');
assert.ok(!privateSnapshot.includes('SECRET_QUERY'), 'Source URLs are opt-in');
assert.ok(!privateSnapshot.includes('DO_NOT_EXPORT'), 'Never include private owner IDs or hashes');
assert.equal(JSON.parse(rssSettingsSnapshot(resource, true)).feed.sourceUrl, resource.source_url);
const router = read('web/app/service-advanced-detail.tsx');
const ui = read('web/app/service-link-insights.tsx');
const css = read('web/app/service-link-insights.css');
assert.match(router, /<QrInsights resource=\{props\.resource\} api=\{props\.api\}/);
assert.match(router, /<RssSettingsExport resource=\{props\.resource\}/);
assert.match(ui, /\/api\/picosvc\/qr\/links\/\$\{encodeURIComponent\(id\)\}\/analytics\?days=\$\{days\}/);
assert.match(ui, /\/api\/picosvc\/qr\/links\/\$\{encodeURIComponent\(id\)\}\/code\?format=\$\{format\}/);
assert.match(ui, /response\.blob instanceof Blob/, 'Download authenticated bytes, not a public URL');
assert.match(ui, /URL\.revokeObjectURL/, 'Free temporary download URLs');
assert.match(ui, /let alive = true/, 'Ignore superseded analytics requests');
assert.match(ui, /data\?\.daily\.slice\(-45\)/, 'Bound chart DOM rows');
assert.match(ui, /role="alert"/, 'Accessible error state');
assert.match(ui, /includeSource, setIncludeSource\] = useState\(false\)/, 'Do not export source URL by default');
assert.match(css, /@media/, 'Responsive management panels');
console.log('PicoSvc QR/RSS insights: owner-scoped routes, analytics validation, safe CSV and opt-in source export OK.');
