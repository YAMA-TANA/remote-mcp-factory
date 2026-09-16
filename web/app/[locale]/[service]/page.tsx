import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CustomerProductPage from '../../customer-product-page';
import { LOCALE_SLUGS, localeToSlug, slugToLocale } from '../../i18n-data';
import { GENERIC_SERVICE_SLUGS, SERVICE_INFO, isGenericServiceSlug } from '../../service-data';
import { CUSTOMER_GUIDES } from '../../customer-content';
import { SITE_URL } from '../../seo';

export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALE_SLUGS.flatMap(locale => GENERIC_SERVICE_SLUGS.map(service => ({ locale, service })));
}
export async function generateMetadata({ params }: { params: Promise<{ locale: string; service: string }> }): Promise<Metadata> {
  const { locale: slug, service } = await params;
  const locale = slugToLocale(slug);
  if (!locale || !isGenericServiceSlug(service)) return {};
  const name = SERVICE_INFO[service].name;
  const description = CUSTOMER_GUIDES[service].summary[locale];
  const href = (target: 'en' | 'ja' | 'zh-CN') => `${SITE_URL}/${localeToSlug(target)}/${service}/`;
  return { title: `${name} | PicoSvc`, description, robots: { index: true, follow: true }, icons: { icon: `/icons/${service}.svg` }, alternates: { canonical: href(locale), languages: { en: href('en'), ja: href('ja'), 'zh-CN': href('zh-CN'), 'x-default': href('en') } }, openGraph: { title: `${name} | PicoSvc`, description, url: href(locale), siteName: 'PicoSvc', type: 'website' } };
}
export default async function PublicProductPage({ params }: { params: Promise<{ locale: string; service: string }> }) {
  const { locale: slug, service } = await params;
  const locale = slugToLocale(slug);
  if (!locale || !isGenericServiceSlug(service)) notFound();
  return <CustomerProductPage service={service} locale={locale} />;
}
