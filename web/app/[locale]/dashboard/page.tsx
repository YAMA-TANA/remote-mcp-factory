import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CustomerDashboard from '../../customer-dashboard';
import { LOCALE_SLUGS, slugToLocale } from '../../i18n-data';
export const dynamicParams = false;
export function generateStaticParams() { return LOCALE_SLUGS.map(locale => ({ locale })); }
export function generateMetadata(): Metadata { return { title:'My Dashboard | PicoSvc', description:'Manage PicoSvc services and view your monthly usage.', robots:{ index:false, follow:true }, icons:{icon:'/icons/picosvc.svg'} }; }
export default async function DashboardPage({params}:{params:Promise<{locale:string}>}) {
  const {locale} = await params;
  if (!slugToLocale(locale)) notFound();
  return <CustomerDashboard/>;
}
