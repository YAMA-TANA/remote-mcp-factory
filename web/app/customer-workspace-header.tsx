import type { Locale } from './i18n-data';
import type { ProductSlug } from './customer-content';
import { SERVICE_INFO } from './service-data';
import './customer-pages.css';

const COPY = {
  ja: { overview: 'サービス説明', docs: '使い方・API例', all: '全体ダッシュボード', usage: '利用量・上限', fleet: '専用管理画面' },
  en: { overview: 'Product overview', docs: 'How-to & API examples', all: 'All-service dashboard', usage: 'Usage & limits', fleet: 'Control room' },
  'zh-CN': { overview: '服务介绍', docs: '使用指南与 API 示例', all: '全部服务总览', usage: '用量与限额', fleet: '专用管理界面' },
} as const;

export default function CustomerWorkspaceHeader({ service, locale }: { service: ProductSlug; locale: Locale }) {
  const lang = locale === 'zh-CN' ? 'zh-cn' : locale;
  const c = COPY[locale];
  return <header className="customerWorkspaceShell">
    <nav className="customerNav shell" aria-label="PicoSvc">
      <a className="customerBrand" href={`/${lang}/dashboard/`}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a>
      <div className="customerNavLinks">
        <a href={`/${lang}/dashboard/`}>{c.all}</a>
        <a href={`/${lang}/usage/`}>{c.usage}</a>
        {(service === 'cron' || service === 'mail') && <a href={`/${lang}/${service}/manage/`}>{c.fleet}</a>}
        <a href={`/${lang}/${service}/`}>{SERVICE_INFO[service].name} · {c.overview}</a>
        <a href={`/${lang}/docs/${service}/`}>{c.docs}</a>
      </div>
    </nav>
  </header>;
}
