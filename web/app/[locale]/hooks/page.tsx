import HooksPage from '../../hooks/page';
import ProductOverview from '../../product-overview';
import { LOCALE_SLUGS, slugToLocale } from '../../i18n-data';
import { localeMetadata, parseLocaleParam } from '../../seo';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return LOCALE_SLUGS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = localeMetadata(parseLocaleParam(locale), 'hooks');
  return { ...base, description: locale === 'ja' ? 'PicoSvc Hooks：Webhookの受信・確認・再送、使い方とWebhook.siteとの機能範囲をログイン不要で紹介。' : locale === 'zh-cn' ? '无需登录即可了解 PicoSvc Hooks 的 Webhook 接收、检查、重放和同类服务。' : 'Explore PicoSvc Hooks webhook capture, inspection, replay, and alternatives without signing in.', icons: { icon: '/icons/hooks.svg', shortcut: '/icons/hooks.svg' } };
}

export default async function HooksProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeSlug } = await params;
  const locale = slugToLocale(localeSlug);
  if (!locale) notFound();
  return <><HooksPage /><ProductOverview service="hooks" locale={locale} /></>;
}
