import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CustomerServiceDocs } from '../../../customer-docs';
import { CUSTOMER_GUIDES, CUSTOMER_SLUGS, type ProductSlug } from '../../../customer-content';
import { SERVICE_INFO } from '../../../service-data';
import { LOCALE_SLUGS, slugToLocale } from '../../../i18n-data';
import { SITE_URL } from '../../../seo';
export const dynamicParams = false;
export function generateStaticParams() { return LOCALE_SLUGS.flatMap(locale => CUSTOMER_SLUGS.map(service => ({ locale, service }))); }
export async function generateMetadata({params}:{params:Promise<{locale:string;service:string}>}):Promise<Metadata> {
  const {locale:slug,service} = await params;
  const locale = slugToLocale(slug);
  if(!locale || !(service in CUSTOMER_GUIDES)) return {};
  const name=SERVICE_INFO[service as ProductSlug].name;
  return {title:`${name} How-to | PicoSvc`,description:CUSTOMER_GUIDES[service as ProductSlug].summary[locale],robots:{index:true,follow:true},alternates:{canonical:`${SITE_URL}/${slug}/docs/${service}/`},icons:{icon:`/icons/${service}.svg`}};
}
export default async function ServiceDocsPage({params}:{params:Promise<{locale:string;service:string}>}) {
  const {locale:slug,service} = await params;
  const locale=slugToLocale(slug);
  if(!locale || !CUSTOMER_SLUGS.includes(service as ProductSlug)) notFound();
  return <CustomerServiceDocs service={service as ProductSlug} locale={locale}/>;
}
