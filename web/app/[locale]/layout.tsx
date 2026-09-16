import { notFound } from 'next/navigation';
import { LocaleProvider } from '../i18n';
import SiteFooter from '../components/SiteFooter';
import { LOCALE_SLUGS, slugToLocale } from '../i18n-data';

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export default async function LocalizedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: slug } = await params;
  const locale = slugToLocale(slug);
  if (!locale) notFound();

  return (
    <LocaleProvider initialLocale={locale} routed>
      {children}
      <SiteFooter />
    </LocaleProvider>
  );
}
