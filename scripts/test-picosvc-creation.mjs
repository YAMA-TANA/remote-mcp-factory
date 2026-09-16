import assert from 'node:assert/strict';
import { SERVICE_UI, initialServiceForm, serviceRequestBody } from '../web/app/service-ui-config.ts';

const slugs = Object.keys(SERVICE_UI);
assert.equal(slugs.length, 15, 'All generic product creation flows must be covered (Mock has its own workspace)');
for (const slug of slugs) {
  const values = initialServiceForm(slug);
  for (const field of SERVICE_UI[slug].fields) {
    if (field.kind === 'url' && field.required) values[field.key] = field.key === 'repoUrl' ? 'https://github.com/example/repository' : 'https://example.com/example';
    if (field.required && !values[field.key]) values[field.key] = 'example';
  }
  const body = serviceRequestBody(slug, values);
  assert.equal(typeof body, 'object', `${slug}: valid inputs must generate a request`);
  assert.equal(Object.keys(body).length, SERVICE_UI[slug].fields.length, `${slug}: all supported options must reach the API`);
}

const feed = initialServiceForm('rss');
feed.sourceUrl = 'https://example.com/news';
feed.itemSelector = 'article'; feed.titleSelector = 'h2'; feed.linkSelector = 'a[href]'; feed.contentSelector = '.summary'; feed.dateSelector = 'time';
const rssBody = serviceRequestBody('rss', feed);
assert.equal(rssBody.itemSelector, 'article');
assert.equal(rssBody.titleSelector, 'h2');
assert.equal(rssBody.linkSelector, 'a[href]');
assert.equal(rssBody.contentSelector, '.summary');
assert.equal(rssBody.dateSelector, 'time');
assert.throws(() => serviceRequestBody('rss', { ...feed, itemSelector: 'x'.repeat(301) }), /300 characters/);

const cron = { ...initialServiceForm('cron'), targetUrl: 'https://example.com/job', method: 'POST', cron: '*/15 0-23 * * 1,2,3', headers: '{"content-type":"application/json"}', body: '{"hello":true}' };
const cronBody = serviceRequestBody('cron', cron);
assert.equal(cronBody.method, 'POST');
assert.deepEqual(cronBody.headers, { 'content-type': 'application/json' });
assert.equal(cronBody.body, '{"hello":true}');
assert.throws(() => serviceRequestBody('cron', { ...cron, cron: '0 24 * * *' }), /five valid UTC fields/);
assert.throws(() => serviceRequestBody('cron', { ...cron, cron: '*/0 * * * *' }), /five valid UTC fields/);
assert.throws(() => serviceRequestBody('cron', { ...cron, headers: '{bad' }), /valid JSON/);
assert.throws(() => serviceRequestBody('cron', { ...cron, headers: '[]' }), /JSON object/);
assert.throws(() => serviceRequestBody('cron', { ...cron, method: 'GET' }), /GET jobs cannot send/);
assert.throws(() => serviceRequestBody('cron', { ...cron, method: 'TRACE', body: '' }), /invalid choice/);

const monitor = initialServiceForm('monitor');
assert.equal(monitor.intervalMinutes, '60', 'Free users should not start with an unavailable 15-minute interval');
monitor.targetUrl = 'https://example.com/'; monitor.webhookUrl = 'https://example.com/notify';
assert.equal(serviceRequestBody('monitor', monitor).webhookUrl, monitor.webhookUrl);
assert.throws(() => serviceRequestBody('monitor', { ...monitor, intervalMinutes: '5.5' }), /whole number/);
assert.throws(() => serviceRequestBody('monitor', { ...monitor, intervalMinutes: '10081' }), /between 5 and 10080/);
assert.throws(() => serviceRequestBody('monitor', { ...monitor, webhookUrl: 'https://user:secret@example.com/' }), /must not contain credentials/);

const mcp = { ...initialServiceForm('mcp'), repoUrl: 'https://github.com/example/repository' };
assert.equal(serviceRequestBody('mcp', mcp).repoUrl, mcp.repoUrl);
assert.throws(() => serviceRequestBody('mcp', { ...mcp, repoUrl: 'https://github.com/example/repository/tree/main' }), /repository URL/);
assert.throws(() => serviceRequestBody('mcp', { ...mcp, repoUrl: 'https://evil.example/example/repository' }), /repository URL/);
console.log(`PicoSvc creation checks OK: ${slugs.length} product flows; advanced RSS, Cron, Monitor options and invalid-input guards.`);
