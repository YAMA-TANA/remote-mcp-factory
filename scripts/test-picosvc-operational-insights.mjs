import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeRecentHistory } from '../web/app/service-operations-insights-data.ts';
import { HISTORY_DEFINITIONS, readHistoryRows } from '../web/app/service-history-csv.ts';

const now = new Date('2026-09-17T12:00:00Z');
const cron = summarizeRecentHistory('cron', [
  { ran_at: '2026-09-17T10:00:00Z', response_status: 302, duration_ms: 120, error: null },
  { ran_at: '2026-09-16T10:00:00Z', response_status: 500, duration_ms: 80, error: 'unexpected response' },
  { ran_at: '2026-09-16T08:00:00Z', response_status: null, duration_ms: 0, error: null },
], now);
assert.equal(cron.total, 3);
assert.deepEqual([cron.positive, cron.negative, cron.other], [1, 1, 1], 'Cron honors configured non-2xx expected statuses and avoids claiming pending success');
assert.equal(cron.meanDurationMs, 100, 'an in-flight zero-duration placeholder must not dilute the average');
assert.equal(cron.measuredDurations, 2);
assert.equal(cron.latestAt, '2026-09-17T10:00:00.000Z');
assert.deepEqual(cron.daily.slice(-2).map(day => day.count), [2, 1]);

const mail = summarizeRecentHistory('mail', [
  { delivery_status: 'delivered', received_at: '2026-09-17T08:00:00Z', rawBase64: 'sensitive' },
  { delivery_status: 'failed' }, { delivery_status: 'quota_reached' },
  { delivery_status: 'retry' }, { delivery_status: 'pending' }, { delivery_status: 'sending' },
  { delivery_status: 'unexpected' },
], now);
assert.deepEqual([mail.positive, mail.negative, mail.waiting, mail.other], [1, 2, 3, 1]);
assert.equal(mail.meanDurationMs, null);

const functions = summarizeRecentHistory('functions', [
  { status_code: 204, duration_ms: 0, occurred_at: '2026-09-17T12:00:00Z' },
  { status_code: 302, duration_ms: 100 },
  { status_code: 500, duration_ms: 200 },
  { status_code: null, duration_ms: -2 },
  { status_code: 200, error: 'runtime error', duration_ms: 'nonsense' },
], now);
assert.deepEqual([functions.positive, functions.negative, functions.other], [2, 2, 1]);
assert.equal(functions.meanDurationMs, 100);
assert.equal(functions.measuredDurations, 3);

const monitor = summarizeRecentHistory('monitor', [
  { event_type: 'change', webhook_status: 204, created_at: '2026-09-17T01:00:00Z' },
  { event_type: 'change', webhook_status: 502, webhook_error: 'private detail' },
  { event_type: 'change', webhook_error: 'timeout' },
  { event_type: 'fetch_error', error: 'private error' },
  { event_type: 'unexpected' },
], now);
assert.deepEqual([monitor.positive, monitor.negative, monitor.other], [3, 1, 1]);
assert.deepEqual([monitor.notificationFailures, monitor.notificationAttempts], [2, 3]);
assert.equal(monitor.meanDurationMs, null);
assert.equal(summarizeRecentHistory('monitor', [], now).latestAt, null);
assert.equal(summarizeRecentHistory('monitor', [], now).daily.length, 7);

for (const service of ['cron', 'mail', 'functions', 'monitor']) {
  const spec = HISTORY_DEFINITIONS[service];
  const rows = readHistoryRows(service, { [spec.listKey]: Array.from({ length: spec.limit + 10 }, () => ({})) });
  assert.equal(rows.length, spec.limit, `bounded samples for ${service}`);
  assert.match(spec.path('a/b'), /a%2Fb/, `resource ID encoded for ${service}`);
}
const manager = readFileSync(new URL('../web/app/service-advanced-detail.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../web/app/service-operations-insights.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/app/service-operations-insights.css', import.meta.url), 'utf8');
for (const service of ['cron', 'mail', 'functions', 'monitor']) {
  assert.match(manager, new RegExp(`ServiceOperationsInsights[^>]*service="${service}"`));
}
assert.match(manager, /QrInsights/);
assert.match(manager, /RssSettingsExport/);
assert.match(panel, /readHistoryRows\(service, result\.payload\)/);
assert.match(panel, /sequence\.current === current/);
assert.match(panel, /aria-busy=\{busy\}/);
assert.match(panel, /all-time|全期間|全历史/);
assert.match(css, /@media\(max-width:580px\)/);
assert.doesNotMatch(panel, /(?:rawBase64|body_preview|headers_json|webhook_error|diff_text)/);
console.log('PicoSvc operational insights: four service summaries, bounded samples, classification, trends, safe rendering and manager routing OK.');
