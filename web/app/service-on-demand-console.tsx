'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { workspaceApiError } from './workspace-helpers';
import './service-fleet-console.css';
import './service-on-demand-console.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type Service = 'fetch' | 'shot';
type Usage = { product: string; metric: string; quantity: number };
type Entitlement = { product: string; tier: string; active: number | boolean };
type Account = { month: string; usage: Usage[]; entitlements: Entitlement[] };
type ShotKey = { id: string; name: string; created_at: string; last_used_at: string | null };
const WORDS = {
  ja: { dashboard: '全体ダッシュボード', workspace: '実行画面へ', usage: '利用量・上限', refresh: '最新情報に更新', loading: '読み込み中…', signIn: 'ログインして管理画面を開く', config: '認証またはWorker APIが未設定です。', error: '管理情報を取得できませんでした。', month: '集計月', plan: '現在のプラン', free: 'Free', monthly: '今月の利用量', none: '今月の利用記録はありません。', stateless: 'このサービスは単発実行型です。保存済みジョブや過去の取得内容を一覧にするAPIはありません。実行と結果の保存は操作画面から行ってください。', fetchTitle: 'Fetch 利用管理', shotTitle: 'Shot 利用・APIキー管理', fetchIntro: 'URL抽出の当月利用量とプランを確認し、抽出画面へ移動できます。', shotIntro: '撮影の当月利用量とプランに加え、Shot専用APIキーを発行・失効できます。', keys: 'Shot専用APIキー', keyIntro: '発行したキーは一度しか表示されません。公開リポジトリやブラウザのコードに含めないでください。', keyName: 'キー名', create: 'キーを発行', working: '処理中…', noKeys: 'APIキーはまだありません。', lastUsed: '最終利用', never: '未使用', revoke: '失効させる', revokeConfirm: 'このAPIキーを失効させますか？失効後は元に戻せません。', created: 'APIキーを発行しました。安全な場所に保存してください。', revoked: 'APIキーを失効させました。', oneTime: 'このキーは再表示できません。今すぐ保存してください。', copy: 'キーをコピー', copied: 'コピーしました', dismiss: 'キーの表示を閉じる', failedCopy: 'コピーできませんでした。', noAccount: 'プランと利用量はまだ取得できていません。' },
  en: { dashboard: 'All-service dashboard', workspace: 'Open workspace', usage: 'Usage & limits', refresh: 'Refresh', loading: 'Loading…', signIn: 'Sign in to manage this service', config: 'Authentication or Worker API is not configured.', error: 'Could not load management data.', month: 'Usage month', plan: 'Current plan', free: 'Free', monthly: 'Monthly usage', none: 'No usage recorded this month.', stateless: 'This service runs on demand. There is no API for a saved-job inventory or past result contents. Run requests and save their results in the workspace.', fetchTitle: 'Fetch usage management', shotTitle: 'Shot usage & API key management', fetchIntro: 'Inspect your monthly extraction usage and plan, then open the extraction workspace.', shotIntro: 'Inspect monthly capture usage and plan, and manage Shot-only API keys.', keys: 'Shot-only API keys', keyIntro: 'A new key is shown only once. Never place keys in public repositories or browser code.', keyName: 'Key name', create: 'Create API key', working: 'Working…', noKeys: 'No API keys yet.', lastUsed: 'Last used', never: 'Never', revoke: 'Revoke', revokeConfirm: 'Revoke this API key? This cannot be undone.', created: 'API key created. Save it securely.', revoked: 'API key revoked.', oneTime: 'This key will not be shown again. Save it now.', copy: 'Copy key', copied: 'Copied', dismiss: 'Dismiss key', failedCopy: 'Could not copy the key.', noAccount: 'Plan and usage have not been loaded yet.' },
  'zh-CN': { dashboard: '全部服务总览', workspace: '打开工作台', usage: '用量与限额', refresh: '刷新', loading: '加载中…', signIn: '登录后管理服务', config: '身份验证或 Worker API 未配置。', error: '无法获取管理信息。', month: '统计月份', plan: '当前套餐', free: 'Free', monthly: '本月用量', none: '本月暂无使用记录。', stateless: '本服务按需运行，没有用于查询已保存任务或历史结果内容的 API。请在工作台执行请求并保存结果。', fetchTitle: 'Fetch 用量管理', shotTitle: 'Shot 用量与 API 密钥管理', fetchIntro: '查看本月提取用量与套餐，并打开提取工作台。', shotIntro: '查看本月截图用量、套餐和 Shot 专用 API 密钥。', keys: 'Shot 专用 API 密钥', keyIntro: '新密钥仅显示一次，不要写入公开仓库或浏览器代码。', keyName: '密钥名称', create: '创建 API 密钥', working: '处理中…', noKeys: '尚无 API 密钥。', lastUsed: '最后使用', never: '从未使用', revoke: '撤销', revokeConfirm: '撤销此 API 密钥？此操作无法撤销。', created: '已创建 API 密钥，请安全保存。', revoked: '已撤销 API 密钥。', oneTime: '此密钥不会再次显示，请立即保存。', copy: '复制密钥', copied: '已复制', dismiss: '关闭密钥显示', failedCopy: '复制密钥失败。', noAccount: '尚未获取套餐和用量。' },
} as const;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function accountPayload(value: unknown): Account {
  if (!object(value) || typeof value.month !== 'string' || !Array.isArray(value.usage) || !Array.isArray(value.entitlements)) throw new Error('Invalid account response.');
  return { month: value.month, usage: value.usage.filter((row): row is Usage => object(row) && typeof row.product === 'string' && typeof row.metric === 'string' && typeof row.quantity === 'number' && Number.isFinite(row.quantity)), entitlements: value.entitlements.filter((row): row is Entitlement => object(row) && typeof row.product === 'string' && typeof row.tier === 'string' && (typeof row.active === 'number' || typeof row.active === 'boolean')) };
}
function shotKeyPayload(value: unknown): ShotKey[] {
  if (!object(value) || !Array.isArray(value.keys)) throw new Error('Invalid Shot key response.');
  return value.keys.filter((row): row is ShotKey => object(row) && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.created_at === 'string' && (row.last_used_at === null || typeof row.last_used_at === 'string'));
}

export default function ServiceOnDemandConsole({ service }: { service: Service }) {
  const { locale, localizedHref, messages } = useI18n();
  const t = WORDS[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [ready, setReady] = useState(!KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  const [keys, setKeys] = useState<ShotKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [keyName, setKeyName] = useState('My automation');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const accountNode = useRef<HTMLDivElement>(null);
  const version = useRef(0);

  useEffect(() => {
    if (!KEY) return;
    let mounted = true;
    let stop: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(KEY);
      await instance.load({ ui });
      if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      stop = instance.addListener(() => {
        if (!mounted) return;
        version.current++;
        setAccount(null); setKeys([]); setNewKey(''); setCopied(false); setNotice(''); setError('');
        setSignedIn(Boolean(instance.isSignedIn)); setAuthRevision(n => n + 1);
      });
    }).catch(() => { if (mounted) { setReady(true); setError(t.error); } });
    return () => { mounted = false; stop?.(); version.current++; };
  }, [t.error]);
  useEffect(() => {
    if (!clerk || !signedIn || !accountNode.current) return;
    const node = accountNode.current;
    clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn]);
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    if (!API || !clerk?.isSignedIn) throw new Error(t.config);
    const token = await clerk.session?.getToken();
    if (!token) throw new Error(t.signIn);
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, redirect: 'error', cache: 'no-store' });
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return payload;
  }, [clerk, t.config, t.signIn]);
  const refresh = useCallback(async () => {
    if (!signedIn || !clerk) return;
    const current = ++version.current;
    setLoading(true); setError('');
    try {
      const data = accountPayload(await request('/api/picosvc/account'));
      if (current !== version.current) return;
      setAccount(data);
      if (service === 'shot') {
        const activeKeys = shotKeyPayload(await request('/api/picosvc/shot/keys'));
        if (current === version.current) setKeys(activeKeys);
      }
    } catch (reason) {
      if (current === version.current) setError(reason instanceof Error ? reason.message : t.error);
    } finally { if (current === version.current) setLoading(false); }
  }, [clerk, request, service, signedIn, t.error]);
  useEffect(() => {
    if (signedIn && clerk) void refresh();
    else { version.current++; setAccount(null); setKeys([]); setNewKey(''); setLoading(false); }
    return () => { version.current++; };
  }, [clerk, signedIn, authRevision, refresh]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (service !== 'shot' || busy || !keyName.trim()) return;
    const current = version.current;
    setBusy(true); setError(''); setNotice(''); setNewKey(''); setCopied(false);
    try {
      const payload = await request('/api/picosvc/shot/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: keyName.trim() }) });
      if (!object(payload) || typeof payload.token !== 'string' || !payload.token) throw new Error('The API did not return a key.');
      if (current !== version.current) return;
      setNewKey(payload.token);
      setNotice(t.created);
      await refresh();
    } catch (reason) { if (current === version.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { if (current === version.current) setBusy(false); }
  }
  async function revokeKey(key: ShotKey) {
    if (service !== 'shot' || busy || !window.confirm(`${t.revokeConfirm}\n${key.name}`)) return;
    const current = version.current;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/picosvc/shot/keys/${encodeURIComponent(key.id)}`, { method: 'DELETE' });
      if (current !== version.current) return;
      await refresh();
      setNotice(t.revoked);
    } catch (reason) { if (current === version.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { if (current === version.current) setBusy(false); }
  }
  async function copyKey() {
    try { await navigator.clipboard.writeText(newKey); setCopied(true); }
    catch { setError(t.failedCopy); }
  }
  const metrics = account?.usage.filter(item => item.product === service) || [];
  const entitlement = account?.entitlements.find(item => item.product === service && Boolean(item.active));
  const plan = entitlement?.tier === 'tiny' ? 'Pico' : entitlement?.tier === 'pro' ? 'PicoPlus' : entitlement?.tier || t.free;
  const title = service === 'shot' ? t.shotTitle : t.fetchTitle;
  return <main className="fleetConsole">
    <nav className="customerNav shell" aria-label="PicoSvc">
      <a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt="" />PicoSvc</a>
      <div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={localizedHref(`/${service}/app/`)}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher />{signedIn ? <div ref={accountNode} /> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div>
    </nav>
    <div className="shell fleetBody onDemandBody">
      <header className="fleetHero"><span>PICOSVC / {service.toUpperCase()} / MANAGEMENT</span><h1>{title}</h1><p>{service === 'shot' ? t.shotIntro : t.fetchIntro}</p></header>
      {!API || !KEY ? <p className="fleetError" role="alert">{t.config}</p> : !ready ? <p role="status">{t.loading}</p> : !signedIn ? <section className="fleetPanel"><p>{t.signIn}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <>
        <div className="onDemandActions"><button type="button" disabled={loading || busy} onClick={() => void refresh()}>{loading ? t.loading : t.refresh}</button><a href={localizedHref(`/${service}/app/`)}>{t.workspace} →</a></div>
        {error && <p className="fleetError" role="alert">{error}</p>}{notice && <p className="fleetNotice" role="status">{notice}</p>}
        <div className="onDemandGrid"><section className="fleetPanel"><h2>{t.plan}</h2><p className="onDemandValue">{account ? plan : t.noAccount}</p><p>{t.month}: {account?.month || '—'}</p></section><section className="fleetPanel"><h2>{t.monthly}</h2>{metrics.length ? <dl className="onDemandMetrics">{metrics.map((item, index) => <div key={`${item.metric}-${index}`}><dt>{item.metric}</dt><dd>{item.quantity.toLocaleString()}</dd></div>)}</dl> : <p>{account ? t.none : t.noAccount}</p>}</section></div>
        <p className="onDemandInfo">{t.stateless}</p>
        {service === 'shot' && <section className="fleetPanel onDemandKeys"><h2>{t.keys}</h2><p>{t.keyIntro}</p><form onSubmit={event => void createKey(event)}><label htmlFor="on-demand-key-name">{t.keyName}</label><div className="onDemandKeyForm"><input id="on-demand-key-name" value={keyName} required maxLength={80} onChange={event => setKeyName(event.target.value)} /><button type="submit" disabled={loading || busy || !keyName.trim()}>{busy ? t.working : t.create}</button></div></form>
          {newKey && <div className="onDemandSecret" role="status"><strong>{t.oneTime}</strong><code>{newKey}</code><div><button type="button" onClick={() => void copyKey()}>{copied ? t.copied : t.copy}</button><button type="button" onClick={() => { setNewKey(''); setCopied(false); }}>{t.dismiss}</button></div></div>}
          {!keys.length ? <p>{loading ? t.loading : t.noKeys}</p> : <ul className="onDemandKeyList">{keys.map(key => <li key={key.id}><div><strong>{key.name}</strong><small>{t.lastUsed}: {key.last_used_at ? new Date(key.last_used_at).toLocaleString(locale) : t.never}</small></div><button type="button" disabled={loading || busy} onClick={() => void revokeKey(key)}>{t.revoke}</button></li>)}</ul>}
        </section>}
      </>}
    </div>
  </main>;
}
