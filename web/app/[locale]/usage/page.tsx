import UsagePage from '../../usage/page';
import { LOCALE_SLUGS } from '../../i18n-data';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export const metadata = {
  title: 'PicoSvc usage & limits',
  robots: { index: false, follow: false },
};

export default function LocalizedUsagePage() {
  return <UsagePage />;
}
