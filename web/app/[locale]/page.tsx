import HomeV2 from '../home-v2';
import { LOCALE_SLUGS } from '../i18n-data';
import { localeMetadata, parseLocaleParam } from '../seo';

// Static export needs concrete params at the route that emits each HTML page.
// Do not rely on the parent layout's generateStaticParams alone.
export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return localeMetadata(parseLocaleParam(locale), 'home');
}

export default HomeV2;
