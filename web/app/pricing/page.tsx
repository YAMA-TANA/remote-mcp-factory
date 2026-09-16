'use client';

import { LanguageSwitcher, useI18n } from '../i18n';

const COPY = {
  en: {
    title1: 'Simple pricing.', title2: 'The same across every service.',
    lede: 'Every PicoSvc service follows the same paid pricing. Use one service on its own, or bundle the suite when you need several.',
    standalone: 'STANDALONE SERVICES', standaloneTitle: 'One price model for every product.',
    free: 'Free', freePrice: '$0', freeBody: 'A small free allowance where the product offers one. Limits vary by service.',
    pico: 'Pico', picoPrice: '$1', picoBody: 'Per service, per month. The standard paid tier for small projects.',
    picoPlus: 'PicoPlus', picoPlusPrice: '$5', picoPlusBody: 'Per service, per month. Higher quotas for heavier individual use.',
    custom: 'Custom', customPrice: 'Contact us', customBody: 'Need more than PicoPlus, a custom quota, or a business arrangement? Talk to us.',
    perMonth: '/ month', perService: 'per service',
    bundles: 'BUNDLES', bundlesTitle: 'Using several services? Bundle them.',
    bundlePico: 'Bundle Pico', bundlePicoPrice: '$5', bundlePicoBody: 'Pico tier across the PicoSvc suite. Best when you use several small services together.',
    bundlePro: 'Bundle Pro', bundleProPrice: '$22', bundleProBody: 'PicoPlus tier across the PicoSvc suite for broader and heavier usage.',
    availableNote: 'Bundle grants apply to supported products as they are available. Product-specific quotas still apply.',
    contact: 'Contact for custom usage →', products: 'See products →',
  },
  ja: {
    title1: '料金はシンプル。', title2: '全サービスで同じです。',
    lede: 'PicoSvcの有料プランは、すべてのサービスで同じ料金体系です。1サービスだけ契約しても、複数サービスをBundleにまとめても使えます。',
    standalone: '単品サービス', standaloneTitle: 'どの製品でも同じ料金体系。',
    free: 'Free', freePrice: '$0', freeBody: 'Free枠がある製品では、小規模な無料枠を利用できます。上限はサービスごとに異なります。',
    pico: 'Pico', picoPrice: '$1', picoBody: '1サービスあたり月額$1。小規模プロジェクト向けの標準有料プランです。',
    picoPlus: 'PicoPlus', picoPlusPrice: '$5', picoPlusBody: '1サービスあたり月額$5。単品サービスをより多く使うための上位枠です。',
    custom: 'Custom', customPrice: '要相談', customBody: 'PicoPlusを超える利用量、個別上限、法人向け条件などはお問い合わせください。',
    perMonth: '/ 月', perService: '1サービス',
    bundles: 'BUNDLE', bundlesTitle: '複数サービスならBundle。',
    bundlePico: 'Bundle Pico', bundlePicoPrice: '$5', bundlePicoBody: 'PicoSvc各サービスのPico枠をまとめて利用。複数の小型サービスを使う場合に向いています。',
    bundlePro: 'Bundle Pro', bundleProPrice: '$22', bundleProBody: 'PicoSvc各サービスのPicoPlus枠をまとめて利用する上位Bundleです。',
    availableNote: 'Bundleの権限は対応済みの製品に適用され、各製品固有の利用上限はそのまま適用されます。',
    contact: '上位利用について相談 →', products: '製品を見る →',
  },
  'zh-CN': {
    title1: '价格简单。', title2: '所有服务采用同一套价格。',
    lede: 'PicoSvc 的所有付费服务采用统一价格。你可以单独订阅一个服务，也可以在需要多个服务时购买 Bundle。',
    standalone: '单项服务', standaloneTitle: '每个产品采用相同的价格模型。',
    free: 'Free', freePrice: '$0', freeBody: '提供 Free 档的产品可使用小额免费额度，具体限制因服务而异。',
    pico: 'Pico', picoPrice: '$1', picoBody: '每项服务每月 $1，适合小型项目的标准付费档。',
    picoPlus: 'PicoPlus', picoPlusPrice: '$5', picoPlusBody: '每项服务每月 $5，为单项服务提供更高配额。',
    custom: 'Custom', customPrice: '联系我们', customBody: '如需超过 PicoPlus 的用量、自定义额度或企业方案，请联系我们。',
    perMonth: '/ 月', perService: '每项服务',
    bundles: 'BUNDLE', bundlesTitle: '使用多个服务？选择 Bundle。',
    bundlePico: 'Bundle Pico', bundlePicoPrice: '$5', bundlePicoBody: '在 PicoSvc 套件中获得 Pico 档，适合同时使用多个轻量服务。',
    bundlePro: 'Bundle Pro', bundleProPrice: '$22', bundleProBody: '在 PicoSvc 套件中获得 PicoPlus 档，适合更广泛、更高用量的场景。',
    availableNote: 'Bundle 权限适用于已支持的产品，各产品自身的用量上限仍然有效。',
    contact: '咨询更高用量 →', products: '查看产品 →',
  },
} as const;

export default function PricingPage() {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale];
  const c = messages.common;

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight">
          <a href={localizedHref('/')}>{c.products}</a><a href={localizedHref('/mock')}>{c.mock}</a><a href={localizedHref('/hooks')}>Hooks</a><a href={localizedHref('/contact')}>{c.contact}</a><LanguageSwitcher />
        </div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> PicoSvc Pricing</div>
        <h1>{t.title1}<br />{t.title2}</h1>
        <p className="lede">{t.lede}</p>
      </section>

      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">{t.standalone}</span><h2>{t.standaloneTitle}</h2></div></div>
        <div className="deploymentGrid">
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.free}</strong><p>{t.freeBody}</p></div><span className="status ready">{t.freePrice}</span></div><div className="runtime"><span>{t.perService}</span><span>{t.perMonth}</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.pico}</strong><p>{t.picoBody}</p></div><span className="status ready">{t.picoPrice}{t.perMonth}</span></div><div className="runtime"><span>{t.perService}</span><span>$1</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.picoPlus}</strong><p>{t.picoPlusBody}</p></div><span className="status ready">{t.picoPlusPrice}{t.perMonth}</span></div><div className="runtime"><span>{t.perService}</span><span>$5</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.custom}</strong><p>{t.customBody}</p></div><span className="status">{t.customPrice}</span></div><div className="deploymentBottom"><a href={localizedHref('/contact')}>{t.contact}</a></div></article>
        </div>
      </section>

      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">{t.bundles}</span><h2>{t.bundlesTitle}</h2></div></div>
        <div className="deploymentGrid">
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.bundlePico}</strong><p>{t.bundlePicoBody}</p></div><span className="status ready">{t.bundlePicoPrice}{t.perMonth}</span></div><div className="runtime"><span>Pico</span><span>all services</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{t.bundlePro}</strong><p>{t.bundleProBody}</p></div><span className="status ready">{t.bundleProPrice}{t.perMonth}</span></div><div className="runtime"><span>PicoPlus</span><span>all services</span></div></article>
        </div>
        <div className="notice" style={{ marginTop: 18 }}>{t.availableNote}</div>
        <div style={{ marginTop: 18 }}><a className="primary" href={localizedHref('/')}>{t.products}</a></div>
      </section>
    </main>
  );
}
