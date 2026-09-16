import type { MetadataRoute } from 'next';
import { LOCALES, type Locale } from './i18n-data';
import { localizedUrl, type PageKind } from './seo';

export const dynamic = 'force-static';

const PAGES: PageKind[] = ['home', 'mock', 'hooks', 'pricing', 'contact', 'terms', 'privacy', 'tokushoho'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((kind) => LOCALES.map((locale: Locale) => ({
    url: localizedUrl(locale, kind),
    changeFrequency: kind === 'home' || kind === 'mock' || kind === 'hooks' || kind === 'pricing' ? 'weekly' as const : 'monthly' as const,
    priority: kind === 'home' ? 1 : kind === 'mock' || kind === 'hooks' || kind === 'pricing' ? 0.9 : 0.5,
    alternates: {
      languages: {
        en: localizedUrl('en', kind),
        ja: localizedUrl('ja', kind),
        'zh-CN': localizedUrl('zh-CN', kind),
      },
    },
  })));
}
