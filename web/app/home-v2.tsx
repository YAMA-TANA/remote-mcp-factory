'use client';

import { useState } from 'react';
import { LanguageSwitcher, useI18n } from './i18n';
import { PICOSVC_PRICING } from './pricing-data';
import ServiceIcon from './components/ServiceIcon';

type Category = 'all' | 'build' | 'connect' | 'automate' | 'data' | 'delivery';

const PRODUCTS = [
  ['mcp', 'MCP', 'build', 'MC', 'Host remote MCP servers from GitHub.', 'GitHubからRemote MCPを公開。', '从 GitHub 部署远程 MCP 服务。'],
  ['mock', 'Mock API', 'build', 'MO', 'Create predictable endpoints for testing.', 'テスト用のMock APIを作成。', '创建用于测试的模拟 API。'],
  ['shot', 'Screenshot', 'build', 'SH', 'Capture web pages as PNG or PDF.', 'WebページをPNG・PDFで取得。', '将网页保存为 PNG 或 PDF。'],
  ['fetch', 'Web Fetch', 'build', 'FE', 'Extract page content and metadata.', 'ページ本文やメタデータを抽出。', '提取网页内容和元数据。'],
  ['functions', 'Functions', 'build', 'FN', 'Publish small JavaScript edge functions.', '小さなJavaScript関数を公開。', '发布轻量 JavaScript 边缘函数。'],
  ['hooks', 'Webhook Inbox', 'connect', 'WH', 'Receive, inspect and replay webhooks.', 'Webhookを受信・確認・再送。', '接收、查看并重放 Webhook。'],
  ['mail', 'Email → Webhook', 'connect', 'EM', 'Route incoming email to your webhook.', '受信メールをWebhookに転送。', '将收到的邮件转发到 Webhook。'],
  ['forms', 'Forms', 'connect', 'FO', 'Collect form submissions without a backend.', 'バックエンドなしでフォームを受信。', '无需自建后端即可接收表单。'],
  ['rss', 'Web → RSS', 'automate', 'RS', 'Turn a changing page into an RSS feed.', 'WebページをRSSフィードに変換。', '将网页转换为 RSS 订阅源。'],
  ['cron', 'Cron', 'automate', 'CR', 'Run scheduled HTTP requests.', 'HTTPリクエストを定期実行。', '定时执行 HTTP 请求。'],
  ['monitor', 'Monitor', 'automate', 'MN', 'Track changes to a web page.', 'Webページの変更を監視。', '监测网页变化。'],
  ['json', 'JSON Store', 'data', 'JS', 'Store and retrieve JSON documents.', 'JSONドキュメントを保存・取得。', '存储和获取 JSON 文档。'],
  ['license', 'License', 'data', 'LK', 'Issue and validate software license keys.', 'ライセンスキーを発行・検証。', '签发和验证软件许可证密钥。'],
  ['flags', 'Feature Flags', 'data', 'FF', 'Manage remote app configuration.', 'アプリのリモート設定を管理。', '管理应用远程配置。'],
  ['qr', 'Dynamic QR', 'delivery', 'QR', 'Create QR codes with editable destinations.', 'リンク先を変更できるQRを作成。', '创建可修改目标地址的二维码。'],
  ['files', 'Files', 'delivery', 'FL', 'Upload files and serve them by URL.', 'ファイルをアップロードしてURLで配信。', '上传文件并通过 URL 提供访问。'],
] as const;

const CATEGORY_IDS: Category[] = ['all', 'build', 'connect', 'automate', 'data', 'delivery'];
const COPY = {
  en: {
    eyebrow: 'Developer infrastructure, without the overhead', headline: 'Small services.', highlight: 'A whole toolkit.',
    lede: 'Build, connect, automate and ship with focused developer services. Manage everything from one PicoSvc account, with individual plans or optional bundles.',
    explore: 'Explore the services', pricingLink: 'View pricing', account: 'One account', productCount: '16 focused services', plans: 'Start with a free allowance where available',
    directory: 'PRODUCT DIRECTORY', choose: 'Find the tool for your next project.', directoryNote: 'Search by name or use a category to narrow down the suite.',
    search: 'Search services, e.g. webhook or JSON', clear: 'Clear search', matching: 'services found', noResults: 'No matching services. Try another keyword or category.',
    open: 'Open workspace →', available: 'Free allowance varies by service',
    pricing: 'A plan for the way you build.', pricingNote: 'Each product has its own quota. Choose just one, or combine services with a bundle.',
    standalone: 'Individual services', standaloneBody: 'Upgrade only the service you use, without buying the entire suite.',
    bundle: 'Suite bundles', bundleBody: 'Combine supported services under one bundle with product-specific limits.',
    from: 'from', monthly: '/ month', priceAction: 'Compare plans →',
    closing: 'Start with one small service.', closingBody: 'Explore the directory, create a resource, and add other products only as you need them.',
    categories: { all: 'All services', build: 'Build & test', connect: 'Connect', automate: 'Automate', data: 'Data & config', delivery: 'Deliver' },
  },
  ja: {
    eyebrow: '必要な分だけ使える開発者インフラ', headline: '小さなサービスを、', highlight: 'ひとつの場所に。',
    lede: '開発・連携・自動化・配信を、必要なサービスだけで。アカウントはPicoSvcひとつ。単品プランとBundleを用途に応じて選べます。',
    explore: 'サービスを探す', pricingLink: '料金を見る', account: '共通アカウント', productCount: '16の開発者向けサービス', plans: '無料枠のある製品から試せる',
    directory: 'サービス一覧', choose: '作りたいものから、探せる。', directoryNote: '名前で検索するか、カテゴリで絞り込んでください。',
    search: 'サービスを検索（例：Webhook、JSON）', clear: '検索を消去', matching: '件のサービス', noResults: '該当するサービスがありません。検索語かカテゴリを変更してください。',
    open: '管理画面を開く →', available: '無料枠はサービスごとに異なります',
    pricing: '使い方に合わせた料金。', pricingNote: '利用上限は製品ごとに独立。単品でも、複数まとめても利用できます。',
    standalone: '単品プラン', standaloneBody: '必要なサービスだけをアップグレード。使わないサービスの料金は不要です。',
    bundle: 'Bundleプラン', bundleBody: '対応サービスをまとめて利用。製品ごとの上限はそれぞれ適用されます。',
    from: '月額', monthly: '', priceAction: '料金を比較する →',
    closing: 'まずは、ひとつから。', closingBody: 'サービスを選んでリソースを作成。必要になったら別の製品も追加できます。',
    categories: { all: 'すべて', build: '開発・テスト', connect: '連携', automate: '自動化', data: 'データ・設定', delivery: '配信' },
  },
  'zh-CN': {
    eyebrow: '按需使用的开发者基础设施', headline: '小型服务。', highlight: '一站式工具箱。',
    lede: '开发、连接、自动化和交付，只选择需要的服务。使用一个 PicoSvc 账号，可单独订阅或选购 Bundle。',
    explore: '浏览服务', pricingLink: '查看价格', account: '统一账号', productCount: '16 项开发者服务', plans: '有免费额度的产品可先试用',
    directory: '服务目录', choose: '找到下一项目需要的工具。', directoryNote: '搜索服务名称，或按类别筛选。',
    search: '搜索服务，如 Webhook 或 JSON', clear: '清空搜索', matching: '项服务', noResults: '没有匹配的服务。请更换关键词或类别。',
    open: '打开工作台 →', available: '免费额度因服务而异',
    pricing: '按需选择方案。', pricingNote: '每个产品的配额独立。可以单独订阅，也可以购买 Bundle。',
    standalone: '单项服务', standaloneBody: '只升级需要的服务，无需购买整套产品。',
    bundle: 'Bundle 套餐', bundleBody: '合并使用已支持的服务，各产品仍有自己的配额。',
    from: '每月起', monthly: '', priceAction: '比较方案 →',
    closing: '从一项小服务开始。', closingBody: '浏览目录、创建资源，仅在需要时添加其他产品。',
    categories: { all: '全部', build: '构建与测试', connect: '连接', automate: '自动化', data: '数据与配置', delivery: '分发' },
  },
} as const;

export default function HomeV2() {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale];
  const c = messages.common;
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const visible = PRODUCTS.filter(([slug, name, group, , en, ja, zh]) =>
    (category === 'all' || category === group) &&
    (!normalized || [slug, name, en, ja, zh, t.categories[group]].some(value => value.toLocaleLowerCase().includes(normalized))),
  );

  return (
    <main className="homePage">
      <nav className="nav shell" aria-label="PicoSvc">
        <a className="brand" href={localizedHref('/')}><span className="brandMark" aria-hidden="true"><ServiceIcon name="brand" size={34} /></span><span>PicoSvc</span></a>
        <div className="navRight"><a href="#products">{c.products}</a><a href={localizedHref('/pricing')}>{t.pricingLink}</a><a href={localizedHref('/contact')}>{c.contact}</a><LanguageSwitcher /></div>
      </nav>

      <section className="hero shell homeHero">
        <div className="eyebrow"><span className="dot" /> {t.eyebrow}</div>
        <h1>{t.headline}<br /><span>{t.highlight}</span></h1>
        <p className="lede">{t.lede}</p>
        <div className="homeActions"><a className="primary" href="#products">{t.explore} <span aria-hidden="true">↘</span></a><a className="secondary" href={localizedHref('/pricing')}>{t.pricingLink} <span aria-hidden="true">→</span></a></div>
        <div className="homeProof" aria-label="PicoSvc highlights"><span>✦ {t.productCount}</span><span>◎ {t.account}</span><span>↗ {t.plans}</span></div>
      </section>

      <section className="shell homeSection" id="products" aria-labelledby="home-products-title">
        <div className="sectionHead"><div><span className="kicker">{t.directory}</span><h2 id="home-products-title">{t.choose}</h2><p>{t.directoryNote}</p></div></div>
        <div className="homeDiscover">
          <div className="homeSearchWrap"><label htmlFor="home-product-search" className="srOnly">{t.search}</label><input id="home-product-search" className="homeSearch" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} />{query && <button className="homeSearchClear" type="button" onClick={() => setQuery('')} aria-label={t.clear}>×</button>}</div>
          <div className="homeFilters" role="group" aria-label={t.directory}>{CATEGORY_IDS.map(id => <button type="button" key={id} className="homeFilter" aria-pressed={category === id} onClick={() => setCategory(id)}>{t.categories[id]}</button>)}</div>
          <p className="homeResults" role="status" aria-live="polite">{visible.length} {t.matching}</p>
        </div>
        {visible.length === 0 ? <div className="homeEmpty">{t.noResults}</div> :
          <div className="homeProducts">{visible.map(([slug, name, group, , en, ja, zh]) => <article className="deployment homeProduct" key={slug}>
            <div className="homeProductTop"><span className="homeProductIcon" aria-hidden="true"><ServiceIcon name={slug} size={54} /></span><span className="homeProductCategory">{t.categories[group]}</span></div>
            <h3>PicoSvc {name}</h3><p>{locale === 'ja' ? ja : locale === 'zh-CN' ? zh : en}</p>
            <div className="homeProductFooter"><span>{t.available}</span><a href={localizedHref(`/${slug}`)} aria-label={`${name} — ${t.open}`}>{t.open}</a></div>
          </article>)}</div>}
      </section>

      <section className="shell homeSection homePricing" aria-labelledby="home-pricing-title">
        <div className="sectionHead"><div><span className="kicker">PICOSVC PRICING</span><h2 id="home-pricing-title">{t.pricing}</h2><p>{t.pricingNote}</p></div></div>
        <div className="homePricingGrid">
          <article className="deployment homePriceCard"><span className="kicker">01 / INDIVIDUAL</span><h3>{t.standalone}</h3><div className="homePriceValue">${PICOSVC_PRICING.standalone.pico} <small>{t.monthly || t.from} · {t.from}</small></div><p>{t.standaloneBody}</p><a className="secondary" href={localizedHref('/pricing')}>{t.priceAction}</a></article>
          <article className="deployment homePriceCard"><span className="kicker">02 / BUNDLE</span><h3>{t.bundle}</h3><div className="homePriceValue">${PICOSVC_PRICING.bundles.pico} <small>{t.monthly || t.from} · {t.from}</small></div><p>{t.bundleBody}</p><a className="secondary" href={localizedHref('/pricing')}>{t.priceAction}</a></article>
        </div>
      </section>
      <section className="shell homeEnd"><div className="deployCard"><div><h2>{t.closing}</h2><p>{t.closingBody}</p></div><a href="#products" className="primary">{t.explore} →</a></div></section>
    </main>
  );
}
