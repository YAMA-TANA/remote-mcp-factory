'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  MESSAGES,
  localeToSlug,
  type Locale,
  type Messages,
} from './i18n-data';

export type { Locale } from './i18n-data';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Messages;
  localizedHref: (path: string) => string;
  routed: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem('picosvc_locale');
  if (saved === 'en' || saved === 'ja' || saved === 'zh-CN') return saved;
  const language = window.navigator.language.toLowerCase();
  if (language.startsWith('ja')) return 'ja';
  if (language.startsWith('zh')) return 'zh-CN';
  return 'en';
}

function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function isLegacyLocalizedPage(pathname: string): boolean {
  return /^\/(?:mock|contact|terms|privacy|tokushoho)?\/?$/.test(pathname);
}

export function LocaleProvider({
  children,
  initialLocale,
  routed = false,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
  routed?: boolean;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? 'en');

  useEffect(() => {
    if (!initialLocale) setLocaleState(detectLocale());
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem('picosvc_locale', locale);
  }, [locale]);

  useEffect(() => {
    if (routed || initialLocale) return;
    const pathname = window.location.pathname;
    if (/^\/(en|ja|zh-cn)(\/|$)/.test(pathname) || !isLegacyLocalizedPage(pathname)) return;
    const targetLocale = detectLocale();
    const suffix = pathname === '/' ? '/' : pathname;
    window.location.replace(`/${localeToSlug(targetLocale)}${suffix}${window.location.search}${window.location.hash}`);
  }, [routed, initialLocale]);

  useEffect(() => {
    if (!routed) return;
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/') || /^\/(en|ja|zh-cn)(\/|$)/.test(href)) return;
      event.preventDefault();
      const normalized = normalizePath(href);
      const prefix = `/${localeToSlug(locale)}`;
      window.location.assign(normalized === '/' ? `${prefix}/` : `${prefix}${normalized}`);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [locale, routed]);

  function localizedHref(path: string): string {
    const normalized = normalizePath(path);
    if (!routed) return normalized;
    const prefix = `/${localeToSlug(locale)}`;
    return normalized === '/' ? `${prefix}/` : `${prefix}${normalized}`;
  }

  function setLocale(nextLocale: Locale) {
    window.localStorage.setItem('picosvc_locale', nextLocale);
    if (!routed) {
      setLocaleState(nextLocale);
      return;
    }

    const pathname = window.location.pathname;
    const nextSlug = localeToSlug(nextLocale);
    const replaced = pathname.match(/^\/(en|ja|zh-cn)(\/|$)/)
      ? pathname.replace(/^\/(en|ja|zh-cn)(?=\/|$)/, `/${nextSlug}`)
      : `/${nextSlug}${pathname === '/' ? '/' : pathname}`;
    window.location.assign(`${replaced}${window.location.search}${window.location.hash}`);
  }

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    messages: MESSAGES[locale],
    localizedHref,
    routed,
  }), [locale, routed]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n must be used inside LocaleProvider');
  return value;
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <label className="languageSwitcher" aria-label="Language">
      <span aria-hidden="true">文/A</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        <option value="en">English</option>
        <option value="ja">日本語</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </label>
  );
}
