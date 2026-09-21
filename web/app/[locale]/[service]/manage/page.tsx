import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ServiceFleetConsole from '../../../service-fleet-console';
import McpFleetConsole from '../../../mcp-fleet-console';
import ServiceResourceDesk from '../../../service-resource-desk';
import ServiceOperationsDesk from '../../../service-operations-desk';
import { LOCALE_SLUGS, slugToLocale } from '../../../i18n-data';
import type { FleetService } from '../../../service-fleet-model';
import type { DeskService } from '../../../service-resource-desk-model';
import '../../../customer-pages.css';

const SERVICES = ['mcp', 'cron', 'mail', 'qr', 'rss', 'functions', 'monitor'] as const;
export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALE_SLUGS.flatMap(locale => SERVICES.map(service => ({ locale, service })));
}
export async function generateMetadata({ params }: { params: Promise<{ locale: string; service: string }> }): Promise<Metadata> {
  const { service } = await params;
  return { title: `${service.toUpperCase()} management | PicoSvc`, robots: { index: false, follow: false }, icons: { icon: `/icons/${SERVICES.some(value => value === service) ? service : 'picosvc'}.svg` } };
}
export default async function ServiceManagementPage({ params }: { params: Promise<{ locale: string; service: string }> }) {
  const { locale, service } = await params;
  if (!slugToLocale(locale) || !SERVICES.some(value => value === service)) notFound();
  if (service === 'mcp') return <McpFleetConsole />;
  if (service === 'qr' || service === 'rss') return <ServiceResourceDesk service={service as DeskService} />;
  if (service === 'functions' || service === 'monitor') return <ServiceOperationsDesk service={service} />;
  return <ServiceFleetConsole service={service as FleetService} />;
}
