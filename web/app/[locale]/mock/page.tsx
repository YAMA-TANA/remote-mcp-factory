import MockPage from '../../mock/page';
import { LOCALE_SLUGS } from '../../i18n-data';
import { localeMetadata, parseLocaleParam } from '../../seo';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { ...localeMetadata(parseLocaleParam(locale), 'mock'), icons: { icon: '/icons/mock.svg', shortcut: '/icons/mock.svg' } };
}

export default MockPage;
