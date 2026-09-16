import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CustomerDocsIndex from '../../customer-docs';
import { LOCALE_SLUGS, slugToLocale } from '../../i18n-data';
import { SITE_URL } from '../../seo';
export const dynamicParams = false;
export function generateStaticParams() { return LOCALE_SLUGS.map(locale => ({ locale })); }
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata> {
  const {locale} = await params;
  if(!slugToLocale(locale)) return {};
  return {title:'PicoSvc Customer Documentation',description:'Step-by-step customer instructions for 16 PicoSvc services.',robots:{index:true,follow:true},alternates:{canonical:`${SITE_URL}/${locale}/docs/`}};
}
export default async function DocsIndexPage({params}:{params:Promise<{locale:string}>}) {
  const {locale:slug} = await params;
  const locale = slugToLocale(slug);
  if(!locale) notFound();
  return <CustomerDocsIndex locale={locale}/>;
}
