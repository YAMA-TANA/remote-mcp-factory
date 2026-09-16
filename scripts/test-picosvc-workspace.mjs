import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  workspaceApiError, workspaceIsActive, workspaceIsSecret, workspaceMatches,
} from '../web/app/workspace-helpers.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboard = read('web/app/service-dashboard.tsx');
const navigator = read('web/app/components/QuickNavigator.tsx');
const layout = read('web/app/[locale]/layout.tsx');
const css = read('web/app/workspace-v2.css');

assert.match(workspaceApiError({ error: { code: 'quota_reached', message: 'Quota reached' } }, 429, 'req-abc'), /Quota reached.*quota_reached.*HTTP 429.*req-abc/);
assert.match(workspaceApiError({ error: 'Invalid resource' }, 400), /Invalid resource.*HTTP 400/);
assert.match(workspaceApiError({ message: 'Service temporarily unavailable' }, 503), /Service temporarily unavailable.*HTTP 503/);
assert.match(workspaceApiError('Bad gateway', 502), /Bad gateway.*HTTP 502/);
assert.match(workspaceApiError(null, 500), /Request failed.*HTTP 500/);
assert.equal(workspaceIsSecret('bearerToken'), true);
assert.equal(workspaceIsSecret('apiKey'), true);
assert.equal(workspaceIsSecret('private_key'), true);
assert.equal(workspaceIsSecret('name'), false);
assert.equal(workspaceIsActive({ enabled: 0 }), false);
assert.equal(workspaceIsActive({ status: 'failed' }), false);
assert.equal(workspaceIsActive({ enabled: 1, status: 'ready' }), true);
assert.equal(workspaceMatches({ name: 'Demo API', id: 'abc', secret: 'must-not-index', headers: '{"Authorization":"Bearer abc"}' }, 'demo'), true);
assert.equal(workspaceMatches({ name: 'Demo API', secret: 'must-not-index' }, 'must-not-index'), false);
assert.match(dashboard, /workspaceApiError\(payload, response\.status, response\.headers\.get\('x-request-id'\)\)/);
assert.match(dashboard, /errorAction === 'create'\) void create\(\)/);
assert.match(dashboard, /secret && !revealed\[key\]/);
assert.match(dashboard, /role="group" aria-label=\{t\.resources\}/);
assert.match(dashboard, /min=\{field\.kind === 'number' && field\.key === 'intervalMinutes' \? 5/);
assert.match(css, /@media\(max-width:540px\)/);
const slugs = navigator.match(/const PRODUCT_SLUGS: NavSlug\[\] = \[([\s\S]*?)\];/)?.[1]?.match(/'([a-z]+)'/g) || [];
assert.equal(slugs.length, 16, 'Quick navigation must list all 16 products, including Mock and Hooks');
assert.equal(new Set(slugs).size, 16);
assert.ok(slugs.includes("'mock'"));
assert.ok(slugs.includes("'shot'"));
assert.match(navigator, /event\.metaKey \|\| event\.ctrlKey/);
assert.match(navigator, /aria-modal="true"/);
assert.match(layout, /<QuickNavigator \/>/);
console.log('PicoSvc workspace UX checks OK: structured errors, credential safety, filters and 16 service routes.');
