import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const management = readFileSync(new URL('../src/picosvc/management-mcp.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/picosvc-entry.ts', import.meta.url), 'utf8');
const utils = readFileSync(new URL('../src/picosvc/service-utils.ts', import.meta.url), 'utf8');

const services = [
  'mock', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron',
  'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
];

for (const service of services) {
  assert.match(management, new RegExp(`['"]${service}['"]`), `management MCP must include ${service}`);
}

assert.match(management, /services:manage/);
assert.match(management, /list_service_operations/);
assert.match(management, /picosvc_service_request/);
assert.match(management, /MAX_SERVICE_RESPONSE_BYTES/);
assert.match(management, /Path is outside the/);
assert.doesNotMatch(management.match(/const SERVICE_ENDPOINTS[\s\S]*?};/)?.[0] || '', /mcp\/keys/);

assert.match(entry, /withInternalIdentity/);
assert.match(entry, /picoSvcManagementMcpRoute\(request, env, ctx, async/);
assert.match(entry, /picoSvcRuntimeGuardrails\(internal, env\)/);
assert.match(utils, /WeakMap<Request, AuthIdentity>/);
assert.match(utils, /INTERNAL_IDENTITIES\.get\(request\)/);

console.log('PicoSvc management MCP all-service coverage checks passed.');
