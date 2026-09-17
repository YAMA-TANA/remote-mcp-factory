import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dispatcher = source('web/app/service-advanced-detail.tsx');
const consoleSource = source('web/app/service-mcp-management.tsx');
const styles = source('web/app/service-mcp-management.css');
const backend = source('src/picosvc/mcp-observability.ts');

assert.match(dispatcher, /import McpManagementDetail from '\.\/service-mcp-management'/, 'MCP has a dedicated management component');
assert.match(dispatcher, /props\.service === 'mcp'\) return <McpManagementDetail/, 'MCP resources use the dedicated console');
for (const action of ["api(base)", "api(`${base}/logs?limit=50`)", "api(`${base}/metrics?days=30`)", "api(`${base}/redeploy`, { method: 'POST' })"]) {
  assert.ok(consoleSource.includes(action), `MCP console uses the existing API: ${action}`);
}
assert.match(consoleSource, /window\.confirm\(t\.confirm\)/, 'Redeploy warns about its cost and interruption');
assert.match(consoleSource, /redeployed !== true/, 'Redeploy success is based on the actual backend result');
assert.match(consoleSource, /LegacyServiceAdvancedDetail/, 'Existing access and secrets controls remain reachable');
assert.match(consoleSource, /sequence\.current !== current/, 'Older refreshes cannot overwrite newer server data');
assert.match(consoleSource, /role="alert"/, 'Errors are announced accessibly');
assert.match(consoleSource, /ja: \{ title:/);
assert.match(consoleSource, /'zh-CN': \{ title:/);
assert.match(styles, /@media\(max-width:560px\)/, 'The console supports narrow screens');
assert.match(backend, /mcpObservabilityManagementRoutes/);
assert.match(backend, /WHERE id=\? AND owner=\?/, 'Management reads are scoped to the signed-in owner');
assert.match(backend, /consumeUsage\(env, row\.owner, 'mcp', 'builds'\)/, 'Redeployment consumes the backend build quota');
console.log('PicoSvc MCP management UI routing, observability endpoints and safety contracts OK.');
