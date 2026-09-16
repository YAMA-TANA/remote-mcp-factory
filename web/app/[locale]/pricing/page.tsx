import PricingPage from '../../pricing/page';
import { localeMetadata, parseLocaleParam } from '../../seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return localeMetadata(parseLocaleParam(locale), 'pricing');
}

export default PricingPage;
