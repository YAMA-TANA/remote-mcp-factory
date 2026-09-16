import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CustomerProductPage from '../../customer-product-page';
import { CUSTOMER_GUIDES } from '../../customer-content';
import { LOCALE_SLUGS, slugToLocale } from '../../i18n-data';
import { SITE_URL } from '../../seo';
export function generateStaticParams() { return LOCALE_SLUGS.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: slug } = await params;
  const locale = slugToLocale(slug);
  if (!locale) return {};
  const href = (lang: string) => `${SITE_URL}/${lang}/mock/`;
  return { title:'Mock API | PicoSvc', description: CUSTOMER_GUIDES.mock.summary[locale], robots:{index:true,follow:true}, icons:{icon:'/icons/mock.svg'}, alternates:{canonical:href(slug),languages:{en:href('en'),ja:href('ja'),'zh-CN':href('zh-cn'),'x-default':href('en')}} };
}
export default async function MockProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: slug } = await params;
  const locale = slugToLocale(slug);
  if (!locale) notFound();
  return <CustomerProductPage service="mock" locale={locale} />;
}
