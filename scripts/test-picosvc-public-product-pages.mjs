import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run AFTER next build: inspect emitted HTML, not only JSX and client bundles.
const root = fileURLToPath(new URL('../web/out/', import.meta.url));
const products = {
  mcp:'Smithery', mock:'Mockoon Cloud', hooks:'Webhook.site', rss:'PolitePol',
  mail:'Resend Receiving', shot:'Browserless', fetch:'Firecrawl', qr:'Bitly QR Codes',
  cron:'Upstash QStash', functions:'Vercel Functions', json:'JSONBin.io',
  files:'Supabase Storage', license:'Keygen', flags:'LaunchDarkly',
  monitor:'UptimeRobot', forms:'Formspree',
};
const localeText = {
  en:['What do I provide?', 'What do I get?', 'A concrete use case', 'Compare specific capabilities'],
  ja:['何を入力する？','何ができあがる？','実際の利用例','機能を具体的に比較'],
  'zh-cn':['需要提供什么？','会得到什么？','具体使用案例','具体功能比较'],
};
for (const [locale, expected] of Object.entries(localeText)) {
  const docsIndex=readFileSync(join(root,locale,'docs','index.html'),'utf8');
  const dashboard=readFileSync(join(root,locale,'dashboard','index.html'),'utf8');
  for (const service of Object.keys(products)) {
    assert.ok(docsIndex.includes(`/${locale}/docs/${service}/`),`${locale}: docs index missing ${service}`);
    assert.ok(dashboard.includes(`/${locale}/${service}/app`),`${locale}: dashboard missing ${service} app`);
  }
  for (const [slug, competitor] of Object.entries(products)) {
    const base=join(root,locale,slug);
    const publicHtml=readFileSync(join(base,'index.html'),'utf8');
    const appHtml=readFileSync(join(base,'app','index.html'),'utf8');
    const docsHtml=readFileSync(join(root,locale,'docs',slug,'index.html'),'utf8');
    assert.ok(!publicHtml.includes('id="workspace"'),`${locale}/${slug}: product overview must not embed workspace`);
    assert.ok(publicHtml.includes(`/${locale}/${slug}/app/`),`${locale}/${slug}: workspace URL missing`);
    assert.ok(publicHtml.includes(`/${locale}/docs/${slug}/`),`${locale}/${slug}: docs URL missing`);
    assert.ok(publicHtml.includes('customerUrlBox'),`${locale}/${slug}: explicit URL list missing`);
    assert.ok(publicHtml.includes(competitor),`${locale}/${slug}: comparison source missing`);
    assert.ok(publicHtml.includes('noopener noreferrer'),`${locale}/${slug}: external links need noreferrer`);
    for (const phrase of expected) assert.ok(publicHtml.includes(phrase),`${locale}/${slug}: missing ${phrase}`);
    assert.ok(appHtml.includes('customerWorkspaceShell'),`${locale}/${slug}: compact standalone workspace header missing`);
    assert.ok(!appHtml.includes('<header class="customerPage"'),`${locale}/${slug}: app inherited full-height marketing page shell`);
    assert.ok(appHtml.includes(`/${locale}/${slug}/`),`${locale}/${slug}: app should link back to explainer`);
    assert.ok(appHtml.includes(`/${locale}/dashboard/`),`${locale}/${slug}: app should link to dashboard`);
    assert.ok(!appHtml.includes('customerUrlBox'),`${locale}/${slug}: app embeds full landing`);
    assert.ok(docsHtml.includes(`/${locale}/${slug}/app/`),`${locale}/${slug}: docs link to app missing`);
    assert.ok(docsHtml.includes('/api/') || slug === 'mcp',`${locale}/${slug}: concrete API reference missing`);
    assert.ok(!/cloudflare/i.test(publicHtml),`${locale}/${slug}: infrastructure vendor in product page`);
    assert.ok(!/cloudflare/i.test(docsHtml),`${locale}/${slug}: infrastructure vendor in customer docs`);
    if (slug === 'forms') {
      assert.ok(docsHtml.includes('multipart'),`${locale}: forms file-upload limitation missing`);
      assert.ok(docsHtml.includes('&lt;form'),`${locale}: real HTML form example missing`);
      assert.ok(publicHtml.includes('Formspree'),`${locale}: forms comparison missing`);
    }
    if (slug === 'mail') {
      assert.ok(publicHtml.includes('PicoSvc Hooks'),`${locale}: webhook destination option missing`);
      assert.ok(!publicHtml.includes('対象ドメインのメールルーティング'),`${locale}: operator preparation in customer guide`);
    }
  }
}
assert.equal(Object.keys(products).length,16);
console.log('PicoSvc public/service docs OK: 48 independent explainers + 48 compact app pages + 48 how-tos, 3 doc indexes and 3 dashboards.');
