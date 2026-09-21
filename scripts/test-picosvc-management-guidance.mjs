import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CUSTOMER_GUIDES } from '../web/app/customer-content.ts';
import { GENERIC_SERVICE_SLUGS } from '../web/app/service-data.ts';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const component = source('web/app/service-management-guide.tsx');
const resource = source('web/app/service-resource-detail.tsx');
const advanced = source('web/app/service-advanced-detail.tsx');
const css = source('web/app/service-management-guide.css');
const locales = ['ja', 'en', 'zh-CN'];
const services = [...GENERIC_SERVICE_SLUGS, 'hooks', 'mock'];
for (const slug of services) {
  const guide = CUSTOMER_GUIDES[slug];
  assert.ok(guide, `Missing ${slug} guide`);
  assert.equal(guide.steps.length, 3, `${slug} must have three actionable steps`);
  for (const locale of locales) {
    for (const field of ['summary', 'prerequisite', 'limitation', 'example', 'input', 'output']) assert.ok(guide[field][locale]?.trim(), `${slug} ${locale} ${field}`);
    assert.ok(guide.steps.every(step => step[locale]?.trim()), `${slug} ${locale} steps`);
    for (const field of ['axis', 'pico', 'other']) assert.ok(guide.competitor[field][locale]?.trim(), `${slug} ${locale} comparison ${field}`);
  }
  assert.ok(guide.competitor.name.trim(), `${slug} must name the competitor`);
  assert.ok(guide.competitor.url.startsWith('https://'), `${slug} comparison must link to HTTPS vendor docs`);
}
// Each URL was checked against the vendor's own public documentation. Never promote an
// unreviewed comparison to the signed-in UI by merely adding it to CUSTOMER_GUIDES.
const verified = {
  mcp: 'https://smithery.ai/docs/build',
  mock: 'https://mockoon.com/docs/latest/api-endpoints/http-routes/',
  hooks: 'https://docs.webhook.site/api/requests.html',
  rss: 'https://politepol.com/about',
  mail: 'https://resend.com/docs/dashboard/receiving/introduction',
  shot: 'https://docs.browserless.io/rest-apis/screenshot-api',
  fetch: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape',
  qr: 'https://bitly.com/pages/products/qr-codes',
  cron: 'https://upstash.com/docs/qstash/features/schedules',
  functions: 'https://vercel.com/docs/functions',
  json: 'https://jsonbin.io/api-reference',
  files: 'https://supabase.com/docs/guides/storage',
  license: 'https://keygen.sh/docs/validating-licenses/',
  flags: 'https://launchdarkly.com/docs/api/feature-flags',
  monitor: 'https://uptimerobot.com/website-monitoring/',
  forms: 'https://help.formspree.io/articles/the-forms-api/form-submissions-api',
};
assert.equal(services.length, 16, 'Keep the full 16-product catalog under test');
assert.deepEqual(Object.keys(verified).sort(), [...services].sort(), 'Every service needs an official-source comparison');
for (const [slug, official] of Object.entries(verified)) {
  assert.equal(CUSTOMER_GUIDES[slug].competitor.url, official, `${slug} in-panel claim must match product-page source`);
  assert.ok(component.includes(`${slug}: '${official}'`), `${slug} must use reviewed vendor source`);
}
assert.equal((component.match(/https:\/\//g) || []).length, Object.keys(verified).length, 'Only checked competitor pages may be inlined');
assert.match(component, /<details className="serviceManagementGuide"/, 'Guidance must be opt-in and keyboard-accessible');
for (const field of ['summary', 'prerequisite', 'limitation', 'steps', 'example', 'input', 'output']) assert.ok(component.includes(`guide.${field}`), `Show ${field} in manager`);
for (const locale of locales) assert.ok(component.includes(locale === 'zh-CN' ? "'zh-CN': { title:" : `${locale}: { title:`), `${locale} localized panel`);
assert.match(component, /import type \{ ProductSlug \}/, 'Support the standalone Mock service type');
assert.match(component, /target="_blank" rel="noopener noreferrer"/, 'Vendor links must use safe rel attributes');
assert.match(component, /const overview = `\/\$\{lang\}\/\$\{service\}\//, 'Link to localized full comparison');
assert.match(component, /const docs = `\/\$\{lang\}\/docs\/\$\{service\}\//, 'Link to localized API help');
assert.doesNotMatch(component, /\bapi\s*\(|fetch\s*\(/, 'Help must never request private data or spend API quotas');
assert.match(resource, /<ServiceManagementGuide service=\{props\.service\}/, 'Include guides in resource managers');
assert.match(advanced, /<ServiceManagementGuide service=\{props\.service\}/, 'Include guides in advanced managers');
for (const slug of ['files', 'json', 'forms', 'license', 'flags']) assert.match(resource, new RegExp(`props\\.service === '${slug}'`), `Retain ${slug} resource manager`);
for (const slug of ['mcp', 'rss', 'cron', 'qr', 'mail', 'functions', 'monitor']) assert.match(advanced, new RegExp(`props\\.service === '${slug}'`), `Retain ${slug} advanced manager`);
assert.match(advanced, /<ServiceSafeDiagnostics service="mcp"/, 'Keep MCP diagnostic exports');
assert.match(advanced, /<ServiceSafeDiagnostics service="mail"/, 'Keep Mail diagnostic exports');
for (const slug of ['mock', 'hooks']) {
  const route = source(`web/app/[locale]/${slug}/app/page.tsx`);
  assert.ok(route.includes(`<ServiceManagementGuide service="${slug}" />`), `${slug} workspace must expose guidance`);
  assert.ok(route.includes(slug === 'mock' ? '<MockPage/>' : '<HooksPage/>'), `${slug} existing management operations must remain`);
  assert.match(route, /CustomerWorkspaceHeader service=/, `${slug} preserves localized workspace navigation`);
}
const genericRoute = source('web/app/[locale]/[service]/app/page.tsx');
assert.match(genericRoute, /service === 'shot' \|\| service === 'fetch'/, 'Limit standalone guide to the two remaining generic workspaces');
assert.match(genericRoute, /<ServiceManagementGuide service=\{service\}/, 'Fetch/Shot display contextual help');
assert.match(genericRoute, /<ShotWorkspace \/>/, 'Shot capture and API-key operations remain');
assert.match(genericRoute, /<FetchWorkspace \/>/, 'Fetch extraction remains');
assert.match(css, /@media\(max-width:650px\)/, 'Guide must fit narrow screens');
assert.match(css, /serviceManagementGuideStandalone/, 'Standalone guides use responsive layout');
console.log('PicoSvc management guidance: 16 localized guides, 16 sourced comparisons, all workspaces, original operations and mobile styling OK.');
