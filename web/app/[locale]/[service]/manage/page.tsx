import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ServiceFleetConsole from '../../../service-fleet-console';
import { LOCALE_SLUGS, slugToLocale } from '../../../i18n-data';
import type { FleetService } from '../../../service-fleet-model';

const SERVICES: readonly FleetService[] = ['cron', 'mail'];
export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALE_SLUGS.flatMap(locale => SERVICES.map(service => ({ locale, service })));
}
export async function generateMetadata({ params }: { params: Promise<{ locale: string; service: string }> }): Promise<Metadata> {
  const { service } = await params;
  return { title: `${service === 'cron' ? 'Cron' : 'Mail'} management | PicoSvc`, robots: { index: false, follow: false }, icons: { icon: `/icons/${service === 'cron' ? 'cron' : 'mail'}.svg` } };
}
export default async function FleetManagementPage({ params }: { params: Promise<{ locale: string; service: string }> }) {
  const { locale, service } = await params;
  if (!slugToLocale(locale) || (service !== 'cron' && service !== 'mail')) notFound();
  return <ServiceFleetConsole service={service} />;
}
