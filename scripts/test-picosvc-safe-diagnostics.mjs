import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mailSupportSnapshot, mcpSupportSnapshot, supportJson } from '../web/app/service-safe-diagnostics-data.ts';

const at = '2026-09-17T00:00:00.000Z';
const marker = 'SENSITIVE_SHOULD_NOT_EXPORT';
const mcp = mcpSupportSnapshot(
  { server: { id: marker, name: marker, status: 'ready', enabled: true, detectedRuntime: marker, error: marker, updatedAt: at, owner: marker, endpoint: marker, secret: marker }, edge: { status: 'ready', compiler_version: marker, tool_count: 5, size_bytes: 100, reason: marker } },
  { events: [{ kind: 'runtime', status: 'error', http_status: 502, duration_ms: 30, created_at: at, message: marker, id: marker, owner: marker, url: marker }] },
  { days: 30, summary: { requests: 10, errors: 1, averageDurationMs: 22, extra: marker }, daily: [{ url: marker }] }, at);
assert.equal(mcp.metrics.requests, 10);
assert.equal(mcp.events.length, 1);
assert.equal(mcp.events[0].httpStatus, 502);
assert.equal(mcp.deployment.runtime, 'other', 'Unapproved runtime labels must not leak into reports');
assert.ok(!supportJson(mcp).includes(marker), 'MCP snapshot must exclude unknown and sensitive fields');
assert.ok(!supportJson(mcp).includes('compiler_version'));
assert.throws(() => mcpSupportSnapshot({ server: {} }, { events: [] }, { days: 7, summary: {} }, at), /Invalid MCP/);
assert.throws(() => mcpSupportSnapshot({ server: {} }, { events: Array.from({ length: 51 }, () => ({})) }, { days: 30, summary: {} }, at), /Invalid MCP/);

const mail = mailSupportSnapshot({ events: [
  { delivery_status: 'failed', attempts: 2, received_at: at, id: marker, from: marker, to: marker, subject: marker, text_preview: marker, html_preview: marker, headers: { auth: marker }, webhook_url: marker, signingSecret: marker, error: marker },
  { delivery_status: 'delivered', attempts: 1, received_at: at },
  { delivery_status: marker, attempts: 8, received_at: 'invalid' },
] }, at);
assert.equal(mail.sampledEvents, 3);
assert.equal(mail.statuses.failed, 1);
assert.equal(mail.statuses.delivered, 1);
assert.equal(mail.statuses.other, 1);
assert.equal(mail.retryable, 1);
assert.equal(mail.maxAttempts, 2);
assert.equal(mail.latestAt, at);
assert.ok(!supportJson(mail).includes(marker), 'Mail support exports may only include aggregated delivery telemetry');
assert.throws(() => mailSupportSnapshot({ events: 'invalid' }, at), /Invalid mail/);
assert.throws(() => mailSupportSnapshot({ events: Array.from({ length: 101 }, () => ({})) }, at), /Invalid mail/);
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const component = source('web/app/service-safe-diagnostics.tsx');
const route = source('web/app/service-advanced-detail.tsx');
const css = source('web/app/service-safe-diagnostics.css');
assert.match(route, /<McpManagementDetail[\s\S]*?<ServiceSafeDiagnostics service="mcp"/, 'MCP management retains existing console and diagnostics');
assert.match(route, /<MailOperations[\s\S]*?<ServiceSafeDiagnostics service="mail"/, 'Mail operations and signing remain accessible');
for (const path of ['`${base}/logs?limit=50`', '`${base}/metrics?days=30`', '/api/picosvc/mail/routes/${encodeURIComponent(id)}/events']) assert.ok(component.includes(path), `Diagnostics must use the existing authenticated route ${path}`);
assert.match(component, /if \(sequence\.current === request\)/, 'Ignore superseded report requests');
assert.match(component, /setSnapshot\(null\)/, 'Clear old snapshots before refresh');
assert.match(component, /URL\.revokeObjectURL/, 'Revoke temporary download links');
assert.match(component, /role="alert"/, 'Report failures accessibly');
assert.match(component, /'zh-CN': \{ title:/, 'Provide Chinese locale');
assert.match(css, /@media\(max-width:600px\)/, 'Narrow screens use responsive controls');
console.log('PicoSvc MCP/Mail diagnostic report: limited owner-scoped samples, sensitive-field exclusion, lifecycle, localization and routes OK.');
