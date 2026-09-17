'use client';

import type { GenericServiceSlug } from './service-data';
import { CUSTOMER_GUIDES } from './customer-content';
import { useI18n } from './i18n';
import './service-management-guide.css';

// Only display an in-panel competitor claim after checking the linked vendor's own documentation.
// All other services link to the existing overview comparison instead.
const CHECKED_COMPARISONS: Partial<Record<GenericServiceSlug, string>> = {
  rss: 'https://politepol.com/about',
  json: 'https://jsonbin.io/api-reference',
  files: 'https://supabase.com/docs/guides/storage',
  license: 'https://keygen.sh/docs/validating-licenses/',
  flags: 'https://launchdarkly.com/docs/api/feature-flags',
};
const COPY = {
  ja: { title: 'このサービスの使い方と選び方', intro: '操作の前に、必要なもの・次の手順・対応範囲を確認できます。', prepare: '用意するもの', steps: '次にすること', limit: '対応範囲・注意', compare: '公式資料に基づく機能比較', ours: 'PicoSvc', other: '代替サービス', source: '競合の公式資料', overview: 'サービスの詳しい説明・比較', docs: 'API・手順を確認', note: '機能範囲の対照であり、品質・速度・料金・本番稼働の優劣や保証ではありません。競合の仕様・プランはリンク先で再確認してください。', noCompare: '機能比較は製品紹介ページで確認できます。' },
  en: { title: 'How to use and evaluate this service', intro: 'Check prerequisites, next steps and limitations before making changes.', prepare: 'What you need', steps: 'Next steps', limit: 'Scope and caveats', compare: 'Documented capability comparison', ours: 'PicoSvc', other: 'Alternative', source: 'Official competitor documentation', overview: 'Full overview and comparison', docs: 'API and walkthrough', note: 'This contrasts feature scope, not quality, speed or price, and does not guarantee production availability. Recheck vendor features and plan availability at the linked source.', noCompare: 'Read the product overview for a feature comparison.' },
  'zh-CN': { title: '如何使用与选择此服务', intro: '操作前查看准备事项、下一步与功能限制。', prepare: '准备事项', steps: '下一步', limit: '范围与注意事项', compare: '基于官方文档的功能对照', ours: 'PicoSvc', other: '其他服务', source: '竞品官方文档', overview: '完整介绍与对照', docs: 'API 与操作指南', note: '仅比较功能范围，不代表质量、速度或价格优劣，也不保证线上可用。请在链接的官方页面复核功能及套餐。', noCompare: '请在产品介绍页查看功能对照。' },
} as const;

/** Static, user-facing help. Does not fetch private resources or consume service quotas. */
export default function ServiceManagementGuide({ service }: { service: GenericServiceSlug }) {
  const { locale } = useI18n();
  const guide = CUSTOMER_GUIDES[service];
  const t = COPY[locale];
  const lang = locale === 'zh-CN' ? 'zh-cn' : locale;
  const overview = `/${lang}/${service}/`;
  const docs = `/${lang}/docs/${service}/`;
  const official = CHECKED_COMPARISONS[service];
  return <details className="serviceManagementGuide" aria-label={t.title}>
    <summary><span className="serviceManagementGuideIcon" aria-hidden="true">?</span><span><strong>{t.title}</strong><small>{t.intro}</small></span><span className="serviceManagementGuideChevron" aria-hidden="true">⌄</span></summary>
    <div className="serviceManagementGuideBody">
      <p className="serviceManagementGuideLead">{guide.summary[locale]}</p>
      <div className="serviceManagementGuideColumns">
        <section><h4>{t.prepare}</h4><p>{guide.prerequisite[locale]}</p><h4>{t.limit}</h4><p>{guide.limitation[locale]}</p></section>
        <section><h4>{t.steps}</h4><ol>{guide.steps.map((step, index) => <li key={index}>{step[locale]}</li>)}</ol></section>
      </div>
      {official ? <section className="serviceManagementGuideCompare"><h4>{t.compare}: {guide.competitor.name}</h4><p>{guide.competitor.axis[locale]}</p><dl><div><dt>{t.ours}</dt><dd>{guide.competitor.pico[locale]}</dd></div><div><dt>{t.other} · {guide.competitor.name}</dt><dd>{guide.competitor.other[locale]}</dd></div></dl><a href={official} target="_blank" rel="noopener noreferrer">{t.source} ↗</a></section> : <p className="serviceManagementGuideFine">{t.noCompare}</p>}
      <p className="serviceManagementGuideFine">{t.note}</p>
      <div className="serviceManagementGuideLinks"><a href={overview}>{t.overview} →</a><a href={docs}>{t.docs} →</a></div>
    </div>
  </details>;
}
