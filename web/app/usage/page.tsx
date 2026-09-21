'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from '../i18n';
import { workspaceApiError } from '../workspace-helpers';
import UsageConsole from './usage-console';
import { readUsageReport, type UsageReport } from './usage-model';

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const COPY = {
  ja: { eyebrow: 'PICOSVC アカウント', title: '利用量・上限の専用管理画面', description: '全16サービスの利用状況と上限を比較し、問題のあるサービスの操作画面へ直接移動できます。', refresh: '最新の利用量を取得', signIn: 'ログインして利用量を見る', noConfig: '認証またはWorker APIの接続設定がありません。', loading: '利用量を取得中…', unavailable: '利用量を取得できませんでした。', month: '集計月', dashboard: '全体ダッシュボード' },
  en: { eyebrow: 'YOUR PICOSVC ACCOUNT', title: 'Dedicated usage management', description: 'Inspect limits across all 16 services and open the workspace for any service needing attention.', refresh: 'Refresh usage', signIn: 'Sign in to view usage', noConfig: 'Authentication or Worker API is not configured.', loading: 'Loading usage…', unavailable: 'Could not load usage.', month: 'Usage month', dashboard: 'All-service dashboard' },
  'zh-CN': { eyebrow: 'PICOSVC 账户', title: '专用用量管理', description: '查看全部 16 项服务的限额，并直接进入需要关注的服务工作台。', refresh: '刷新用量', signIn: '登录后查看用量', noConfig: '尚未配置身份验证或 Worker API。', loading: '正在加载用量…', unavailable: '无法获取用量。', month: '用量月份', dashboard: '全部服务总览' },
} as const;

export default function UsagePage() {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [ready, setReady] = useState(!CLERK_KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userButtonRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let removeListener: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      setReady(true);
      removeListener = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(() => { if (active) { setError(t.unavailable); setReady(true); } });
    return () => { active = false; removeListener?.(); };
  }, [t.unavailable]);

  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    const node = userButtonRef.current;
    clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn]);

  const refresh = useCallback(async () => {
    if (!clerk || !signedIn) return;
    const version = ++requestVersion.current;
    setLoading(true); setError(''); setReport(null);
    try {
      if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
      const token = await clerk.session?.getToken();
      if (!token) throw new Error('Authentication required.');
      const response = await fetch(`${API_URL}/api/picosvc/usage`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
      const validated = readUsageReport(payload);
      if (version === requestVersion.current) setReport(validated);
    } catch (reason) {
      if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [clerk, signedIn]);

  useEffect(() => {
    if (signedIn && clerk) void refresh();
    else { requestVersion.current++; setReport(null); setError(''); setLoading(false); }
    return () => { requestVersion.current++; };
  }, [clerk, signedIn, refresh]);

  return <main>
    <nav className="nav shell" aria-label="PicoSvc"><a className="brand" href={localizedHref('/dashboard/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={localizedHref('/pricing/')}>Pricing</a><LanguageSwitcher />{signedIn ? <div ref={userButtonRef} className="userButton" /> : <button type="button" className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <section className="hero shell"><div className="eyebrow"><span className="dot" /> {t.eyebrow}</div><h1>{t.title}</h1><p className="lede">{t.description}</p>
      {!CLERK_KEY || !API_URL ? <p role="alert" className="error">{t.noConfig}</p> : !ready ? <p role="status">{t.loading}</p> : !signedIn ? <div className="deployCard signinState"><strong>{t.signIn}</strong><button type="button" className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></div> : <div className="deployCard"><div className="sectionHead"><div><span className="kicker">{t.month}</span><h2>{report?.month || '—'}</h2></div><button type="button" className="ghost" disabled={loading} onClick={() => void refresh()}>{loading ? t.loading : t.refresh}</button></div></div>}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
    {signedIn && <section className="shell" aria-live="polite">{report ? <UsageConsole report={report} /> : <div className="empty" role="status">{loading ? t.loading : error ? t.unavailable : t.loading}</div>}</section>}
  </main>;
}
