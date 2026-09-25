'use client';

import { useEffect, useRef, useState } from 'react';
import { ui } from '@clerk/ui';
import { useI18n } from '../i18n';

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

const COPY = {
  en: { kicker: 'PLANS & CHECKOUT', title: 'Choose a plan', body: 'Select a plan to review its price, billing schedule, and terms before checkout.', user: 'Individual plans', org: 'Organization plans', unavailable: 'Plans are temporarily unavailable. Please contact support for help.' },
  ja: { kicker: 'プラン・お支払い', title: 'プランを選ぶ', body: 'プランを選択し、購入画面で料金・更新条件・利用規約を確認してからお申し込みください。', user: '個人向けプラン', org: '組織向けプラン', unavailable: '現在プランを表示できません。サポートへお問い合わせください。' },
  'zh-CN': { kicker: '套餐与结账', title: '选择套餐', body: '选择套餐后，请在结账前确认价格、续费周期和使用条款。', user: '个人套餐', org: '组织套餐', unavailable: '暂时无法显示套餐，请联系支持团队。' },
} as const;

export default function ClerkPricingTable() {
  const { locale, localizedHref } = useI18n();
  const t = COPY[locale];
  const [mode, setMode] = useState<'user' | 'organization'>('user');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>(CLERK_KEY ? 'loading' : 'missing');
  const mountRef = useRef<HTMLDivElement>(null);
  const clerkRef = useRef<any>(null);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    setStatus('loading');
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const clerk = new Clerk(CLERK_KEY);
      const localization = locale === 'ja'
        ? (await import('@clerk/localizations/ja-JP')).jaJP
        : locale === 'zh-CN'
          ? (await import('@clerk/localizations/zh-CN')).zhCN
          : (await import('@clerk/localizations/en-US')).enUS;
      await clerk.load({ ui, localization });
      if (!active) return;
      clerkRef.current = clerk;
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    const clerk = clerkRef.current;
    const node = mountRef.current;
    if (status !== 'ready' || !clerk || !node) return;
    clerk.mountPricingTable(node, {
      for: mode,
      collapseFeatures: true,
      newSubscriptionRedirectUrl: `/${locale === 'zh-CN' ? 'zh-cn' : locale}/pricing/`,
    });
    return () => clerk.unmountPricingTable(node);
  }, [status, mode, locale]);

  return (
    <section className="shell deploymentsSection">
      <div className="sectionHead"><div><span className="kicker">{t.kicker}</span><h2>{t.title}</h2></div></div>
      <p className="lede">{t.body}</p>
      <div className="runtime" style={{ marginBottom: 18 }}>
        <button type="button" aria-pressed={mode === 'user'} className={mode === 'user' ? 'primary' : 'ghost'} onClick={() => setMode('user')}>{t.user}</button>
        <button type="button" aria-pressed={mode === 'organization'} className={mode === 'organization' ? 'primary' : 'ghost'} onClick={() => setMode('organization')}>{t.org}</button>
      </div>
      {status === 'loading' && <p role="status" className="notice">{locale === 'ja' ? 'プランを読み込んでいます…' : locale === 'zh-CN' ? '正在加载套餐…' : 'Loading plans…'}</p>}
      {(status === 'missing' || status === 'error') && <div className="notice">{t.unavailable} <a href={localizedHref('/contact')}>{locale === 'ja' ? 'お問い合わせ' : locale === 'zh-CN' ? '联系支持' : 'Contact support'} →</a></div>}
      <div ref={mountRef} />
    </section>
  );
}
