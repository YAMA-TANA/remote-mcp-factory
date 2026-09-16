'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { LanguageSwitcher, useI18n } from '../i18n';

type Dimension = {
  metric: string;
  kind: 'policy' | 'monthly' | 'inventory' | 'storage';
  used: number | null;
  limit: number;
  remaining?: number;
  percent: number | null;
  threshold: 70 | 90 | 100 | null;
};
type ProductUsage = { slug: string; name: string; tier: string; dimensions: Dimension[] };
type UsagePayload = {
  month: string;
  products: ProductUsage[];
  alerts: Array<{ product: string; metric: string; used: number; limit: number; percent: number; threshold: number }>;
};
const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const COPY = {
  en: { eyebrow: 'YOUR PICOSVC ACCOUNT', title: 'Usage & limits', description: 'Current inventory and this month’s metered usage across all services.', refresh: 'Refresh usage', signIn: 'Sign in to view usage', alerts: 'Usage alerts', noAlerts: 'No quotas have reached the 70% threshold.', noData: 'No usage information is available.', used: 'used', left: 'remaining', limit: 'limit', policy: 'Plan setting', month: 'Billing month' },
  ja: { eyebrow: 'PICOSVC アカウント', title: '利用量と上限', description: '全サービスの現在の保有数と今月の使用量を確認できます。', refresh: '利用量を更新', signIn: 'ログインして利用量を見る', alerts: '利用量アラート', noAlerts: '70%以上に達した項目はありません。', noData: '利用量データがありません。', used: '使用済み', left: '残り', limit: '上限', policy: 'プラン設定', month: '利用月' },
  'zh-CN': { eyebrow: 'PICOSVC 账户', title: '用量与限额', description: '查看所有服务的当前资源数及本月用量。', refresh: '刷新用量', signIn: '登录后查看用量', alerts: '用量提醒', noAlerts: '没有项目达到 70% 阈值。', noData: '暂无用量数据。', used: '已用', left: '剩余', limit: '上限', policy: '套餐设置', month: '计费月份' },
} as const;

function formatted(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export default function UsagePage() {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLERK_KEY) { setError('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not configured.'); return; }
    let active = true;
    let removeListener: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY);
      await instance.load();
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      removeListener = instance.addListener(() => setSignedIn(Boolean(instance.isSignedIn)));
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; removeListener?.(); };
  }, []);

  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    clerk.mountUserButton(userButtonRef.current);
    return () => { if (userButtonRef.current) clerk.unmountUserButton(userButtonRef.current); };
  }, [clerk, signedIn]);

  useEffect(() => {
    if (!signedIn || !clerk) { setUsage(null); return; }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
        const token = await clerk.session?.getToken();
        if (!token) throw new Error('Authentication required');
        const response = await fetch(`${API_URL}/api/picosvc/usage`, {
          headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `HTTP ${response.status}`);
        if (active) setUsage(result as UsagePayload);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [signedIn, clerk]);

  async function refresh() {
    if (!clerk?.isSignedIn) return;
    setLoading(true); setError('');
    try {
      const token = await clerk.session?.getToken();
      if (!token || !API_URL) throw new Error('Authentication or API configuration missing');
      const response = await fetch(`${API_URL}/api/picosvc/usage`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `HTTP ${response.status}`);
      setUsage(result as UsagePayload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }

  return <main>
    <nav className="nav shell">
      <a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a>
      <div className="navRight"><a href={localizedHref('/')}>{messages.common.products}</a><a href={localizedHref('/pricing')}>Pricing</a><LanguageSwitcher />{signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div>
    </nav>
    <section className="hero shell">
      <div className="eyebrow"><span className="dot" /> {t.eyebrow}</div>
      <h1>{t.title}</h1><p className="lede">{t.description}</p>
      {!signedIn ? <div className="deployCard signinState"><strong>{t.signIn}</strong><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></div>
        : <div className="deployCard"><div className="sectionHead"><div><span className="kicker">{t.month}</span><h2>{usage?.month || '—'}</h2></div><button className="ghost" disabled={loading} onClick={() => void refresh()}>{loading ? '…' : t.refresh}</button></div></div>}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
    {signedIn && <section className="shell deploymentsSection">
      <div className="sectionHead"><div><span className="kicker">70% · 90% · 100%</span><h2>{t.alerts}</h2></div></div>
      {!usage || usage.alerts.length === 0 ? <div className="empty">{t.noAlerts}</div> :
        <div className="deploymentGrid" role="status">{usage.alerts.map((alert) => <article className="deployment" key={`${alert.product}:${alert.metric}`}>
          <div className="deploymentTop"><strong>{alert.product} · {alert.metric}</strong><span className={`status ${alert.threshold === 100 ? '' : 'ready'}`}>{alert.threshold}%</span></div>
          <p>{formatted(alert.used)} / {formatted(alert.limit)} ({alert.percent.toFixed(1)}%)</p>
        </article>)}</div>}
    </section>}
    {signedIn && <section className="shell deploymentsSection">
      <div className="sectionHead"><div><span className="kicker">PICOSVC SUITE</span><h2>{messages.common.products}</h2></div></div>
      {!usage ? <div className="empty">{loading ? '…' : t.noData}</div> :
        <div className="deploymentGrid">{usage.products.map((product) => <article className="deployment" key={product.slug}>
          <div className="deploymentTop"><strong>{product.name}</strong><span className="status ready">{product.tier}</span></div>
          {product.dimensions.map((dimension) => <div key={dimension.metric} style={{ marginTop: 16 }}>
            <div className="deploymentTop"><strong>{dimension.metric}</strong><span>{dimension.kind === 'policy' ? t.policy : `${formatted(dimension.used ?? 0)} / ${formatted(dimension.limit)}`}</span></div>
            {dimension.kind === 'policy' ? <p>{t.limit}: {formatted(dimension.limit)}</p> : <>
              <progress style={{ width: '100%' }} value={Math.min(dimension.used ?? 0, dimension.limit)} max={Math.max(1, dimension.limit)} aria-label={`${product.name} ${dimension.metric}`} />
              <p>{t.left}: {formatted(dimension.remaining ?? 0)} · {dimension.percent?.toFixed(1)}% {t.used}</p>
            </>}
          </div>)}
        </article>)}</div>}
    </section>}
  </main>;
}
