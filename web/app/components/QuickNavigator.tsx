'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { SERVICE_INFO, type GenericServiceSlug } from '../service-data';
import './quick-navigator.css';

const PRODUCT_SLUGS: GenericServiceSlug[] = [
  'mcp', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron',
  'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
];
const SEARCH_WORDS: Record<GenericServiceSlug, string> = {
  mcp: 'model context protocol host remote deploy github',
  hooks: 'webhook inbox receive replay',
  rss: 'feed news website updates web to rss',
  mail: 'email inbound webhook forwarding',
  shot: 'screenshot png pdf image capture browser',
  fetch: 'markdown scrape metadata extract url',
  qr: 'dynamic qr code redirect scan',
  cron: 'scheduler recurring job http',
  functions: 'edge javascript function',
  json: 'key value database store',
  files: 'storage upload download r2',
  license: 'activation licensing keys',
  flags: 'feature flags remote configuration',
  monitor: 'monitor page changes uptime alerts',
  forms: 'form submissions backend',
};
const TEXT = {
  en: { open: 'Find a service', shortcut: 'Ctrl K', label: 'Quick navigation', hint: 'Search all services and pages', placeholder: 'Search products, APIs, or pages…', services: 'Products', pages: 'Pages', noResults: 'No matching pages or products.', close: 'Close', home: 'All products', pricing: 'Pricing', support: 'Contact & support', account: 'Account' },
  ja: { open: 'サービスを探す', shortcut: 'Ctrl K', label: 'クイックナビゲーション', hint: 'サービス・ページを検索', placeholder: '製品名・API・ページを検索…', services: 'サービス', pages: 'ページ', noResults: '該当するサービス・ページはありません。', close: '閉じる', home: '全サービス', pricing: '料金', support: 'お問い合わせ', account: 'アカウント' },
  'zh-CN': { open: '查找服务', shortcut: 'Ctrl K', label: '快速导航', hint: '搜索服务与页面', placeholder: '搜索产品、API 或页面…', services: '产品', pages: '页面', noResults: '没有匹配的产品或页面。', close: '关闭', home: '全部产品', pricing: '价格', support: '联系我们', account: '账户' },
} as const;

export default function QuickNavigator() {
  const { locale, localizedHref } = useI18n();
  const t = TEXT[locale];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const products = useMemo(() => PRODUCT_SLUGS.filter(slug => {
    const info = SERVICE_INFO[slug];
    return !normalized || `${slug} ${info.name} ${info.role} ${SEARCH_WORDS[slug]}`.toLocaleLowerCase().includes(normalized);
  }), [normalized]);
  const pages = [
    { name: t.home, path: '/', keywords: 'home products services dashboard' },
    { name: t.pricing, path: '/pricing', keywords: 'price subscription plans billing' },
    { name: t.support, path: '/contact', keywords: 'contact help support' },
  ].filter(page => !normalized || `${page.name} ${page.keywords}`.toLocaleLowerCase().includes(normalized));

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setOpen(previous => !previous); return;
      }
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  useEffect(() => {
    if (open) { inputRef.current?.focus(); return; }
    setQuery('');
  }, [open]);
  function close() { setOpen(false); triggerRef.current?.focus(); }
  return <>
    <button ref={triggerRef} className="picoQuickTrigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="pico-quick-dialog" onClick={() => setOpen(true)}>
      <span aria-hidden="true" className="picoQuickGlyph">⌕</span><span>{t.open}</span><kbd>{t.shortcut}</kbd>
    </button>
    {open && <div className="picoQuickOverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="picoQuickDialog" id="pico-quick-dialog" role="dialog" aria-modal="true" aria-label={t.label} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])'));
        if (focusable.length < 2) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
      }}>
        <div className="picoQuickHead"><label htmlFor="pico-quick-input">{t.hint}</label><button type="button" className="picoQuickClose" onClick={close} aria-label={t.close}>✕</button></div>
        <input id="pico-quick-input" ref={inputRef} type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.placeholder} aria-label={t.hint} />
        <div className="picoQuickResults" aria-live="polite">
          {products.length > 0 && <div className="picoQuickGroup"><h3>{t.services}</h3>{products.map(slug => <a key={slug} href={localizedHref(`/${slug}`)} onClick={() => setOpen(false)}><span className="picoQuickInitial" aria-hidden="true">{SERVICE_INFO[slug].name.slice(0, 1)}</span><span className="picoQuickDescription"><strong>{SERVICE_INFO[slug].name}</strong><small>{SERVICE_INFO[slug].role}</small></span><span aria-hidden="true">↗</span></a>)}</div>}
          {pages.length > 0 && <div className="picoQuickGroup"><h3>{t.pages}</h3>{pages.map(page => <a key={page.path} href={localizedHref(page.path)} onClick={() => setOpen(false)}><span className="picoQuickInitial" aria-hidden="true">↗</span><span className="picoQuickDescription"><strong>{page.name}</strong></span><span aria-hidden="true">↗</span></a>)}</div>}
          {!products.length && !pages.length && <p className="picoQuickEmpty">{t.noResults}</p>}
        </div>
        <div className="picoQuickBottom"><span>↑ ↓ · Tab</span><span>Esc · {t.close}</span></div>
      </section>
    </div>}
  </>;
}
