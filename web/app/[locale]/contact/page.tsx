import ContactPage from '../../contact/page';
import { localeMetadata, parseLocaleParam } from '../../seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return localeMetadata(parseLocaleParam(locale), 'contact');
}

export default ContactPage;
