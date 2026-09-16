import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run AFTER `npm run build`; validate the prerendered output, not just source strings.
const exportDirectory = fileURLToPath(new URL('../web/out/', import.meta.url));
const products = {
  mcp: 'Smithery', mock: 'Mockoon Cloud', hooks: 'Webhook.site', rss: 'PolitePol',
  mail: 'Resend Receiving', shot: 'Browserless', fetch: 'Firecrawl', qr: 'Bitly QR Codes',
  cron: 'Upstash QStash', functions: 'Vercel Functions', json: 'JSONBin.io',
  files: 'Supabase Storage', license: 'Keygen', flags: 'LaunchDarkly',
  monitor: 'UptimeRobot', forms: 'Formspree',
};
const phrases = {
  en: ['Example use cases', 'Compared with alternatives', 'Frequently asked questions'],
  ja: ['こんな場面で使えます', '競合・代替サービスとの違い', 'よくある質問'],
  'zh-cn': ['典型使用场景', '与同类服务的差异', '常见问题'],
};
for (const [locale, expected] of Object.entries(phrases)) {
  for (const [slug, competitor] of Object.entries(products)) {
    const file = join(exportDirectory, locale, slug, 'index.html');
    const html = readFileSync(file, 'utf8');
    const intro = html.indexOf('id="product-guide"');
    const workspace = html.indexOf('id="workspace"');
    const details = html.indexOf('id="product-features"');
    assert.ok(intro >= 0 && workspace > intro && details > workspace,
      `${file}: compact intro must be followed by workspace, then long-form guide`);
    for (const id of ['product-features','product-use-cases','product-comparison','product-faq','product-pricing-title']) {
      assert.ok(html.includes(`id="${id}"`), `${file}: missing public section ${id}`);
    }
    assert.ok(html.includes('productLandingCompare'), `${file}: comparison missing`);
    assert.ok(html.includes(competitor), `${file}: official alternative missing`);
    for (const phrase of expected) assert.ok(html.includes(phrase), `${file}: missing localized copy ${phrase}`);
    assert.ok(html.includes('noopener noreferrer'), `${file}: official source link protection missing`);
    assert.ok(html.includes(`/${locale}/pricing/`), `${file}: pricing link missing`);
    assert.ok(html.includes('href="#workspace"'), `${file}: workspace shortcut missing`);
    assert.ok(html.includes('https://github.com/YAMA-TANA/remote-mcp-factory/blob/main/docs/PICOSVC_API_GUIDE.md'), `${file}: API guide link missing`);
    for (const plan of ['Free', 'Pico', 'PicoPlus']) assert.ok(html.includes(plan), `${file}: missing ${plan} quota`);
    assert.ok(!/cloudflare/i.test(html), `${file}: implementation vendor must not appear in customer-facing page`);
    if (slug === 'mail') {
      assert.ok(html.includes('PicoSvc Hooks'), `${file}: serverless webhook destination option missing`);
      assert.ok(!html.includes('対象ドメインのメールルーティング'), `${file}: operator mail configuration shown as customer setup`);
    }
  }
}
assert.equal(Object.keys(products).length, 16);
console.log('PicoSvc product pages OK: 48 localized intros → workspaces → guides, provider-neutral copy, email onboarding, plan and comparison links.');
