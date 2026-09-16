'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { SERVICE_INFO, type GenericServiceSlug } from './service-data';
import { SERVICE_UI, initialServiceForm, serviceRequestBody } from './service-ui-config';
import ServiceResourceDetail from './service-resource-detail';
import ServiceAdvancedDetail from './service-advanced-detail';
import './service-dashboard.css';

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type Resource = Record<string, unknown>;
type ApiResult = { payload: unknown; blob?: Blob };
const BASIC_DETAILS = new Set<GenericServiceSlug>(['json', 'files', 'license', 'flags', 'forms']);
const SECRETS = new Set(['bearerToken', 'licenseKey', 'token', 'apiKey', 'secret']);
const URL_KEYS = ['endpoint', 'url', 'publicUrl', 'baseUrl', 'validationUrl', 'feedUrl', 'runtimeUrl', 'publicEndpoint', 'webhookUrl', 'redirectUrl', 'mcpUrl'];
const TEXT = {
  en: { back: 'Products', pricing: 'Pricing', title: 'Workspace', resources: 'Your resources', new: 'Create a resource', refresh: 'Refresh', signIn: 'Sign in to PicoSvc', signInBody: 'One account for all PicoSvc services. Sign in to manage your resources.', loading: 'Loading…', save: 'Create', created: 'Resource created', output: 'Result', copy: 'Copy', copied: 'Copied', manage: 'Manage', empty: 'You have not created anything yet.', token: 'One-time credential — save it securely now. It cannot be retrieved later.', open: 'Open', retry: 'Retry', noConfig: 'API / Clerk configuration is missing.', enabled: 'Active', disabled: 'Paused', search: 'Search resources', all: 'All resources', ready: 'Ready', unavailable: 'Unavailable' },
  ja: { back: '全サービス', pricing: '料金', title: 'ワークスペース', resources: '作成済みリソース', new: '新規リソース', refresh: '更新', signIn: 'PicoSvcにログイン', signInBody: 'すべてのサービスで共通のアカウントを使用します。ログインするとリソースを管理できます。', loading: '読み込み中…', save: '作成', created: '作成しました', output: '実行結果', copy: 'コピー', copied: 'コピーしました', manage: '管理・編集', empty: 'まだリソースがありません。', token: '認証情報は今回だけ表示されます。今すぐ安全な場所に保存してください。', open: '開く', retry: '再試行', noConfig: 'API / Clerkの環境変数が未設定です。', enabled: '稼働中', disabled: '停止中', search: '名前・URL・IDで検索', all: 'すべて', ready: '利用可能', unavailable: '利用不可' },
  'zh-CN': { back: '所有服务', pricing: '价格', title: '工作台', resources: '我的资源', new: '新建资源', refresh: '刷新', signIn: '登录 PicoSvc', signInBody: '所有服务共用一个账号。登录后即可管理资源。', loading: '加载中…', save: '创建', created: '创建成功', output: '运行结果', copy: '复制', copied: '已复制', manage: '管理 / 编辑', empty: '尚无资源。', token: '凭证只显示一次，请立即安全保存。', open: '打开', retry: '重试', noConfig: '未配置 API / Clerk。', enabled: '运行中', disabled: '已暂停', search: '搜索名称、URL 或 ID', all: '全部', ready: '可用', unavailable: '不可用' },
} as const;
function obj(value: unknown): Resource | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Resource : null; }
function string(value: unknown): string { return value === null || value === undefined ? '' : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value); }
function errorText(value: unknown): string { return value instanceof Error ? value.message : String(value); }
function displayName(item: Resource, index: number) { return string(item.name || item.label || item.repo_url || item.repoUrl || item.source_url || item.sourceUrl || item.id || `Resource ${index + 1}`); }
function links(item: Resource, service: GenericServiceSlug): { label: string; url: string }[] {
  const found: { label: string; url: string }[] = [];
  for (const key of URL_KEYS) {
    const value = item[key];
    if (typeof value !== 'string') continue;
    try { const parsed = new URL(value); if (parsed.protocol === 'https:' || parsed.protocol === 'http:') found.push({ label: key, url: value }); } catch { /* not a public URL */ }
  }
  if (service === 'qr' && API_URL && typeof item.public_id === 'string') {
    found.push({ label: 'redirect', url: `${API_URL}/q/${item.public_id}` }, { label: 'QR SVG', url: `${API_URL}/q/${item.public_id}.svg` });
  }
  return found;
}
function isActive(item: Resource) { return item.enabled !== false && item.enabled !== 0 && item.enabled !== '0' && !['error', 'failed', 'disabled'].includes(string(item.status).toLowerCase()); }

export default function ServiceDashboard({ service }: { service: GenericServiceSlug }) {
  const { locale, messages, localizedHref } = useI18n();
  const t = TEXT[locale];
  const config = SERVICE_UI[service];
  const info = SERVICE_INFO[service];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => initialServiceForm(service));
  const [data, setData] = useState<Resource | null>(null);
  const [items, setItems] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Resource | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadType, setDownloadType] = useState('');
  const [copied, setCopied] = useState('');
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn));
      unsubscribe = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (active) setError(errorText(reason)); });
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
      try { payload = JSON.parse(raw) as unknown; } catch { /* preserve text */ }
    }
    if (!response.ok) {
      const item = obj(payload);
      throw new Error(typeof item?.error === 'string' ? item.error : typeof item?.message === 'string' ? item.message : `HTTP ${response.status}: ${raw.slice(0, 300)}`);
    }
    return { payload };
  }, [clerk]);
  const refresh = useCallback(async () => {
    if (!signedIn || !config.listPath) return;
    setLoading(true); setError('');
    try {
      const payload = (await api(config.listPath)).payload;
      const record = obj(payload);
      const entries = Array.isArray(payload) ? payload : record?.[config.collection || ''];
      if (!Array.isArray(entries)) throw new Error(`Unexpected API response: ${config.collection || 'resources'} was not an array.`);
      setData(record);
      setItems(entries.filter((entry): entry is Resource => obj(entry) !== null));
    } catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, [api, config.listPath, config.collection, signedIn]);
  useEffect(() => {
    if (signedIn && clerk) void refresh();
    else { setItems([]); setData(null); setSelected(null); setCreated(null); }
  }, [clerk, signedIn, refresh]);

  async function copyValue(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); } catch (reason) { setError(errorText(reason)); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setCreated(null); setResult(null); setDownloadUrl(null);
    try {
      const request = serviceRequestBody(service, form);
      const response = await api(config.createPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
      if (response.blob) {
        setDownloadUrl(URL.createObjectURL(response.blob)); setDownloadType(response.blob.type); setResult(response.payload);
      } else if (config.listPath) {
        setCreated(obj(response.payload) || { result: response.payload });
        await refresh();
      } else setResult(response.payload);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  const limitKey = service === 'hooks' ? 'inboxLimit' : service === 'files' ? 'spaceLimit' : 'limit';
  const limit = data && typeof data[limitKey] === 'number' ? data[limitKey] as number : null;
  const tier = string(data?.tier || 'free');
  const filtered = items.filter(item => !search.trim() || Object.entries(item).some(([key, value]) => !/token|secret|password|hash|headers|body|code/i.test(key) && typeof value === 'string' && value.toLowerCase().includes(search.trim().toLowerCase())));
  const basic = BASIC_DETAILS.has(service);

  return <main className="servicePage">
    <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{t.back}</a><a href={localizedHref('/pricing')}>{t.pricing}</a><a href={localizedHref('/contact')}>{messages.common.contact}</a><LanguageSwitcher />{signedIn ? <div className="userButton" ref={accountRef} /> : <button className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <section className="hero shell serviceHero"><div className="eyebrow"><span className="dot" /> PicoSvc / {info.name}</div><h1>{config.title}</h1><p className="lede">{config.description}</p><div className="flow"><span>{t.title}</span><i>→</i><span>{t.resources}</span><i>→</i><span>{t.manage}</span></div></section>
    {!API_URL || !CLERK_KEY ? <div className="shell notice" role="alert">{t.noConfig}</div> : null}
    {!signedIn ? <section className="shell deploymentsSection"><div className="deployCard signinState"><div><strong>{t.signIn}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div>{error && <div className="error" role="alert">{error}</div>}</section> :
      <section className="shell serviceWorkspace">
        {error && <div className="error serviceGlobalError" role="alert"><span>{error}</span><button className="ghost" type="button" onClick={() => { setError(''); void refresh(); }}>{t.retry}</button></div>}
        <div className="serviceColumns"><section className="deployCard serviceCreate" aria-label={t.new}><div className="sectionHead"><div><span className="kicker">PICOSVC / {info.name.toUpperCase()}</span><h2>{t.new}</h2></div></div>
          <form onSubmit={event => { void create(event); }}>
            {config.fields.map(field => <label className="serviceField" key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span>
              {field.kind === 'select' ? <select value={form[field.key] || ''} onChange={event => setForm(old => ({ ...old, [field.key]: event.target.value }))}>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select> : field.kind === 'checkbox' ? <span className="serviceCheck"><input type="checkbox" checked={form[field.key] === 'true'} onChange={event => setForm(old => ({ ...old, [field.key]: String(event.target.checked) }))} />{field.label}</span> : field.kind === 'code' || field.kind === 'json' ? <textarea rows={field.kind === 'code' ? 8 : 5} required={field.required} spellCheck={false} value={form[field.key] || ''} placeholder={field.placeholder} onChange={event => setForm(old => ({ ...old, [field.key]: event.target.value }))} /> : <input type={field.kind === 'number' ? 'number' : field.kind === 'url' ? 'url' : 'text'} required={field.required} value={form[field.key] || ''} placeholder={field.placeholder} onChange={event => setForm(old => ({ ...old, [field.key]: event.target.value }))} />}
              {field.help && <small>{field.help}</small>}
            </label>)}
            <button className="primary serviceSubmit" disabled={busy || !clerk?.session} type="submit">{busy ? t.loading : config.createLabel}</button>
          </form>
          {created && <div className="success serviceOutput" role="status"><strong>{t.created}</strong>{Object.entries(created).map(([key, value]) => {
            if (value === undefined || value === null || typeof value === 'object' || key === 'tier') return null;
            const text = string(value);
            if (!text) return null;
            return <div className={`serviceOutputRow ${SECRETS.has(key) ? 'serviceSecretRow' : ''}`} key={key}><span>{key}{SECRETS.has(key) ? ` — ${t.token}` : ''}</span><code>{text}</code><button className="ghost" type="button" onClick={() => { void copyValue(text); }}>{copied === text ? t.copied : t.copy}</button></div>;
          })}<button className="ghost" type="button" onClick={() => setCreated(null)}>{locale === 'ja' ? '表示を閉じる' : 'Dismiss'}</button></div>}
          {(result !== null || downloadUrl) && <div className="serviceOutput" role="status"><strong>{t.output}</strong>{downloadUrl && <><a className="primary" href={downloadUrl} target="_blank" rel="noreferrer" download={downloadType.includes('pdf') ? 'capture.pdf' : 'capture.png'}>{t.open}</a>{downloadType.startsWith('image/') && <img className="servicePreview" src={downloadUrl} alt="Capture preview" />}</>}{result !== null && <pre>{string(result)}</pre>}</div>}
        </section>
        {config.listPath && <section className="serviceInventory" aria-label={t.resources}><div className="sectionHead"><div><span className="kicker">{tier.toUpperCase()}{limit !== null ? ` · ${items.length} / ${limit}` : ''}</span><h2>{t.resources}</h2></div><button className="ghost" type="button" disabled={loading} onClick={() => { void refresh(); }}>{loading ? t.loading : t.refresh}</button></div>
          <label className="serviceSearch"><span className="srOnly">{t.search}</span><input type="search" value={search} placeholder={t.search} onChange={event => setSearch(event.target.value)} /></label>
          {loading && !data && items.length === 0 ? <p className="empty" role="status">{t.loading}</p> : items.length === 0 ? <div className="empty">{config.empty || t.empty}</div> : filtered.length === 0 ? <div className="empty">{locale === 'ja' ? '検索結果がありません。' : 'No matching resources.'}</div> : <div className="serviceResourceList">{filtered.map((item, index) => {
            const id = string(item.id || index); const urls = links(item, service); const active = isActive(item);
            return <article className={`deployment serviceResource ${selected?.id === item.id ? 'serviceResourceSelected' : ''}`} key={id}><div className="deploymentTop"><div><strong>{displayName(item, index)}</strong><p>{string(item.status || item.created_at || item.createdAt || '')}</p></div><span className={`status ${active ? 'ready' : ''}`}>{active ? t.enabled : t.disabled}</span></div>
              {urls.slice(0, 3).map(link => <div className="serviceResourceLink" key={link.label}><span>{link.label}</span><code>{link.url}</code><button type="button" className="ghost" onClick={() => { void copyValue(link.url); }}>{copied === link.url ? t.copied : t.copy}</button>{link.url.startsWith('https://') && <a href={link.url} target="_blank" rel="noopener noreferrer">↗</a>}</div>)}
              <div className="deploymentBottom"><code>{string(item.public_id || item.publicId || item.id)}</code><button type="button" className="secondary" onClick={() => { setSelected(item); setTimeout(() => document.getElementById('picosvc-resource-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); }}>{t.manage} →</button></div>
            </article>;
          })}</div>}
        </section>}
        </div>
        {selected && <div id="picosvc-resource-detail" className="serviceDetailAnchor">{basic ? <ServiceResourceDetail key={`${service}:${string(selected.id)}`} service={service} resource={selected} api={api} onClose={() => setSelected(null)} onChanged={() => { void refresh(); }} copyValue={copyValue} /> : <ServiceAdvancedDetail key={`${service}:${string(selected.id)}`} service={service} resource={selected} api={api} onClose={() => setSelected(null)} onChanged={() => { void refresh(); }} copyValue={copyValue} />}</div>}
      </section>}
  </main>;
}
