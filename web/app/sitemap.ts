import type { MetadataRoute } from 'next';
import { LOCALES, type Locale } from './i18n-data';
import { localizedUrl, type PageKind } from './seo';

const PAGES: PageKind[] = ['home', 'mock', 'contact', 'terms', 'privacy', 'tokushoho'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((kind) => LOCALES.map((locale: Locale) => ({
    url: localizedUrl(locale, kind),
    changeFrequency: kind === 'home' || kind === 'mock' ? 'weekly' as const : 'monthly' as const,
    priority: kind === 'home' ? 1 : kind === 'mock' ? 0.9 : 0.5,
    alternates: {
      languages: {
        en: localizedUrl('en', kind),
        ja: localizedUrl('ja', kind),
        'zh-CN': localizedUrl('zh-CN', kind),
      },
    },
  })));
}
