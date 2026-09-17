import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ServiceStudio from '../../../service-studio';
import FetchWorkspace from '../../../fetch-workspace';
import ShotWorkspace from '../../../shot-workspace-v2';
import MonitorDiagnostics from '../../../monitor-diagnostics';
import CustomerWorkspaceHeader from '../../../customer-workspace-header';
import { LOCALE_SLUGS, slugToLocale } from '../../../i18n-data';
import { GENERIC_SERVICE_SLUGS, SERVICE_INFO, isGenericServiceSlug } from '../../../service-data';
import '../../../service-advanced.css';

export const dynamicParams = false;
export function generateStaticParams() { return LOCALE_SLUGS.flatMap(locale => GENERIC_SERVICE_SLUGS.map(service => ({ locale, service }))); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string; service: string }> }): Promise<Metadata> {
  const { service } = await params;
  return isGenericServiceSlug(service) ? { title: `${SERVICE_INFO[service].name} Workspace | PicoSvc`, robots: { index: false, follow: true }, icons: { icon: `/icons/${service}.svg` } } : {};
}
export default async function ServiceAppPage({ params }: { params: Promise<{ locale: string; service: string }> }) {
  const { locale: slug, service } = await params;
  const locale = slugToLocale(slug);
  if (!locale || !isGenericServiceSlug(service)) notFound();
  const iconStyle = { '--product-icon': `url('/icons/${service}.svg')` } as CSSProperties;
  return <div className="picoProductTheme" style={iconStyle}>
    <CustomerWorkspaceHeader service={service} locale={locale} />
    {service === 'shot' ? <ShotWorkspace /> : service === 'fetch' ? <FetchWorkspace /> : service === 'monitor' ? <><ServiceStudio service={service} /><MonitorDiagnostics /></> : <ServiceStudio service={service} />}
  </div>;
}
