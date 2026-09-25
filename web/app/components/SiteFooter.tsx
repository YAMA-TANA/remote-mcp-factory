'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import ServiceIcon from './ServiceIcon';
import './site-footer.css';

const COPY = {
  en: { tagline: 'Small developer services. One account, only the tools you need.', products: 'Explore', support: 'Information', pricing: 'Pricing', dashboard: 'My dashboard', docs: 'Customer documentation', status: 'Current service status (JSON)', built: 'Developer tools, thoughtfully sized.' },
  ja: { tagline: '必要な開発者サービスを、ひとつのアカウントで。', products: 'サービス', support: 'ご案内', pricing: '料金', dashboard: 'マイダッシュボード', docs: '使い方・ドキュメント', status: '現在の稼働状態（JSON）', built: '必要な分だけ使える開発者ツール。' },
  'zh-CN': { tagline: '一个账号，按需使用开发者服务。', products: '浏览服务', support: '更多信息', pricing: '价格', dashboard: '我的总览', docs: '使用指南', status: '当前服务状态（JSON）', built: '按需使用的开发者工具。' },
} as const;

export default function SiteFooter({ legacyOnly = false }: { legacyOnly?: boolean }) {
  const { locale, messages, localizedHref } = useI18n();
  const [showLegacy, setShowLegacy] = useState(false);
  const c = messages.common;
  const t = COPY[locale];
  useEffect(() => {
    if (!legacyOnly) return;
    setShowLegacy(!/^\/(en|ja|zh-cn)(\/|$)/.test(window.location.pathname));
  }, [legacyOnly]);
  if (legacyOnly && !showLegacy) return null;
  return (
    <footer className="picoFooter" aria-label="PicoSvc footer">
      <div className="shell">
        <div className="picoFooterGrid">
          <div className="picoFooterIdentity"><a className="brand" href={localizedHref('/')}><span className="brandMark" aria-hidden="true"><ServiceIcon name="brand" size={34} /></span><span>PicoSvc</span></a><p>{t.tagline}</p></div>
          <nav className="picoFooterColumn" aria-label={t.products}><strong>{t.products}</strong><a href={localizedHref('/dashboard')}>{t.dashboard} →</a><a href={localizedHref('/mcp')}>MCP</a><a href={localizedHref('/mock')}>Mock API</a><a href={localizedHref('/hooks')}>Webhook Inbox</a><a href={localizedHref('/rss')}>Web → RSS</a><a href={localizedHref('/')}>{c.products} →</a></nav>
          <nav className="picoFooterColumn" aria-label={t.support}><strong>{t.support}</strong><a href={localizedHref('/docs')}>{t.docs} →</a><a href={localizedHref('/pricing')}>{t.pricing}</a><a href={localizedHref('/contact')}>{c.contact} / {c.support}</a><a href={localizedHref('/terms')}>{c.terms}</a><a href={localizedHref('/privacy')}>{c.privacy}</a><a href="https://mcp.picosvc.com/api/picosvc/health" target="_blank" rel="noopener noreferrer">{t.status} ↗</a><a href={localizedHref('/tokushoho')}>{c.commercial}</a></nav>
        </div>
        <div className="picoFooterBottom"><span>© PicoSvc</span><span>{t.built}</span></div>
      </div>
    </footer>
  );
}
