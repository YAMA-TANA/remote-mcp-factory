import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HooksPage from '../../../hooks/page';
import CustomerWorkspaceHeader from '../../../customer-workspace-header';
import { LOCALE_SLUGS, slugToLocale } from '../../../i18n-data';
export function generateStaticParams() { return LOCALE_SLUGS.map(locale => ({ locale })); }
export function generateMetadata(): Metadata { return { title: 'Webhook Inbox Workspace | PicoSvc', robots: { index: false, follow: true }, icons: { icon: '/icons/hooks.svg' } }; }
export default async function HooksApp({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: slug } = await params;
  const locale = slugToLocale(slug);
  if (!locale) notFound();
  return <><CustomerWorkspaceHeader service="hooks" locale={locale}/><HooksPage/></>;
}
