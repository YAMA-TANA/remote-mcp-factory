import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formConfigurationSnapshot, mcpEventCsv } from '../web/app/service-management-portability-data.ts';

const now = new Date('2026-09-17T12:00:00.000Z');
const config = {
  formId: 'PRIVATE_FORM_ID', owner: 'PRIVATE_OWNER', signingSecret: 'PRIVATE_SECRET',
  allowedOrigins: ['https://example.com'], requiredFields: ['email', 'message'],
  honeypotField: '_website', requireTurnstile: true,
  webhookUrl: 'https://example.com/hook?token=PRIVATE_TOKEN',
  successRedirect: 'https://example.com/done?token=PRIVATE_REDIRECT',
};
const safe = formConfigurationSnapshot(config, false, now);
assert.equal(safe.format, 'picosvc.forms.config.v1');
assert.equal(safe.exportedAt, '2026-09-17T12:00:00.000Z');
assert.deepEqual(safe.settings.allowedOrigins, ['https://example.com']);
assert.deepEqual(safe.settings.requiredFields, ['email', 'message']);
assert.equal(safe.settings.requireTurnstile, true);
for (const secret of ['PRIVATE_FORM_ID', 'PRIVATE_OWNER', 'PRIVATE_SECRET', 'PRIVATE_TOKEN', 'PRIVATE_REDIRECT']) {
  assert.equal(JSON.stringify(safe).includes(secret), false, `Default snapshot must exclude ${secret}`);
}
const optedIn = formConfigurationSnapshot(config, true, now);
assert.equal(optedIn.settings.webhookUrl, config.webhookUrl);
assert.equal(optedIn.settings.successRedirect, config.successRedirect);
assert.equal(JSON.stringify(optedIn).includes('PRIVATE_SECRET'), false);
assert.deepEqual(formConfigurationSnapshot({ allowedOrigins: [], requiredFields: [], honeypotField: '_website', requireTurnstile: false }).settings.allowedOrigins, []);
for (const invalid of [null, {}, { ...config, allowedOrigins: Array(21).fill('https://example.com') }, { ...config, requiredFields: ['no spaces'] }, { ...config, honeypotField: 'bad field' }, { ...config, requireTurnstile: 'false' }]) {
  assert.throws(() => formConfigurationSnapshot(invalid), /Invalid Forms configuration/);
}
assert.throws(() => formConfigurationSnapshot({ ...config, webhookUrl: 42 }, true), /Invalid Forms destination/);

const rows = [
  { kind: '=HYPERLINK("https://bad")', status: '-cmd', http_status: 500, duration_ms: 12, created_at: '2026-09-17', message: 'PRIVATE_LOG_BODY', signingSecret: 'PRIVATE_SECRET' },
  { kind: 'runtime', status: 'ok', http_status: 204, duration_ms: 0, created_at: '2026-09-16' },
];
const output = mcpEventCsv({ serverId: 'PRIVATE_SERVER', events: rows, token: 'PRIVATE_TOKEN' });
assert.equal(output.count, 2);
assert.ok(output.csv.startsWith('\uFEFFkind,status,http_status,duration_ms,created_at\r\n'));
assert.ok(output.csv.includes("\"'=HYPERLINK"));
assert.ok(output.csv.includes("\"'-cmd\""));
for (const secret of ['PRIVATE_LOG_BODY', 'PRIVATE_SECRET', 'PRIVATE_TOKEN', 'PRIVATE_SERVER']) assert.ok(!output.csv.includes(secret));
assert.deepEqual(mcpEventCsv({ events: [] }), { csv: '\uFEFFkind,status,http_status,duration_ms,created_at\r\n', count: 0 });
assert.throws(() => mcpEventCsv({ events: Array(51).fill({}) }), /Invalid MCP events/);
assert.throws(() => mcpEventCsv({ events: [null] }), /Invalid MCP events/);

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const formsManager = read('web/app/service-resource-detail.tsx');
const mcpManager = read('web/app/service-advanced-detail.tsx');
const panel = read('web/app/service-management-portability.tsx');
const css = read('web/app/service-management-portability.css');
assert.match(formsManager, /<FormsManagementDetail/);
assert.match(formsManager, /<FormsConfigurationDownload/);
assert.match(mcpManager, /<McpManagementDetail/);
assert.match(mcpManager, /<McpEventsDownload/);
assert.match(panel, /\/config`\)/);
assert.match(panel, /\/logs\?limit=50`\)/);
assert.match(panel, /formConfigurationSnapshot\(response\.payload, includeDestinations\)/);
assert.match(panel, /mcpEventCsv\(response\.payload\)/);
assert.match(panel, /includeDestinations, setIncludeDestinations/);
assert.match(panel, /role="alert"/);
assert.match(panel, /aria-busy=\{busy\}/);
assert.match(panel, /URL\.revokeObjectURL/);
assert.match(css, /@media\(max-width:560px\)/);
console.log('PicoSvc Forms/MCP portability: bounded exports, redacted settings/events, CSV injection safety and manager wiring OK.');
