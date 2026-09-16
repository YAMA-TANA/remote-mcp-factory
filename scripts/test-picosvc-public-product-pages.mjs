import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run AFTER `npm run build`; verify real prerendered HTML, not just JSX source.
const exportDirectory = fileURLToPath(new URL('../web/out/', import.meta.url));
const products = {
  mcp: 'Smithery', mock: 'Mockoon Cloud', hooks: 'Webhook.site', rss: 'PolitePol',
  mail: 'Resend Receiving', shot: 'Browserless', fetch: 'Firecrawl', qr: 'Bitly QR Codes',
  cron: 'Upstash QStash', functions: 'Cloudflare Workers', json: 'JSONBin.io',
  files: 'Cloudflare R2', license: 'Keygen', flags: 'LaunchDarkly',
  monitor: 'UptimeRobot', forms: 'Formspree',
};
const phrases = {
  en: ['Understand the product before signing in.', 'Example use cases', 'Compared with alternatives', 'Is production availability guaranteed?'],
  ja: ['登録前に確認。', 'こんな場面で使えます', '競合・代替サービスとの違い', '本番で必ず動くことは確認されていますか？'],
  'zh-cn': ['登录前先了解产品。', '典型使用场景', '与同类服务的差异', '是否保证生产环境可用？'],
};
for (const [locale, expected] of Object.entries(phrases)) {
  for (const [slug, competitor] of Object.entries(products)) {
    const file = join(exportDirectory, locale, slug, 'index.html');
    const html = readFileSync(file, 'utf8');
    const landing = html.indexOf('id="product-guide"');
    const workspace = html.indexOf('id="workspace"');
    assert.ok(landing >= 0 && workspace > landing, `${file}: the public landing must render BEFORE the login workspace`);
    for (const id of ['product-features','product-use-cases','product-comparison','product-faq','product-pricing-title']) {
      assert.ok(html.includes(`id="${id}"`), `${file}: missing publicly rendered ${id}`);
    }
    assert.ok(html.includes('productLandingCompare'), `${file}: side-by-side comparison missing`);
    assert.ok(html.includes(competitor), `${file}: linked alternative missing`);
    for (const phrase of expected) assert.ok(html.includes(phrase), `${file}: missing localized copy ${phrase}`);
    assert.ok(html.includes('noopener noreferrer'), `${file}: official source link protection missing`);
    assert.ok(html.includes(`/${locale}/pricing/`), `${file}: pricing CTA missing`);
    assert.ok(html.includes('href="#workspace"'), `${file}: workspace jump link missing`);
    assert.ok(html.includes('https://github.com/YAMA-TANA/remote-mcp-factory/blob/main/docs/PICOSVC_API_GUIDE.md'), `${file}: API guide link missing`);
    for (const plan of ['Free', 'Pico', 'PicoPlus']) assert.ok(html.includes(plan), `${file}: ${plan} quota missing`);
  }
}
assert.equal(Object.keys(products).length, 16);
console.log('PicoSvc public landing OK: 16 products × 3 locales = 48 prerendered guides, use cases, quotas, comparisons and FAQs before sign-in.');
