import HooksPage from '../../hooks/page';
import { LOCALE_SLUGS } from '../../i18n-data';
import { localeMetadata, parseLocaleParam } from '../../seo';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { ...localeMetadata(parseLocaleParam(locale), 'hooks'), icons: { icon: '/icons/hooks.svg', shortcut: '/icons/hooks.svg' } };
}

export default HooksPage;
