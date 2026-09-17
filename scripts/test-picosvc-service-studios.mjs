import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('web/app/[locale]/[service]/app/page.tsx');
const studio = read('web/app/service-studio.tsx');
const style = read('web/app/service-studio.css');
const routes = ['mcp', 'rss', 'mail', 'qr', 'cron', 'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms'];
for (const slug of routes) {
  assert.match(studio, new RegExp(`\\b${slug}: \\{`), `Missing ${slug} service description`);
  assert.match(studio, new RegExp(`case '${slug}':`), `Missing ${slug} service composer`);
}
assert.match(page, /<ServiceStudio service=\{service\}/, 'Service pages must use purpose-built studios');
assert.match(page, /service === 'fetch' \? <FetchWorkspace/, 'Keep dedicated Fetch UI');
assert.match(page, /service === 'shot' \? <ShotWorkspace/, 'Keep dedicated Shot UI');
assert.match(studio, /workspaceIsSecret\(key\)/, 'Protect one-time credentials');
assert.match(studio, /const body = serviceRequestBody\(service, form\)/, 'Preserve validated API requests');
assert.match(studio, /<ServiceResourceDetail/, 'Preserve resource-specific operations');
assert.match(studio, /<ServiceAdvancedDetail/, 'Preserve advanced resource operations');
assert.match(studio, /role="alert"/, 'Expose API errors to assistive technology');
assert.match(studio, /aria-pressed=\{filter === key\}/, 'Expose filter selection');
assert.match(style, /@media/, 'Provide responsive layout');
console.log('PicoSvc 12 service studios: routing, distinct composers, security and responsive UI OK.');
