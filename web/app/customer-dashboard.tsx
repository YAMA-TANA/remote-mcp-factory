'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { useI18n } from './i18n';
import { CUSTOMER_GUIDES, CUSTOMER_SLUGS, type ProductSlug } from './customer-content';
import { SERVICE_INFO } from './service-data';
import { workspaceApiError } from './workspace-helpers';
import './customer-pages.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type Usage = { product: string; metric: string; quantity: number };
type Entitlement = { product: string; tier: string; active: number | boolean };
type Account = { month: string; usage: Usage[]; entitlements: Entitlement[] };
type Count = number | null;
const COPY = {
  ja: { title:'マイダッシュボード', intro:'PicoSvcの16サービスをひとつの場所で確認。プラン・当月利用量・作成済みリソースから各操作画面へ移動できます。', products:'サービス一覧', docs:'使い方', explanation:'説明', open:'操作画面', refresh:'最新情報に更新', login:'ログインして利用状況を表示', loginBody:'共通アカウントで各サービスのリソースと当月利用量をまとめて確認できます。', noConfig:'この画面の認証またはAPI接続が設定されていません。', loading:'読み込み中…', month:'集計月', resources:'作成済み', requests:'当月利用量', noUsage:'今月の利用記録なし', noResource:'単発実行サービス', unknown:'取得できませんでした', partial:'一部のサービスの件数を取得できませんでした。未取得を0件として扱っていません。', failed:'アカウント情報を取得できませんでした。', free:'Free', totals:'確認できたリソース合計', first:'作成したいサービスを選びましょう。', signedIn:'ログイン中' },
  en: { title:'My dashboard', intro:'Manage 16 PicoSvc services in one place. Check plans, monthly usage and resource counts, then open each workspace.', products:'All services', docs:'How-to', explanation:'Overview', open:'Workspace', refresh:'Refresh', login:'Sign in to see your account', loginBody:'One account shows your resources and monthly usage across services.', noConfig:'Authentication or API connectivity is not configured.', loading:'Loading…', month:'Usage month', resources:'Resources', requests:'Monthly usage', noUsage:'No usage recorded this month', noResource:'Run-on-demand service', unknown:'Unavailable', partial:'Some service counts could not be loaded. Missing data is not reported as zero.', failed:'Could not load your account.', free:'Free', totals:'Verified resource count', first:'Choose a service to create a resource.', signedIn:'Signed in' },
  'zh-CN': { title:'我的服务总览', intro:'在同一位置管理 16 项 PicoSvc 服务，查看套餐、本月用量与资源数量，并进入工作台。', products:'所有服务', docs:'使用指南', explanation:'介绍', open:'工作台', refresh:'刷新', login:'登录以查看账号', loginBody:'用一个账号查看各服务资源与月度用量。', noConfig:'尚未配置身份验证或 API 连接。', loading:'加载中…', month:'统计月份', resources:'资源数', requests:'本月用量', noUsage:'本月无用量记录', noResource:'按需执行的服务', unknown:'无法获取', partial:'部分服务的数量无法获取；未把缺失数据视为零。', failed:'无法加载账号信息。', free:'Free', totals:'已确认资源合计', first:'选择服务并创建资源。', signedIn:'已登录' },
} as const;
const LIST: Partial<Record<ProductSlug, { path: string; key: string }>> = {
  mock: { path:'/api/picosvc/mock/endpoints', key:'endpoints' }, mcp: { path:'/api/servers', key:'servers' },
  hooks: { path:'/api/picosvc/hooks/inboxes', key:'inboxes' }, rss: { path:'/api/picosvc/rss/feeds', key:'feeds' },
  mail: { path:'/api/picosvc/mail/routes', key:'routes' }, qr: { path:'/api/picosvc/qr/links', key:'links' },
  cron: { path:'/api/picosvc/cron/jobs', key:'jobs' }, functions: { path:'/api/picosvc/functions/apps', key:'apps' },
  json: { path:'/api/picosvc/json/stores', key:'stores' }, files: { path:'/api/picosvc/files/spaces', key:'spaces' },
  license: { path:'/api/picosvc/license/projects', key:'projects' }, flags: { path:'/api/picosvc/flags/projects', key:'projects' },
  monitor: { path:'/api/picosvc/monitor', key:'monitors' }, forms: { path:'/api/picosvc/forms', key:'forms' },
};
export const DASHBOARD_LIST = LIST;
function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export default function CustomerDashboard() {
  const { locale, localizedHref } = useI18n();
  const copy = COPY[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [ready, setReady] = useState(!KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [counts, setCounts] = useState<Partial<Record<ProductSlug, Count>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const accountButton = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!KEY) return;
    let active = true;
    let stop: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      stop = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(() => { if (active) { setError(copy.failed); setReady(true); } });
    return () => { active = false; stop?.(); };
  }, [copy.failed]);
  useEffect(() => {
    if (!clerk || !signedIn || !accountButton.current) return;
    const node = accountButton.current;
    clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn]);
  const refresh = useCallback(async () => {
    if (!API || !clerk || !signedIn) return;
    setLoading(true); setError('');
    try {
      const token = await clerk.session?.getToken();
      if (!token) throw new Error(copy.failed);
      const request = async (path: string): Promise<unknown> => {
        const response = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(workspaceApiError(body, response.status, response.headers.get('x-request-id')));
        return body;
      };
      const body = await request('/api/picosvc/account');
      if (!isObject(body) || !Array.isArray(body.usage) || !Array.isArray(body.entitlements) || typeof body.month !== 'string') throw new Error(copy.failed);
      setAccount({ month: body.month, usage: body.usage as Usage[], entitlements: body.entitlements as Entitlement[] });
      const results = await Promise.all(CUSTOMER_SLUGS.map(async service => {
        const cfg = LIST[service];
        if (!cfg) return [service, null] as const;
        try {
          const result = await request(cfg.path);
          const entries: unknown = Array.isArray(result) ? result : isObject(result) ? result[cfg.key] : null;
          return [service, Array.isArray(entries) ? entries.length : null] as const;
        } catch { return [service, null] as const; }
      }));
      setCounts(Object.fromEntries(results) as Partial<Record<ProductSlug, Count>>);
    } catch (reason) {
      setAccount(null); setCounts({});
      setError(reason instanceof Error ? reason.message : copy.failed);
    } finally { setLoading(false); }
  }, [clerk, signedIn, copy.failed]);
  useEffect(() => { if (signedIn && clerk) void refresh(); else { setAccount(null); setCounts({}); } }, [clerk, signedIn, refresh]);
  const known = CUSTOMER_SLUGS.filter(slug => LIST[slug] && typeof counts[slug] === 'number');
  const total = known.reduce((sum, slug) => sum + (counts[slug] || 0), 0);
  const missing = CUSTOMER_SLUGS.some(slug => LIST[slug] && counts[slug] === null);
  return <main className="customerDashboard">
    <nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={localizedHref('/')}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a><div className="customerNavLinks"><a href={localizedHref('/')}>{copy.products}</a><a href={localizedHref('/docs')}>{copy.docs}</a>{signedIn && <div className="customerDashboardUser" ref={accountButton}/>}</div></nav>
    <div className="shell customerBody"><h1>{copy.title}</h1><p>{copy.intro}</p>
      {!KEY || !API ? <p className="customerDashboardNotice" role="alert">{copy.noConfig}</p> : !ready ? <p role="status">{copy.loading}</p> : !signedIn ? <div className="customerDashboardSignIn"><p>{copy.loginBody}</p><button type="button" onClick={() => clerk?.openSignIn()} disabled={!clerk}>{copy.login}</button></div> : <>
        <div className="customerActions"><span>{copy.signedIn}{account ? ` · ${copy.month}: ${account.month} · ${copy.totals}: ${total}` : ''}</span><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? copy.loading : copy.refresh}</button></div>
        {error && <div className="customerDashboardNotice" role="alert">{error}</div>}
        {missing && <p className="customerDashboardStatus" role="status">{copy.partial}</p>}
      </>}
      <div className="customerDashboardGrid">{CUSTOMER_SLUGS.map(service => {
        const guide = CUSTOMER_GUIDES[service];
        const name = SERVICE_INFO[service].name;
        const entitlement = account?.entitlements.find(row => row.product === service && Boolean(row.active));
        const metrics = account?.usage.filter(row => row.product === service) || [];
        return <article key={service}><div className="customerDashboardCardTop"><img src={`/icons/${service}.svg`} width="42" height="42" alt=""/><h2>{name}</h2></div><p>{guide.summary[locale]}</p>{account && <><p><strong>{entitlement?.tier === 'tiny' ? 'Pico' : entitlement?.tier === 'pro' ? 'PicoPlus' : copy.free}</strong> · {copy.resources}: {LIST[service] ? typeof counts[service] === 'number' ? counts[service] : copy.unknown : copy.noResource}</p><p>{copy.requests}: {metrics.length ? metrics.map(row => `${row.metric}: ${Number(row.quantity).toLocaleString()}`).join(' / ') : copy.noUsage}</p></>}
          <div className="customerDashboardCardLinks"><a href={localizedHref(`/${service}/app`)}>{copy.open} →</a><a href={localizedHref(`/${service}`)}>{copy.explanation} ↗</a><a href={localizedHref(`/docs/${service}`)}>{copy.docs} ↗</a></div>
        </article>;
      })}</div>
      {!account && <p className="customerDashboardStatus">{copy.first}</p>}
    </div>
  </main>;
}
