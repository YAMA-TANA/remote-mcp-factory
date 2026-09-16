import PrivacyPage from '../../privacy/page';
import { localeMetadata, parseLocaleParam } from '../../seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return localeMetadata(parseLocaleParam(locale), 'privacy');
}

export default PrivacyPage;
