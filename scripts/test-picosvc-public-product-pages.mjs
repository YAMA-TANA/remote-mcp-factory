import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Run AFTER `npm run build` from the repository root; check rendered HTML, not only JSX source.
const products = {
  mcp: 'Smithery', mock: 'Mockoon Cloud', hooks: 'Webhook.site', rss: 'PolitePol',
  mail: 'Resend Receiving', shot: 'Browserless', fetch: 'Firecrawl', qr: 'Bitly QR Codes',
  cron: 'Upstash QStash', functions: 'Cloudflare Workers', json: 'JSONBin.io',
  files: 'Cloudflare R2', license: 'Keygen', flags: 'LaunchDarkly',
  monitor: 'UptimeRobot', forms: 'Formspree',
};
const phrases = {
  en: ['What can you do?', 'Compared with alternatives', 'Check before choosing'],
  ja: ['このサービスでできること', '競合・代替サービスとの違い', '導入前に確認したいこと'],
  'zh-cn': ['这个服务能做什么？', '与同类服务的差异', '使用前须知'],
};
for (const [locale, expected] of Object.entries(phrases)) {
  for (const [slug, competitor] of Object.entries(products)) {
    const file = join('web', 'out', locale, slug, 'index.html');
    const html = readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`id="${slug}-overview-title"`), `${file}: public overview is missing`);
    assert.ok(html.includes('productOverviewCompare'), `${file}: comparison section is missing`);
    assert.ok(html.includes(competitor), `${file}: official alternative missing`);
    for (const phrase of expected) assert.ok(html.includes(phrase), `${file}: missing localized copy ${phrase}`);
    assert.ok(html.includes('noopener noreferrer'), `${file}: official source link protection missing`);
    assert.ok(html.includes(`/${locale}/pricing/`), `${file}: pricing CTA missing`);
  }
}
assert.equal(Object.keys(products).length, 16);
console.log('PicoSvc public product pages OK: 16 products × 3 locales = 48 static pages with comparisons, source links and plan CTAs.');
