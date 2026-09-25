import PricingPage from '../../pricing/page';
import { LOCALE_SLUGS } from '../../i18n-data';
import { localeMetadata, parseLocaleParam } from '../../seo';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return localeMetadata(parseLocaleParam(locale), 'pricing');
}

export default async function LocalizedPricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const slug = locale === 'ja' || locale === 'zh-cn' ? locale : 'en';
  const label = slug === 'ja' ? '自分の利用量と残りの上限を見る →' : slug === 'zh-cn' ? '查看我的用量和剩余额度 →' : 'View your usage and remaining quotas →';
  return <>
    <PricingPage />
    <section className="shell deploymentsSection"><div className="deployCard"><a className="primary" href={`/${slug}/usage`}>{label}</a></div></section>
  </>;
}
