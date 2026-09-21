import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterDeskResources, parseDeskResources, parseFeedPreview, parseFeedRefresh,
  patchDeskResource, resourcePaths, resourcePublicUrl,
} from '../web/app/service-resource-desk-model.ts';

const uuid = '11111111-2222-4333-8444-555555555555';
const publicId = 'a'.repeat(32);
const secrets = {
  authorization: 'Bearer SUPER_SECRET', headers_json: '{"x-token":"SUPER_SECRET"}',
  webhook_url: 'https://secret.example/private', body: 'PRIVATE_BODY', owner: 'other-user',
};
const qr = parseDeskResources({ links: [{ id: uuid, name: 'Campaign QR', public_id: publicId, target_url: 'https://shop.example/path?token=PRIVATE', enabled: 1, scans: 42, updated_at: '2026-09-21T00:00:00Z', ...secrets }] }, 'qr');
assert.equal(qr[0].scans, 42);
assert.equal(qr[0].enabled, true);
assert.equal(qr[0].targetUrl, 'https://shop.example/path?token=PRIVATE'); // Full target is needed only inside the authenticated editor.
assert.ok(!JSON.stringify(qr).includes('SUPER_SECRET'));
assert.ok(!JSON.stringify(qr).includes('PRIVATE_BODY'));
assert.ok(!JSON.stringify(qr).includes('other-user'));
const rss = parseDeskResources({ feeds: [{ id: uuid, name: 'Release notes', public_id: publicId, source_url: 'https://docs.example/notes', enabled: 0, last_checked_at: null, updated_at: '2026-09-21T00:00:00Z', item_selector: 'article', titleSelector: 'h2', ...secrets }] }, 'rss');
assert.equal(rss[0].enabled, false);
assert.equal(rss[0].selectors.itemSelector, 'article');
assert.equal(rss[0].selectors.titleSelector, 'h2');
assert.equal(rss[0].selectors.linkSelector, '');
assert.equal(filterDeskResources(qr, 'shop.example', 'enabled').length, 1);
assert.equal(filterDeskResources(qr, 'shop.example', 'paused').length, 0);
assert.equal(filterDeskResources(rss, 'docs.example', 'paused').length, 1);
assert.equal(resourcePaths('qr').list, '/api/picosvc/qr/links');
assert.equal(resourcePaths('rss', uuid).preview, `/api/picosvc/rss/feeds/${uuid}/preview`);
assert.equal(resourcePaths('rss', uuid).refresh, `/api/picosvc/rss/feeds/${uuid}/refresh`);
assert.equal(resourcePaths('qr', uuid).item, `/api/picosvc/qr/links/${uuid}`);
assert.throws(() => resourcePaths('qr', '../../etc/passwd'));
assert.equal(resourcePublicUrl('qr', 'https://api.example/service', publicId), `https://api.example/q/${publicId}`);
assert.equal(resourcePublicUrl('qr', 'https://api.example/service', publicId, true), `https://api.example/q/${publicId}.svg`);
assert.equal(resourcePublicUrl('rss', 'https://api.example', publicId), `https://api.example/rss/${publicId}.xml`);
assert.throws(() => resourcePublicUrl('rss', 'javascript:alert(1)', publicId));
assert.throws(() => resourcePublicUrl('qr', 'https://user:pass@api.example', publicId));
assert.throws(() => parseDeskResources({ links: [{ id: uuid, name: 'Bad', public_id: publicId, target_url: 'file:///etc/passwd', enabled: true, scans: 0 }] }, 'qr'));
assert.throws(() => parseDeskResources({ links: [{ id: uuid, name: 'Bad', public_id: publicId, target_url: 'https://example.org', enabled: true, scans: -1 }] }, 'qr'));
assert.throws(() => parseDeskResources({ links: [qr[0], qr[0]] }, 'qr'));
assert.throws(() => parseDeskResources({ feeds: [{ id: uuid, name: 'Bad', public_id: publicId, source_url: 'https://example.org', enabled: true, item_selector: 'x'.repeat(301) }] }, 'rss'));
const settings = { itemSelector: 'article', titleSelector: 'h2', linkSelector: '', contentSelector: '', dateSelector: '' };
assert.deepEqual(patchDeskResource('qr', ' Updated ', 'https://new.example/', settings), { name: 'Updated', targetUrl: 'https://new.example/' });
assert.deepEqual(patchDeskResource('rss', 'New', 'https://new.example/', settings), { name: 'New', sourceUrl: 'https://new.example/', ...settings, linkSelector: null, contentSelector: null, dateSelector: null });
assert.throws(() => patchDeskResource('qr', ' ', 'https://new.example/', settings));
assert.throws(() => patchDeskResource('rss', 'Okay', 'javascript:alert(1)', settings));
const preview = parseFeedPreview({ mode: 'css', monthlyChecksUsed: 8, items: [{ title: 'Update', link: 'https://news.example/article?private=SECRET', description: 'SECRET ARTICLE BODY', html: '<script>SECRET</script>' }] });
assert.deepEqual(preview, { mode: 'css', used: 8, items: [{ title: 'Update', hostname: 'news.example' }] });
assert.ok(!JSON.stringify(preview).includes('SECRET'));
assert.deepEqual(parseFeedRefresh({ changed: true, extracted: 5, inserted: 2, monthlyChecksUsed: 10 }), { changed: true, extracted: 5, inserted: 2, used: 10 });
assert.throws(() => parseFeedRefresh({ changed: true, extracted: -1, inserted: 0 }));
const page = readFileSync(new URL('../web/app/[locale]/[service]/manage/page.tsx', import.meta.url), 'utf8');
const header = readFileSync(new URL('../web/app/customer-workspace-header.tsx', import.meta.url), 'utf8');
const component = readFileSync(new URL('../web/app/service-resource-desk.tsx', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
for (const service of ['qr', 'rss']) {
  assert.ok(page.includes(`'${service}'`) && header.includes(`service === '${service}'`), `${service} must be reachable`);
}
assert.ok(page.includes('generateStaticParams') && page.includes('ServiceResourceDesk'));
assert.ok(component.includes('instance.addListener') && component.includes('<Editor key={revision}'), 'Organization switch must discard previous editor state');
assert.ok(component.includes('disabled={busy || dirty}') && component.includes('window.confirm'), 'Quota/downtime actions must require explicit confirmation');
assert.ok(component.includes('navigator.clipboard.writeText(publicUrl)'), 'Public URL must use validated URL builder');
assert.ok(workflow.includes('scripts/test-picosvc-resource-desks.mjs'), 'Regression tests must run in CI');
console.log('QR/RSS resource desk projections, quotas, routes and wiring: passed');
