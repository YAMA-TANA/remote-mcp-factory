import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ServiceDashboard from '../../service-dashboard';
import ShotWorkspace from '../../shot-workspace';
import '../../service-advanced.css';
import { LOCALE_SLUGS, localeToSlug, slugToLocale } from '../../i18n-data';
import { GENERIC_SERVICE_SLUGS, SERVICE_INFO, isGenericServiceSlug } from '../../service-data';
import { SITE_URL } from '../../seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALE_SLUGS.flatMap((locale) =>
    GENERIC_SERVICE_SLUGS.map((service) => ({ locale, service })),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; service: string }> }): Promise<Metadata> {
  const { locale: localeSlug, service } = await params;
  const locale = slugToLocale(localeSlug);
  if (!locale || !isGenericServiceSlug(service)) return {};
  const info = SERVICE_INFO[service];
  const pathFor = (targetLocale: 'en' | 'ja' | 'zh-CN') => `${SITE_URL}/${localeToSlug(targetLocale)}/${service}/`;
  const descriptions = {
    en: `${info.role} with PicoSvc. Free tier, Pico $1/month and PicoPlus $5/month.`,
    ja: `PicoSvc ${info.name} — ${info.role}。Free、Pico 月$1、PicoPlus 月$5で利用できます。`,
    'zh-CN': `PicoSvc ${info.name} — ${info.role}。支持 Free、Pico $1/月和 PicoPlus $5/月。`,
  } as const;
  const title = `PicoSvc ${info.name}`;
  const canonical = pathFor(locale);
  return {
    title,
    description: descriptions[locale],
    robots: { index: true, follow: true },
    alternates: {
      canonical,
      languages: {
        en: pathFor('en'),
        ja: pathFor('ja'),
        'zh-CN': pathFor('zh-CN'),
        'x-default': pathFor('en'),
      },
    },
    openGraph: { title, description: descriptions[locale], url: canonical, siteName: 'PicoSvc', type: 'website' },
  };
}

export default async function GenericServicePage({ params }: { params: Promise<{ locale: string; service: string }> }) {
  const { service } = await params;
  if (!isGenericServiceSlug(service)) notFound();
  return service === 'shot' ? <ShotWorkspace /> : <ServiceDashboard service={service} />;
}
