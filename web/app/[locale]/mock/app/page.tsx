import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MockPage from '../../../mock/page';
import CustomerWorkspaceHeader from '../../../customer-workspace-header';
import ServiceManagementGuide from '../../../service-management-guide';
import { LOCALE_SLUGS, slugToLocale } from '../../../i18n-data';
export function generateStaticParams() { return LOCALE_SLUGS.map(locale => ({ locale })); }
export function generateMetadata(): Metadata { return { title: 'Mock API Workspace | PicoSvc', robots: { index: false, follow: true }, icons: { icon: '/icons/mock.svg' } }; }
export default async function MockApp({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: slug } = await params;
  const locale = slugToLocale(slug);
  if (!locale) notFound();
  return <><CustomerWorkspaceHeader service="mock" locale={locale}/><section className="shell serviceManagementGuideStandalone"><ServiceManagementGuide service="mock" /></section><MockPage/></>;
}
