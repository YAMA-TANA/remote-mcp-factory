import MockPage from '../../mock/page';
import ProductOverview from '../../product-overview';
import { LOCALE_SLUGS, slugToLocale } from '../../i18n-data';
import { localeMetadata, parseLocaleParam } from '../../seo';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = localeMetadata(parseLocaleParam(locale), 'mock');
  return { ...base, description: locale === 'ja' ? 'PicoSvc Mock API：できること、作り方、Mockoonとの機能範囲の違いをログイン不要で紹介。' : locale === 'zh-cn' ? '无需登录即可了解 PicoSvc Mock API 的功能、用法与同类产品。' : 'Learn PicoSvc Mock API features, setup, and how it differs from Mockoon without signing in.', icons: { icon: '/icons/mock.svg', shortcut: '/icons/mock.svg' } };
}

export default async function MockProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeSlug } = await params;
  const locale = slugToLocale(localeSlug);
  if (!locale) notFound();
  return <><MockPage /><ProductOverview service="mock" locale={locale} /></>;
}
