'use client';

import { LanguageSwitcher, useI18n } from './i18n';

const PRODUCTS = [
  ['mcp', 'MCP', 'MCP hosting / Remote conversion'],
  ['mock', 'Mock', 'Mock API'],
  ['hooks', 'Hooks', 'Webhook inbox / replay'],
  ['rss', 'RSS', 'Web → RSS'],
  ['mail', 'Mail', 'Email → Webhook'],
  ['shot', 'Shot', 'Screenshot / PDF'],
  ['fetch', 'Fetch', 'URL → Markdown / metadata'],
  ['qr', 'QR', 'Dynamic QR / redirect'],
  ['cron', 'Cron', 'Scheduled HTTP jobs'],
  ['functions', 'Functions', 'Tiny serverless functions'],
  ['json', 'JSON', 'JSON API / tiny database'],
  ['files', 'Files', 'R2-backed file delivery'],
  ['license', 'License', 'License key validation'],
  ['flags', 'Flags', 'Feature flags / remote config'],
  ['monitor', 'Monitor', 'Web page change monitoring'],
  ['forms', 'Forms', 'Form backend'],
] as const;

const COPY = {
  en: {
    eyebrow: 'Small developer infrastructure',
    title1: 'Sixteen tiny services.', title2: 'One account.',
    lede: 'MCP hosting, mock APIs, webhooks, RSS, email routing, screenshots, URL extraction, dynamic QR, cron, serverless functions, JSON, files, license validation, feature flags, monitoring and forms — all under one PicoSvc account.',
    allActive: 'ALL SERVICES ACTIVE', choose: 'Choose what you need.', open: 'Open dashboard →',
    priceLine: 'Pico $1/mo · PicoPlus $5/mo',
    pricing: 'Simple pricing', pricingBody: 'Every individual service uses the same paid pricing. Bundle the suite when you use several.',
    pico: 'Pico', picoBody: '$1 / service / month', plus: 'PicoPlus', plusBody: '$5 / service / month', bundlePico: 'Bundle Pico', bundlePicoBody: '$5 / month', bundlePro: 'Bundle Pro', bundleProBody: '$22 / month', custom: 'More usage?', customBody: 'Contact us for custom limits.',
    pricingLink: 'See full pricing →', contact: 'Contact →',
    shared: 'One login', independent: 'Independent product quotas', edge: 'Cloudflare edge', bundle: 'Bundle supported',
  },
  ja: {
    eyebrow: '小さく使える開発者インフラ',
    title1: '16個の小さなサービス。', title2: 'アカウントはひとつ。',
    lede: 'MCPホスティング、Mock API、Webhook、RSS、メール転送、スクリーンショット、URL抽出、Dynamic QR、Cron、Functions、JSON、Files、License、Flags、Monitor、FormsをひとつのPicoSvcアカウントで使えます。',
    allActive: '全サービス利用可能', choose: '必要なものだけ選べます。', open: 'ダッシュボードを開く →',
    priceLine: 'Pico 月$1 · PicoPlus 月$5',
    pricing: 'シンプルな料金', pricingBody: '単品サービスはすべて同じ有料料金。複数使うならBundleでまとめられます。',
    pico: 'Pico', picoBody: '1サービス 月$1', plus: 'PicoPlus', plusBody: '1サービス 月$5', bundlePico: 'Bundle Pico', bundlePicoBody: '月$5', bundlePro: 'Bundle Pro', bundleProBody: '月$22', custom: 'さらに必要？', customBody: '上位利用はお問い合わせください。',
    pricingLink: '料金を詳しく見る →', contact: '相談する →',
    shared: 'ログイン共通', independent: '製品ごとの利用上限', edge: 'Cloudflare Edge', bundle: 'Bundle対応',
  },
  'zh-CN': {
    eyebrow: '轻量开发者基础设施',
    title1: '16 个小型服务。', title2: '一个账号。',
    lede: 'MCP 托管、Mock API、Webhook、RSS、邮件转发、截图、URL 提取、动态 QR、Cron、Functions、JSON、Files、License、Flags、Monitor 和 Forms，全部使用同一个 PicoSvc 账号。',
    allActive: '所有服务现已可用', choose: '只选择你需要的。', open: '打开控制台 →',
    priceLine: 'Pico $1/月 · PicoPlus $5/月',
    pricing: '简单价格', pricingBody: '所有单项服务采用相同付费价格。使用多个服务时可选择 Bundle。',
    pico: 'Pico', picoBody: '每项服务 $1/月', plus: 'PicoPlus', plusBody: '每项服务 $5/月', bundlePico: 'Bundle Pico', bundlePicoBody: '$5/月', bundlePro: 'Bundle Pro', bundleProBody: '$22/月', custom: '需要更多？', customBody: '自定义额度请联系我们。',
    pricingLink: '查看完整价格 →', contact: '联系我们 →',
    shared: '一个登录', independent: '产品独立配额', edge: 'Cloudflare Edge', bundle: '支持 Bundle',
  },
} as const;

export default function HomeV2() {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale];
  const c = messages.common;

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href="#products">{c.products}</a><a href={localizedHref('/pricing')}>Pricing</a><a href={localizedHref('/contact')}>{c.contact}</a><LanguageSwitcher /></div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> {t.eyebrow}</div>
        <h1>{t.title1}<br />{t.title2}</h1>
        <p className="lede">{t.lede}</p>
        <div className="flow"><span>{t.shared}</span><i>→</i><span>{t.independent}</span><i>→</i><span>{t.edge}</span><i>→</i><span>{t.bundle}</span></div>
      </section>

      <section className="shell deploymentsSection" id="products">
        <div className="sectionHead"><div><span className="kicker">{t.allActive}</span><h2>{t.choose}</h2></div></div>
        <div className="deploymentGrid">
          {PRODUCTS.map(([slug, name, role]) => (
            <article className="deployment" key={slug}>
              <div className="deploymentTop"><div><strong>PicoSvc {name}</strong><p>{role}</p></div><span className="status ready">active</span></div>
              <div className="runtime"><span className="edgePill">{t.priceLine}</span><span>Free</span><span>Bundle</span></div>
              <div className="deploymentBottom"><code>{slug}</code><a href={localizedHref(`/${slug}`)}>{t.open}</a></div>
            </article>
          ))}
        </div>
      </section>

      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">PICOSVC PRICING</span><h2>{t.pricing}</h2></div></div>
        <p className="lede">{t.pricingBody}</p>
        <div className="deploymentGrid">
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.pico}</strong><p>{t.picoBody}</p></div><span className="status ready">$1</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.plus}</strong><p>{t.plusBody}</p></div><span className="status ready">$5</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.bundlePico}</strong><p>{t.bundlePicoBody}</p></div><span className="status ready">$5</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.bundlePro}</strong><p>{t.bundleProBody}</p></div><span className="status ready">$22</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.custom}</strong><p>{t.customBody}</p></div><span className="status">Custom</span></div></article>
        </div>
        <div className="deploymentBottom" style={{ marginTop: 18 }}><a href={localizedHref('/pricing')}>{t.pricingLink}</a><a href={localizedHref('/contact')}>{t.contact}</a></div>
      </section>
    </main>
  );
}
