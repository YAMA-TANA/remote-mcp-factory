'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { SERVICE_INFO, type GenericServiceSlug } from './service-data';
import { SERVICE_UI, initialServiceForm, serviceRequestBody } from './service-ui-config';
import ServiceResourceDetail from './service-resource-detail';
import ServiceAdvancedDetail from './service-advanced-detail';
import {
  workspaceApiError, workspaceIsActive, workspaceIsSecret, workspaceMatches,
  workspaceObject as obj, workspaceString as string, type WorkspaceResource as Resource,
} from './workspace-helpers';
import './service-dashboard.css';
import './workspace-v2.css';

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type ApiResult = { payload: unknown; blob?: Blob };
type Filter = 'all' | 'active' | 'paused';
const BASIC_DETAILS = new Set<GenericServiceSlug>(['json', 'files', 'license', 'flags', 'forms']);
const URL_KEYS = ['endpoint', 'url', 'publicUrl', 'baseUrl', 'validationUrl', 'feedUrl', 'runtimeUrl', 'publicEndpoint', 'webhookUrl', 'redirectUrl', 'mcpUrl'];
const TEXT = {
  en: { back: 'Products', pricing: 'Pricing', title: 'Workspace', resources: 'Your resources', new: 'Create a resource', refresh: 'Refresh', signIn: 'Sign in to PicoSvc', signInBody: 'One account for all PicoSvc services. Sign in to manage your resources.', loading: 'Loading…', created: 'Resource created', output: 'Result', copy: 'Copy', copied: 'Copied', manage: 'Manage', empty: 'You have not created anything yet.', token: 'One-time credential — save it securely now. It cannot be retrieved later.', open: 'Download', retry: 'Retry', noConfig: 'API / Clerk configuration is missing.', enabled: 'Active', disabled: 'Paused', search: 'Search by name, URL, or ID', all: 'All', active: 'Active', paused: 'Paused', count: 'shown', clear: 'Clear search', hide: 'Hide', show: 'Reveal', dismiss: 'Dismiss', failed: 'The operation failed', loadFailed: 'Could not load resources', ready: 'Ready', unavailable: 'Unavailable' },
  ja: { back: '全サービス', pricing: '料金', title: 'ワークスペース', resources: '作成済みリソース', new: '新規リソース', refresh: '更新', signIn: 'PicoSvcにログイン', signInBody: 'すべてのサービスで共通のアカウントを使用します。ログインするとリソースを管理できます。', loading: '読み込み中…', created: '作成しました', output: '実行結果', copy: 'コピー', copied: 'コピーしました', manage: '管理・編集', empty: 'まだリソースがありません。', token: '認証情報は今回だけ表示されます。今すぐ安全な場所に保存してください。', open: 'ダウンロード', retry: '再試行', noConfig: 'API / Clerkの環境変数が未設定です。', enabled: '稼働中', disabled: '停止中', search: '名前・URL・IDで検索', all: 'すべて', active: '稼働中', paused: '停止中', count: '件表示', clear: '検索を解除', hide: '隠す', show: '表示', dismiss: '閉じる', failed: '操作に失敗しました', loadFailed: '一覧を取得できませんでした', ready: '利用可能', unavailable: '利用不可' },
  'zh-CN': { back: '所有服务', pricing: '价格', title: '工作台', resources: '我的资源', new: '新建资源', refresh: '刷新', signIn: '登录 PicoSvc', signInBody: '所有服务共用一个账号。登录后即可管理资源。', loading: '加载中…', created: '创建成功', output: '运行结果', copy: '复制', copied: '已复制', manage: '管理 / 编辑', empty: '尚无资源。', token: '凭证只显示一次，请立即安全保存。', open: '下载', retry: '重试', noConfig: '未配置 API / Clerk。', enabled: '运行中', disabled: '已暂停', search: '搜索名称、URL 或 ID', all: '全部', active: '运行中', paused: '已暂停', count: '条结果', clear: '清除搜索', hide: '隐藏', show: '显示', dismiss: '关闭', failed: '操作失败', loadFailed: '无法加载资源', ready: '可用', unavailable: '不可用' },
} as const;

function errorText(value: unknown): string { return value instanceof Error ? value.message : String(value); }
function displayName(item: Resource, index: number): string {
  return string(item.name || item.label || item.repo_url || item.repoUrl || item.source_url || item.sourceUrl || item.id || `Resource ${index + 1}`);
}
function links(item: Resource, service: GenericServiceSlug): { label: string; url: string }[] {
  const found: { label: string; url: string }[] = [];
  for (const key of URL_KEYS) {
    const value = item[key];
    if (typeof value !== 'string') continue;
    try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') found.push({ label: key, url: value }); }
    catch { /* Not an absolute web URL. */ }
  }
  if (service === 'qr' && API_URL && typeof item.public_id === 'string') {
    found.push({ label: 'redirect', url: `${API_URL}/q/${item.public_id}` });
    found.push({ label: 'QR SVG', url: `${API_URL}/q/${item.public_id}.svg` });
  }
  return found;
}

export default function ServiceDashboard({ service }: { service: GenericServiceSlug }) {
  const { locale, messages, localizedHref } = useI18n();
  const t = TEXT[locale];
  const config = SERVICE_UI[service];
  const info = SERVICE_INFO[service];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [authReady, setAuthReady] = useState(!CLERK_KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => initialServiceForm(service));
  const [data, setData] = useState<Resource | null>(null);
  const [items, setItems] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorAction, setErrorAction] = useState<'refresh' | 'create'>('refresh');
  const [created, setCreated] = useState<Resource | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<unknown>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadType, setDownloadType] = useState('');
  const [copied, setCopied] = useState('');
  const accountRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setAuthReady(true);
      unsubscribe = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (active) { setError(errorText(reason)); setAuthReady(true); } });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !accountRef.current) return;
    const node = accountRef.current;
    clerk.mountUserButton(node);
    return () => { clerk.unmountUserButton(node); };
  }, [clerk, signedIn]);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  const api = useCallback(async (path: string, init: RequestInit = {}): Promise<ApiResult> => {
    if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    if (!path.startsWith('/api/picosvc/') && path !== '/api/servers' && !path.startsWith('/api/servers/')) throw new Error('Invalid API route.');
    const token = await clerk?.session?.getToken();
    if (!token) throw new Error('Session expired. Please sign in again.');
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && (contentType.startsWith('image/') || contentType.includes('application/pdf') || contentType.includes('application/octet-stream'))) {
      return { payload: { status: response.status, contentType }, blob: await response.blob() };
    }
    const raw = await response.text();
    let payload: unknown = raw;
    if (raw && (contentType.includes('json') || raw.startsWith('{') || raw.startsWith('['))) {
      try { payload = JSON.parse(raw) as unknown; } catch { /* Preserve malformed responses for diagnostics. */ }
    }
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return { payload };
  }, [clerk]);
  const refresh = useCallback(async () => {
    if (!signedIn || !config.listPath) return;
    setLoading(true); setError(''); setErrorAction('refresh');
    try {
      const payload = (await api(config.listPath)).payload;
      const record = obj(payload);
      const entries = Array.isArray(payload) ? payload : record?.[config.collection || ''];
      if (!Array.isArray(entries)) throw new Error(`Unexpected API response: ${config.collection || 'resources'} was not an array.`);
      const current = entries.filter((entry): entry is Resource => obj(entry) !== null);
      setData(record); setItems(current);
      setSelected(previous => previous ? current.find(item => string(item.id) === string(previous.id)) || null : null);
    } catch (reason) { setError(errorText(reason)); setErrorAction('refresh'); }
    finally { setLoading(false); }
  }, [api, config.listPath, config.collection, signedIn]);
  useEffect(() => {
    if (signedIn && clerk) void refresh();
    else { setItems([]); setData(null); setSelected(null); setCreated(null); setRevealed({}); }
  }, [clerk, signedIn, refresh]);

  async function copyValue(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch (reason) { setError(errorText(reason)); setErrorAction('refresh'); }
  }
  async function create() {
    if (busy) return;
    setBusy(true); setError(''); setCreated(null); setRevealed({}); setResult(null); setDownloadUrl(null);
    try {
      const body = serviceRequestBody(service, form);
      const response = await api(config.createPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.blob) {
        setDownloadUrl(URL.createObjectURL(response.blob)); setDownloadType(response.blob.type); setResult(response.payload);
      } else if (config.listPath) {
        setCreated(obj(response.payload) || { result: response.payload });
        await refresh();
      } else setResult(response.payload);
    } catch (reason) { setError(errorText(reason)); setErrorAction('create'); }
    finally { setBusy(false); }
  }

  const limitKey = service === 'hooks' ? 'inboxLimit' : service === 'files' ? 'spaceLimit' : 'limit';
  const limit = data && typeof data[limitKey] === 'number' ? data[limitKey] as number : null;
  const tier = string(data?.tier || 'free');
  const activeCount = items.filter(workspaceIsActive).length;
  const filtered = items.filter(item => workspaceMatches(item, search) && (filter === 'all' || (filter === 'active' ? workspaceIsActive(item) : !workspaceIsActive(item))));
  const basic = BASIC_DETAILS.has(service);

  return <main className="servicePage">
    <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{t.back}</a><a href={localizedHref('/pricing')}>{t.pricing}</a><a href={localizedHref('/contact')}>{messages.common.contact}</a><LanguageSwitcher />{signedIn ? <div className="userButton" ref={accountRef} /> : <button className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <section className="hero shell serviceHero"><div className="eyebrow"><span className="dot" /> PicoSvc / {info.name}</div><h1>{config.title}</h1><p className="lede">{config.description}</p><div className="flow"><span>{t.title}</span><i>→</i><span>{t.resources}</span><i>→</i><span>{t.manage}</span></div></section>
    {!API_URL || !CLERK_KEY ? <div className="shell notice" role="alert">{t.noConfig}</div> : null}
    {!authReady ? <section className="shell deploymentsSection" role="status"><div className="deployCard signinState">{t.loading}</div></section> : !signedIn ? <section className="shell deploymentsSection"><div className="deployCard signinState"><div><strong>{t.signIn}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div>{error && <div className="error" role="alert">{error}</div>}</section> :
      <section className="shell serviceWorkspace">
        {error && <div className="error serviceGlobalError" role="alert"><div><strong>{errorAction === 'create' ? t.failed : t.loadFailed}</strong><p>{error}</p></div><button className="ghost" type="button" disabled={busy || loading} onClick={() => { setError(''); if (errorAction === 'create') void create(); else void refresh(); }}>{t.retry}</button></div>}
        <div className="serviceColumns"><section className="deployCard serviceCreate" aria-label={t.new}><div className="sectionHead"><div><span className="kicker">PICOSVC / {info.name.toUpperCase()}</span><h2>{t.new}</h2></div></div>
          <form onSubmit={event => { event.preventDefault(); void create(); }}>
            {config.fields.map(field => <label className="serviceField" key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span>
              {field.kind === 'select' ? <select value={form[field.key] || ''} onChange={event => setForm(old => ({ ...old, [field.key]: event.target.value }))}>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select> : field.kind === 'checkbox' ? <span className="serviceCheck"><input type="checkbox" checked={form[field.key] === 'true'} onChange={event => setForm(old => ({ ...old, [field.key]: String(event.target.checked) }))} />{field.label}</span> : field.kind === 'code' || field.kind === 'json' ? <textarea rows={field.kind === 'code' ? 8 : 5} required={field.required} spellCheck={false} value={form[field.key] || ''} placeholder={field.placeholder} onChange={event => setForm(old => ({ ...old, [field.key]: event.target.value }))} /> : <input type={field.kind === 'number' ? 'number' : field.kind === 'url' ? 'url' : 'text'} required={field.required} inputMode={field.kind === 'number' ? 'numeric' : undefined} min={field.kind === 'number' && field.key === 'intervalMinutes' ? 5 : undefined} max={field.kind === 'number' && field.key === 'intervalMinutes' ? 10080 : undefined} step={field.kind === 'number' ? 1 : undefined} value={form[field.key] || ''} placeholder={field.placeholder} onChange={event => setForm(old => ({ ...old, [field.key]: event.target.value }))} />}
              {field.help && <small>{field.help}</small>}
            </label>)}
            <button className="primary serviceSubmit" disabled={busy || !clerk?.session} type="submit">{busy ? t.loading : config.createLabel}</button>
          </form>
          {created && <div className="success serviceOutput" role="status"><div className="serviceOutputTitle"><strong>{t.created}</strong><button className="ghost" type="button" onClick={() => { setCreated(null); setRevealed({}); }}>{t.dismiss}</button></div>{Object.entries(created).map(([key, value]) => {
            if (value === undefined || value === null || typeof value === 'object' || key === 'tier') return null;
            const text = string(value);
            if (!text) return null;
            const secret = workspaceIsSecret(key);
            return <div className={`serviceOutputRow ${secret ? 'serviceSecretRow' : ''}`} key={key}><span>{key}{secret ? ` — ${t.token}` : ''}</span><code>{secret && !revealed[key] ? '••••••••••••••••' : text}</code>{secret && <button className="ghost" type="button" aria-pressed={Boolean(revealed[key])} onClick={() => setRevealed(old => ({ ...old, [key]: !old[key] }))}>{revealed[key] ? t.hide : t.show}</button>}<button className="ghost" type="button" onClick={() => { void copyValue(text); }}>{copied === text ? t.copied : t.copy}</button></div>;
          })}</div>}
          {(result !== null || downloadUrl) && <div className="serviceOutput" role="status"><div className="serviceOutputTitle"><strong>{t.output}</strong><button className="ghost" type="button" onClick={() => { setResult(null); setDownloadUrl(null); }}>{t.dismiss}</button></div>{downloadUrl && <><a className="primary serviceDownload" href={downloadUrl} download={downloadType.includes('pdf') ? 'capture.pdf' : 'capture.png'}>{t.open}</a>{downloadType.startsWith('image/') && <img className="servicePreview" src={downloadUrl} alt="Capture preview" />}</>}{result !== null && <pre>{string(result)}</pre>}</div>}
        </section>
        {config.listPath && <section className="serviceInventory" aria-label={t.resources}><div className="sectionHead"><div><span className="kicker">{tier.toUpperCase()}{limit !== null ? ` · ${items.length} / ${limit}` : ''}</span><h2>{t.resources}</h2></div><button className="ghost" type="button" disabled={loading} onClick={() => { void refresh(); }}>{loading ? t.loading : t.refresh}</button></div>
          <div className="serviceInventoryTools"><label className="serviceSearch"><span className="srOnly">{t.search}</span><input type="search" value={search} placeholder={t.search} onChange={event => setSearch(event.target.value)} /></label>{search && <button type="button" className="ghost" onClick={() => setSearch('')}>{t.clear}</button>}</div>
          <div className="serviceStatusFilters" role="group" aria-label={t.resources}><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t.all} <span>{items.length}</span></button><button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>{t.active} <span>{activeCount}</span></button><button type="button" aria-pressed={filter === 'paused'} onClick={() => setFilter('paused')}>{t.paused} <span>{items.length - activeCount}</span></button></div>
          <p className="serviceResultCount" role="status">{filtered.length} {t.count}</p>
          {loading && !data && items.length === 0 ? <p className="empty" role="status">{t.loading}</p> : items.length === 0 ? <div className="empty">{config.empty || t.empty}</div> : filtered.length === 0 ? <div className="empty">{locale === 'ja' ? '検索・絞り込みに一致するリソースはありません。' : locale === 'zh-CN' ? '没有匹配的资源。' : 'No matching resources.'}<button className="ghost" type="button" onClick={() => { setSearch(''); setFilter('all'); }}>{t.clear}</button></div> : <div className="serviceResourceList">{filtered.map((item, index) => {
            const id = string(item.id || index); const urls = links(item, service); const active = workspaceIsActive(item);
            return <article className={`deployment serviceResource ${selected?.id === item.id ? 'serviceResourceSelected' : ''}`} key={id}><div className="deploymentTop"><div><strong>{displayName(item, index)}</strong><p>{string(item.status || item.created_at || item.createdAt || '')}</p></div><span className={`status ${active ? 'ready' : ''}`}>{active ? t.enabled : t.disabled}</span></div>
              {urls.slice(0, 3).map(link => <div className="serviceResourceLink" key={link.label}><span>{link.label}</span><code>{link.url}</code><button type="button" className="ghost" onClick={() => { void copyValue(link.url); }}>{copied === link.url ? t.copied : t.copy}</button>{link.url.startsWith('https://') && <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${t.open}: ${link.label}`}>↗</a>}</div>)}
              <div className="deploymentBottom"><code>{string(item.public_id || item.publicId || item.id)}</code><button type="button" className="secondary" aria-expanded={selected?.id === item.id} onClick={() => { setSelected(item); requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{t.manage} →</button></div>
            </article>;
          })}</div>}
        </section>}
        </div>
        {selected && <div id="picosvc-resource-detail" ref={detailRef} className="serviceDetailAnchor">{basic ? <ServiceResourceDetail key={`${service}:${string(selected.id)}`} service={service} resource={selected} api={api} onClose={() => setSelected(null)} onChanged={() => { void refresh(); }} copyValue={copyValue} /> : <ServiceAdvancedDetail key={`${service}:${string(selected.id)}`} service={service} resource={selected} api={api} onClose={() => setSelected(null)} onChanged={() => { void refresh(); }} copyValue={copyValue} />}</div>}
      </section>}
  </main>;
}
