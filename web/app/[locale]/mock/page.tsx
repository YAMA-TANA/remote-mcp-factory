import MockPage from '../../mock/page';
import ProductLanding, { ProductIntro } from '../../product-landing';
import { LOCALE_SLUGS, slugToLocale } from '../../i18n-data';
import { localeMetadata, parseLocaleParam } from '../../seo';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = localeMetadata(parseLocaleParam(locale), 'mock');
  return { ...base, description: locale === 'ja' ? 'PicoSvc Mock API：できること、活用例、料金と利用枠、Mockoonとの機能範囲の違いをログイン不要で紹介。' : locale === 'zh-cn' ? '无需登录即可了解 PicoSvc Mock API 的功能、用例、配额与同类产品。' : 'Explore PicoSvc Mock API use cases, plans, setup, and alternatives without signing in.', icons: { icon: '/icons/mock.svg', shortcut: '/icons/mock.svg' } };
}

export default async function MockProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeSlug } = await params;
  const locale = slugToLocale(localeSlug);
  if (!locale) notFound();
  return <><ProductIntro service="mock" locale={locale} /><div id="workspace"><MockPage /></div><ProductLanding service="mock" locale={locale} /></>;
}
