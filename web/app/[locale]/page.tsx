import HomeV2 from '../home-v2';
import { localeMetadata, parseLocaleParam } from '../seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return localeMetadata(parseLocaleParam(locale), 'home');
}

export default HomeV2;
