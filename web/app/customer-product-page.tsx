import type { Locale } from './i18n-data';
import { SERVICE_INFO } from './service-data';
import { PICOSVC_PRICING, PICOSVC_QUOTAS } from './pricing-data';
import { CUSTOMER_GUIDES, type ProductSlug } from './customer-content';
import './customer-pages.css';

const COPY = {
  ja: { products:'サービス一覧', dashboard:'マイダッシュボード', learn:'製品説明', launch:'操作画面を開く', docs:'使い方・API例', audience:'こんな人向け', example:'実際の利用例', input:'何を入力する？', output:'何ができあがる？', prepare:'利用者が用意するもの', steps:'使い始める手順', compare:'機能を具体的に比較', axis:'比較する項目', ours:'PicoSvcでできること', theirs:'代替サービスの公式資料に記載されていること', source:'代替サービスの公式資料', limit:'対応範囲と注意点', pricing:'プラン別利用枠', disclaimer:'機能範囲のみを比較しています。性能・品質・料金の優劣は評価していません。競合の仕様は公式資料で再確認してください。PicoSvcの本番稼働はこの説明だけでは保証されません。', quota:'ここに示すプランはサイト側の設定値です。最終的な料金・利用条件は購入画面で確認してください。', explainer:'説明URL', app:'機能URL', docUrl:'ドキュメントURL', exampleSuffix:'設定をそのまま試したい方は操作画面へ。' },
  en: { products:'All services', dashboard:'My dashboard', learn:'Product overview', launch:'Open workspace', docs:'How-to & API examples', audience:'Who this is for', example:'A concrete use case', input:'What do I provide?', output:'What do I get?', prepare:'What you need to prepare', steps:'Get started', compare:'Compare specific capabilities', axis:'Dimension', ours:'PicoSvc capability', theirs:'Alternative: documented capability', source:'Official alternative documentation', limit:'Scope and limitations', pricing:'Quotas by plan', disclaimer:'This compares feature scope, not relative quality, performance, or price. Recheck the linked official source. The guide does not prove production availability.', quota:'Listed plan values reflect site configuration. Confirm final pricing and terms at checkout.', explainer:'Overview URL', app:'Workspace URL', docUrl:'Documentation URL', exampleSuffix:'Open the workspace to try this setup.' },
  'zh-CN': { products:'所有服务', dashboard:'我的总览', learn:'产品介绍', launch:'打开工作台', docs:'使用指南与 API 示例', audience:'适用人群', example:'具体使用案例', input:'需要提供什么？', output:'会得到什么？', prepare:'用户需要准备', steps:'开始使用', compare:'具体功能比较', axis:'比较维度', ours:'PicoSvc 提供', theirs:'其他服务官方文档所述', source:'其他服务官方资料', limit:'范围与限制', pricing:'套餐配额', disclaimer:'仅比较功能范围，不评判质量、性能或价格优劣。请复核官方资料；本指南不证明线上服务已可用。', quota:'套餐数据来自站点配置，最终价格与条款以结账页面为准。', explainer:'介绍 URL', app:'功能 URL', docUrl:'文档 URL', exampleSuffix:'可打开工作台尝试上述设置。' },
} as const;

export default function CustomerProductPage({ service, locale }: { service: ProductSlug; locale: Locale }) {
  const lang = locale === 'zh-CN' ? 'zh-cn' : locale;
  const base = `/${lang}/${service}/`;
  const guide = CUSTOMER_GUIDES[service];
  const c = COPY[locale];
  const info = SERVICE_INFO[service];
  const quota = PICOSVC_QUOTAS.find(row => row.service === info.name);
  return <main className="customerPage">
    <nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={`/${lang}/`}><img src="/icons/picosvc.svg" alt="" width="34" height="34"/>PicoSvc</a><div className="customerNavLinks"><a href={`/${lang}/`}>{c.products}</a><a href={`/${lang}/dashboard/`}>{c.dashboard}</a><a href={`/${lang}/docs/`}>{c.docs}</a></div></nav>
    <div className="shell customerBody">
      <header className="customerHero"><img src={`/icons/${service}.svg`} width="76" height="76" alt=""/><div><span className="customerEyebrow">PICOSVC / {info.name.toUpperCase()} · {c.learn}</span><h1>{info.name}</h1><p>{guide.summary[locale]}</p><div className="customerActions"><a className="customerPrimary" href={`${base}app/`}>{c.launch} →</a><a href={`/${lang}/docs/${service}/`}>{c.docs} ↗</a></div></div></header>
      <section className="customerUrlBox" aria-label="Product links"><div><span>{c.explainer}</span><a href={base}>picosvc.com{base}</a></div><div><span>{c.app}</span><a href={`${base}app/`}>picosvc.com{base}app/</a></div><div><span>{c.docUrl}</span><a href={`/${lang}/docs/${service}/`}>picosvc.com/{lang}/docs/{service}/</a></div></section>
      <section className="customerSection customerWho"><h2>{c.audience}</h2><p>{guide.who[locale]}</p></section>
      <section className="customerSection"><h2>{c.example}</h2><div className="customerExample"><p>{guide.example[locale]}</p><a href={`${base}app/`}>{c.exampleSuffix} →</a></div></section>
      <section className="customerSection"><div className="customerTwoCols"><article><h2>{c.input}</h2><p>{guide.input[locale]}</p></article><article><h2>{c.output}</h2><p>{guide.output[locale]}</p></article></div></section>
      <section className="customerSection"><h2>{c.prepare}</h2><p>{guide.prerequisite[locale]}</p><h2 className="customerStepsTitle">{c.steps}</h2><ol className="customerSteps">{guide.steps.map((step, index) => <li key={index}><span>{String(index + 1).padStart(2,'0')}</span>{step[locale]}</li>)}</ol><a className="customerInline" href={`/${lang}/docs/${service}/`}>{c.docs} →</a></section>
      {quota && <section className="customerSection"><h2>{c.pricing}</h2><div className="customerPlans"><article><strong>Free · $0</strong><p>{quota.free}</p></article><article><strong>Pico · ${PICOSVC_PRICING.standalone.pico}/mo</strong><p>{quota.pico}</p></article><article><strong>PicoPlus · ${PICOSVC_PRICING.standalone.picoPlus}/mo</strong><p>{quota.picoPlus}</p></article></div><p className="customerFine">{c.quota}</p></section>}
      <section className="customerSection"><h2>{c.compare}: {info.name} / {guide.competitor.name}</h2><p className="customerDimension"><strong>{c.axis}：</strong>{guide.competitor.axis[locale]}</p><div className="customerTwoCols"><article><h3>{c.ours}</h3><p>{guide.competitor.pico[locale]}</p></article><article><h3>{guide.competitor.name} — {c.theirs}</h3><p>{guide.competitor.other[locale]}</p><a href={guide.competitor.url} target="_blank" rel="noopener noreferrer">{c.source} ↗</a></article></div><p className="customerFine">{c.disclaimer}</p></section>
      <section className="customerSection customerLimit"><h2>{c.limit}</h2><p>{guide.limitation[locale]}</p></section>
      <div className="customerBottom"><a className="customerPrimary" href={`${base}app/`}>{c.launch} →</a><a href={`/${lang}/docs/${service}/`}>{c.docs} ↗</a><a href={`/${lang}/dashboard/`}>{c.dashboard} →</a></div>
    </div>
  </main>;
}
