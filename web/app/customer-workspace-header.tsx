import type { Locale } from './i18n-data';
import type { ProductSlug } from './customer-content';
import { SERVICE_INFO } from './service-data';
import './customer-pages.css';
const COPY = {
  ja: { overview: 'サービス説明', docs: '使い方・API例', all: '全体ダッシュボード', workspace: '操作画面' },
  en: { overview: 'Product overview', docs: 'How-to & API examples', all: 'All-service dashboard', workspace: 'Workspace' },
  'zh-CN': { overview: '服务介绍', docs: '使用指南与 API 示例', all: '全部服务总览', workspace: '工作台' },
} as const;
export default function CustomerWorkspaceHeader({ service, locale }: { service: ProductSlug; locale: Locale }) {
  const lang = locale === 'zh-CN' ? 'zh-cn' : locale;
  const c = COPY[locale];
  return <header className="customerPage"><nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={`/${lang}/dashboard/`}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc · {c.all}</a><div className="customerNavLinks"><a href={`/${lang}/${service}/`}>{SERVICE_INFO[service].name} · {c.overview}</a><a href={`/${lang}/docs/${service}/`}>{c.docs}</a><a href={`/${lang}/dashboard/`}>{c.all}</a></div></nav></header>;
}
