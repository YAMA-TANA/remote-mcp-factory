import PricingPage from '../../pricing/page';
import ClerkPricingTable from '../../components/ClerkPricingTable';
import { localeMetadata, parseLocaleParam } from '../../seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return localeMetadata(parseLocaleParam(locale), 'pricing');
}

export default function LocalizedPricingPage() {
  return <><PricingPage /><ClerkPricingTable /></>;
}
