'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { SERVICE_INFO } from '../service-data';
import { matchesServiceSearch, normalizeServiceSearch, type SearchableService } from '../service-search';
import ServiceIcon from './ServiceIcon';
import './quick-navigator.css';

type NavSlug = SearchableService;
const PRODUCT_SLUGS: NavSlug[] = [
  'mock', 'mcp', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron',
  'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
];
const TEXT = {
  en: { open: 'Find a service', shortcut: 'Ctrl K', label: 'Quick navigation', hint: 'Search all services and pages', placeholder: 'Try screenshot, monitoring, or webhook…', services: 'Products', pages: 'Pages', noResults: 'No matching pages or products.', close: 'Close', home: 'All products', pricing: 'Pricing', support: 'Contact & support', results: 'results', navigate: '↑ ↓ to navigate · Enter to open' },
  ja: { open: 'サービスを探す', shortcut: 'Ctrl K', label: 'クイックナビゲーション', hint: 'サービス・ページを検索', placeholder: '「スクショ」「監視」「Webhook」などで検索…', services: 'サービス', pages: 'ページ', noResults: '該当するサービス・ページはありません。', close: '閉じる', home: '全サービス', pricing: '料金', support: 'お問い合わせ', results: '件の候補', navigate: '↑ ↓ で選択 · Enter で移動' },
  'zh-CN': { open: '查找服务', shortcut: 'Ctrl K', label: '快速导航', hint: '搜索服务与页面', placeholder: '试试截图、监控或 Webhook…', services: '产品', pages: '页面', noResults: '没有匹配的产品或页面。', close: '关闭', home: '全部产品', pricing: '价格', support: '联系我们', results: '个结果', navigate: '↑ ↓ 选择 · Enter 打开' },
} as const;
function productInfo(slug: NavSlug): { name: string; role: string } {
  return slug === 'mock' ? { name: 'Mock API', role: 'Configurable mock HTTP endpoints' } : SERVICE_INFO[slug];
}

export default function QuickNavigator() {
  const { locale, localizedHref } = useI18n();
  const t = TEXT[locale];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const normalized = normalizeServiceSearch(query);
  const products = useMemo(() => PRODUCT_SLUGS.filter(slug => {
    const info = productInfo(slug);
    return matchesServiceSearch(slug, normalized, info.name, info.role);
  }), [normalized]);
  const pages = [
    { name: t.home, path: '/', keywords: 'home products services dashboard ホーム 首页' },
    { name: t.pricing, path: '/pricing', keywords: 'price subscription plans billing 料金 価格 订阅' },
    { name: t.support, path: '/contact', keywords: 'contact help support お問い合わせ サポート 联系 支持' },
  ].filter(page => !normalized || normalizeServiceSearch(`${page.name} ${page.keywords}`).includes(normalized));

  function close() { setOpen(false); triggerRef.current?.focus(); }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) close(); else setOpen(true);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault(); close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);
  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return <>
    <button ref={triggerRef} className="picoQuickTrigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="pico-quick-dialog" onClick={() => setOpen(true)}>
      <span aria-hidden="true" className="picoQuickGlyph">⌕</span><span>{t.open}</span><kbd>{t.shortcut}</kbd>
    </button>
    {open && <div className="picoQuickOverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialogRef} className="picoQuickDialog" id="pico-quick-dialog" role="dialog" aria-modal="true" aria-label={t.label} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
          (event.target === inputRef.current || (event.target instanceof HTMLAnchorElement && event.target.closest('.picoQuickResults')))) {
          const links = Array.from(dialogRef.current?.querySelectorAll<HTMLAnchorElement>('.picoQuickResults a[href]') || []);
          if (!links.length) return;
          event.preventDefault();
          const current = links.indexOf(document.activeElement as HTMLAnchorElement);
          const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : current + (event.key === 'ArrowDown' ? 1 : -1);
          if (next < 0 || next >= links.length) inputRef.current?.focus();
          else { links[next].focus(); links[next].scrollIntoView({ block: 'nearest' }); }
          return;
        }
        if (event.key === 'Enter' && event.target === inputRef.current) {
          const first = dialogRef.current?.querySelector<HTMLAnchorElement>('.picoQuickResults a[href]');
          if (first) { event.preventDefault(); first.click(); }
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])'));
        if (focusable.length < 2) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
      }}>
        <div className="picoQuickHead"><label htmlFor="pico-quick-input">{t.hint}</label><button type="button" className="picoQuickClose" onClick={close} aria-label={t.close}>✕</button></div>
        <input id="pico-quick-input" ref={inputRef} type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.placeholder} aria-label={t.hint} aria-controls="pico-quick-results" />
        <p className="picoQuickCount" role="status" aria-live="polite">{products.length + pages.length} {t.results}</p>
        <div className="picoQuickResults" id="pico-quick-results">
          {products.length > 0 && <div className="picoQuickGroup"><h3>{t.services}</h3>{products.map(slug => <a key={slug} href={localizedHref(`/${slug}`)} onClick={() => setOpen(false)}><span className="picoQuickInitial" aria-hidden="true"><ServiceIcon name={slug} size={38} /></span><span className="picoQuickDescription"><strong>{productInfo(slug).name}</strong><small>{productInfo(slug).role}</small></span><span aria-hidden="true">↗</span></a>)}</div>}
          {pages.length > 0 && <div className="picoQuickGroup"><h3>{t.pages}</h3>{pages.map(page => <a key={page.path} href={localizedHref(page.path)} onClick={() => setOpen(false)}><span className="picoQuickInitial" aria-hidden="true">↗</span><span className="picoQuickDescription"><strong>{page.name}</strong></span><span aria-hidden="true">↗</span></a>)}</div>}
          {!products.length && !pages.length && <p className="picoQuickEmpty">{t.noResults}</p>}
        </div>
        <div className="picoQuickBottom"><span>{t.navigate}</span><span>Esc · {t.close}</span></div>
      </section>
    </div>}
  </>;
}
