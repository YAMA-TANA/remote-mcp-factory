'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

const COPY = {
  en: { kicker: 'CHECKOUT', title: 'Subscribe with Clerk Billing', body: 'Plans configured in Clerk appear here and open Clerk’s checkout drawer. PicoSvc recognizes the picosvc-*-pico, picosvc-*-picoplus, picosvc-bundle-pico and picosvc-bundle-pro plan slugs.', user: 'Personal plans', org: 'Organization plans', missing: 'Clerk Billing is not configured for this build.' },
  ja: { kicker: 'CHECKOUT', title: 'Clerk Billingで契約', body: 'Clerkに作成したプランがここに表示され、公式checkout drawerで購入できます。PicoSvcは picosvc-*-pico / picoplus と picosvc-bundle-pico / pro のslugを自動認識します。', user: '個人向けプラン', org: 'Organization向けプラン', missing: 'このbuildではClerk Billingが設定されていません。' },
  'zh-CN': { kicker: 'CHECKOUT', title: '使用 Clerk Billing 订阅', body: '在 Clerk 中配置的套餐会显示在这里，并通过官方 checkout drawer 完成购买。PicoSvc 会自动识别 picosvc-*-pico / picoplus 以及 picosvc-bundle-pico / pro slug。', user: '个人套餐', org: '组织套餐', missing: '此构建尚未配置 Clerk Billing。' },
} as const;

export default function ClerkPricingTable() {
  const { locale } = useI18n();
  const t = COPY[locale];
  const [mode, setMode] = useState<'user' | 'organization'>('user');
  const [ready, setReady] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const clerkRef = useRef<any>(null);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const clerk = new Clerk(CLERK_KEY);
      await clerk.load();
      if (!active) return;
      clerkRef.current = clerk;
      setReady(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const clerk = clerkRef.current;
    const node = mountRef.current;
    if (!ready || !clerk || !node) return;
    clerk.mountPricingTable(node, {
      for: mode,
      collapseFeatures: true,
      newSubscriptionRedirectUrl: `/${locale === 'zh-CN' ? 'zh-cn' : locale}/pricing/`,
    });
    return () => clerk.unmountPricingTable(node);
  }, [ready, mode, locale]);

  return (
    <section className="shell deploymentsSection">
      <div className="sectionHead"><div><span className="kicker">{t.kicker}</span><h2>{t.title}</h2></div></div>
      <p className="lede">{t.body}</p>
      <div className="runtime" style={{ marginBottom: 18 }}>
        <button className={mode === 'user' ? 'primary' : 'ghost'} onClick={() => setMode('user')}>{t.user}</button>
        <button className={mode === 'organization' ? 'primary' : 'ghost'} onClick={() => setMode('organization')}>{t.org}</button>
      </div>
      {!CLERK_KEY ? <div className="notice">{t.missing}</div> : <div ref={mountRef} />}
    </section>
  );
}
