import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORY_DEFINITIONS, csvCell, historyToCsv, readHistoryRows } from '../web/app/service-history-csv.ts';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routing = source('web/app/service-advanced-detail.tsx');
const component = source('web/app/service-history-export.tsx');
const style = source('web/app/service-history-export.css');

for (const service of ['cron', 'mail', 'functions', 'monitor']) {
  assert.match(routing, new RegExp(`ServiceHistoryExport service="${service}"`), `${service} must expose exports in its own manager`);
  const definition = HISTORY_DEFINITIONS[service];
  assert.ok(definition.path('a/b').includes('a%2Fb'), 'Resource IDs must be path-encoded');
  assert.ok(definition.limit > 0 && definition.limit <= 200, 'Bound every history export');
  assert.deepEqual(readHistoryRows(service, { [definition.listKey]: Array.from({ length: 250 }, () => ({})) }).length, definition.limit);
  assert.throws(() => readHistoryRows(service, {}), /Missing/);
  assert.throws(() => readHistoryRows(service, { [definition.listKey]: [null] }), /Invalid history entry/);
}
assert.equal(csvCell('=1+1'), '"\'=1+1"');
assert.equal(csvCell('  +SUM(A1:A2)'), '"\'  +SUM(A1:A2)"');
assert.equal(csvCell('@cmd'), '"\'@cmd"');
assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
assert.equal(csvCell(null), '""');
const csv = historyToCsv('mail', [{ subject: '=HYPERLINK("http://evil")', from_address: 'sender@example.com',
  bodyBase64: 'NEVER_EXPORT_MIME', raw_mime: 'NEVER_EXPORT_RAW', headers: { Authorization: 'NEVER_EXPORT_TOKEN' },
  webhook_url: 'NEVER_EXPORT_WEBHOOK', secret: 'NEVER_EXPORT_SECRET' }]);
assert.ok(csv.startsWith('\uFEFF'), 'Use a UTF-8 BOM for spreadsheet compatibility');
assert.match(csv, /'=[A-Z]+/i, 'Escape formula-shaped subjects');
for (const secret of ['NEVER_EXPORT_MIME', 'NEVER_EXPORT_RAW', 'NEVER_EXPORT_TOKEN', 'NEVER_EXPORT_WEBHOOK', 'NEVER_EXPORT_SECRET']) {
  assert.ok(!csv.includes(secret), `Sensitive field leaked: ${secret}`);
}
assert.equal(historyToCsv('cron', [{ error: 'upstream failed' }]).includes('"true"'), true);
assert.match(component, /await api\(definition\.path\(id\)\)/, 'Use authenticated API, never a direct unauthenticated fetch');
assert.match(component, /URL\.revokeObjectURL/, 'Release temporary download URLs');
assert.match(component, /role="alert"/, 'Announce export errors');
assert.match(style, /@media/, 'Keep controls responsive');
console.log('PicoSvc history exports: four routes, bounded output, safe cells and field allowlists OK.');
