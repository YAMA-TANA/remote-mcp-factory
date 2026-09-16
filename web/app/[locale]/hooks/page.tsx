import HooksPage from '../../hooks/page';
import ProductLanding from '../../product-landing';
import { LOCALE_SLUGS, slugToLocale } from '../../i18n-data';
import { localeMetadata, parseLocaleParam } from '../../seo';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = localeMetadata(parseLocaleParam(locale), 'hooks');
  return { ...base, description: locale === 'ja' ? 'PicoSvc Hooks：Webhookの受信・確認・再送、活用例、料金と利用枠、Webhook.siteとの機能範囲をログイン不要で紹介。' : locale === 'zh-cn' ? '无需登录即可了解 PicoSvc Hooks 的使用场景、配额与同类服务。' : 'Explore PicoSvc Hooks webhook use cases, plans, setup, and alternatives without signing in.', icons: { icon: '/icons/hooks.svg', shortcut: '/icons/hooks.svg' } };
}

export default async function HooksProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeSlug } = await params;
  const locale = slugToLocale(localeSlug);
  if (!locale) notFound();
  return <><ProductLanding service="hooks" locale={locale} /><div id="workspace"><HooksPage /></div></>;
}
