'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { SERVICE_INFO, type GenericServiceSlug } from './service-data';
import { SERVICE_UI, initialServiceForm, serviceRequestBody } from './service-ui-config';
import ServiceResourceDetail from './service-resource-detail';
import './service-dashboard.css';

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

type Resource = Record<string, unknown>;
type ApiData = Record<string, unknown>;
type ApiResult = { payload: unknown; blob?: Blob };
type Labels = {
  resources: string; create: string; refresh: string; signIn: string; signInBody: string;
  loading: string; name: string; open: string; copy: string; copied: string; close: string;
  result: string; created: string; secret: string; secretNotice: string; noConfig: string;
  used: string; ready: string; back: string; pricing: string; details: string; retry: string;
};
const LABELS: Record<'en' | 'ja' | 'zh-CN', Labels> = {
  en: {
    resources: 'Your resources', create: 'Create new', refresh: 'Refresh', signIn: 'Sign in to PicoSvc', signInBody: 'One account for every PicoSvc product. Sign in to manage your own resources.',
    loading: 'Loading…', name: 'Name', open: 'Open URL', copy: 'Copy', copied: 'Copied', close: 'Close',
    result: 'Result', created: 'Created successfully', secret: 'New credential', secretNotice: 'Save this credential now. It will not be shown again.', noConfig: 'The API or Clerk environment variables are not configured.',
    used: 'used', ready: 'Ready', back: 'All products', pricing: 'Pricing', details: 'Manage', retry: 'Try again',
  },
  ja: {
    resources: '作成済みリソース', create: '新規作成', refresh: '更新', signIn: 'PicoSvcにログイン', signInBody: '全サービス共通のアカウントで、作成済みのリソースを管理できます。',
    loading: '読み込み中…', name: '名前', open: 'URLを開く', copy: 'コピー', copied: 'コピーしました', close: '閉じる',
    result: '実行結果', created: '作成しました', secret: '新しい認証情報', secretNotice: 'この認証情報は再表示できません。今すぐ安全な場所に保存してください。', noConfig: 'APIまたはClerkの環境変数が設定されていません。',
    used: '使用中', ready: '利用可能', back: '全サービス', pricing: '料金', details: '管理する', retry: '再試行',
  },
  'zh-CN': {
    resources: '我的资源', create: '新建', refresh: '刷新', signIn: '登录 PicoSvc', signInBody: '所有 PicoSvc 服务共用一个账号。登录后管理你的资源。',
    loading: '加载中…', name: '名称', open: '打开链接', copy: '复制', copied: '已复制', close: '关闭',
    result: '结果', created: '创建成功', secret: '新凭证', secretNotice: '凭证仅显示一次，请立即安全保存。', noConfig: '未配置 API 或 Clerk 环境变量。',
    used: '已使用', ready: '可用', back: '所有产品', pricing: '价格', details: '管理', retry: '重试',
  },
};

const URL_KEYS = ['endpoint', 'url', 'publicUrl', 'baseUrl', 'validationUrl', 'feedUrl', 'runtimeUrl', 'publicEndpoint', 'webhookUrl', 'redirectUrl', 'mcpUrl'] as const;
const SECRET_KEYS = ['bearerToken', 'licenseKey', 'token', 'apiKey', 'secret'] as const;

function asRecord(value: unknown): Resource | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Resource : null;
}
function displayText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}
function resourceName(item: Resource, index: number): string {
  for (const key of ['name', 'label', 'repoUrl', 'sourceUrl', 'targetUrl', 'url', 'public_id', 'publicId', 'id']) {
    if (typeof item[key] === 'string' && item[key]) return item[key] as string;
  }
  return `Resource ${index + 1}`;
}
function publicLinks(item: Resource): { label: string; url: string }[] {
  return URL_KEYS.flatMap((key) => {
    const value = item[key];
    if (typeof value !== 'string') return [];
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? [{ label: key, url: value }] : [];
    } catch { return []; }
  });
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function ServiceDashboard({ service }: { service: GenericServiceSlug }) {
  const { locale, messages, localizedHref } = useI18n();
  const t = LABELS[locale];
  const c = messages.common;
  const info = SERVICE_INFO[service];
  const config = SERVICE_UI[service];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => initialServiceForm(service));
  const [data, setData] = useState<ApiData | null>(null);
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Resource | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadType, setDownloadType] = useState('');
  const [selected, setSelected] = useState<Resource | null>(null);
  const [copied, setCopied] = useState('');
  const userButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      unsubscribe = instance.addListener(() => setSignedIn(Boolean(instance.isSignedIn)));
    }).catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    clerk.mountUserButton(userButtonRef.current);
    const node = userButtonRef.current;
    return () => { clerk.unmountUserButton(node); };
  }, [clerk, signedIn]);

  useEffect(() => {
    return () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); };
  }, [downloadUrl]);

  const api = useCallback(async (path: string, init: RequestInit = {}): Promise<ApiResult> => {
    if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    if (!path.startsWith('/api/picosvc/') && path !== '/api/servers' && !path.startsWith('/api/servers/')) throw new Error('Invalid API path.');
    const token = await clerk?.session?.getToken();
    if (!token) throw new Error('Please sign in again.');
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && (contentType.startsWith('image/') || contentType.includes('application/pdf') || contentType.includes('application/octet-stream'))) {
      return { payload: { status: response.status, contentType }, blob: await response.blob() };
    }
    const text = await response.text();
    let payload: unknown = text;
    if (text && (contentType.includes('json') || text.startsWith('{') || text.startsWith('['))) {
      try { payload = JSON.parse(text) as unknown; } catch { /* Keep response text for diagnostics. */ }
    }
    if (!response.ok) {
      const record = asRecord(payload);
      throw new Error(typeof record?.error === 'string' ? record.error : typeof record?.message === 'string' ? record.message : `HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return { payload };
  }, [clerk]);

  const refresh = useCallback(async () => {
    if (!signedIn || !config.listPath) return;
    setLoading(true);
    setError('');
    try {
      const response = await api(config.listPath);
      const record = asRecord(response.payload);
      const collection = record?.[config.collection || ''];
      // Never present an unknown API response as a misleading empty resource list.
      const found = Array.isArray(response.payload) ? response.payload : Array.isArray(collection) ? collection : null;
      if (!found) throw new Error(`The ${config.collection} list was not found in the API response.`);
      setData(record);
      setItems(found.filter((item): item is Resource => asRecord(item) !== null));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally { setLoading(false); }
  }, [api, config.collection, config.listPath, signedIn]);

  useEffect(() => {
    if (signedIn && clerk) { void refresh(); }
    else { setItems([]); setData(null); setSelected(null); setCreated(null); }
  }, [clerk, refresh, signedIn]);

  function updateField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function copyValue(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch (reason) { setError(errorMessage(reason)); }
  }
  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setCreated(null); setResult(null);
    setDownloadUrl(null);
    try {
      const body = serviceRequestBody(service, form);
      const response = await api(config.createPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.blob) {
        setDownloadUrl(URL.createObjectURL(response.blob));
        setDownloadType(response.blob.type || 'application/octet-stream');
        setResult(response.payload);
      } else if (config.listPath) {
        const record = asRecord(response.payload);
        setCreated(record ?? { result: response.payload });
        await refresh();
      } else { setResult(response.payload); }
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  const total = data && typeof data.limit === 'number' ? data.limit : null;
  const capacity = data && typeof data.tier === 'string' ? data.tier : 'free';
  const resultText = result === null ? '' : displayText(result);

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href={localizedHref('/')}>{t.back}</a><a href={localizedHref('/pricing')}>{t.pricing}</a><a href={localizedHref('/contact')}>{c.contact}</a><LanguageSwitcher />{signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{c.signIn}</button>}</div>
      </nav>
      <section className="hero shell serviceHero">
        <div className="eyebrow"><span className="dot" /> PicoSvc {info.name}</div>
        <h1>{config.title}</h1>
        <p className="lede">{config.description}</p>
        <div className="flow"><span>Free</span><i>→</i><span>Pico $1</span><i>→</i><span>PicoPlus $5</span><i>→</i><span>Bundle</span></div>
      </section>
      {!API_URL || !CLERK_KEY ? <section className="shell"><div className="notice">{t.noConfig}</div></section> : null}
      {!signedIn ? (
        <section className="shell deploymentsSection"><div className="deployCard signinState"><div><strong>{t.signIn}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div>{error && <p className="error" role="alert">{error}</p>}</section>
      ) : (
        <section className="shell serviceWorkspace">
          {error && <div className="error" role="alert">{error} <button type="button" className="ghost" onClick={() => { setError(''); void refresh(); }}>{t.retry}</button></div>}
          <div className="serviceColumns">
            <div className="deployCard serviceCreate">
              <div className="sectionHead"><div><span className="kicker">PicoSvc {info.name}</span><h2>{config.createLabel}</h2></div></div>
              <form onSubmit={(event) => { void createResource(event); }}>
                {config.fields.map((field) => (
                  <label className="serviceField" key={field.key}>
                    <span>{field.label}{field.required ? ' *' : ''}</span>
                    {field.kind === 'select' ? <select value={form[field.key] ?? ''} onChange={(event) => updateField(field.key, event.target.value)}>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> :
                      field.kind === 'checkbox' ? <input type="checkbox" checked={form[field.key] === 'true'} onChange={(event) => updateField(field.key, String(event.target.checked))} /> :
                      field.kind === 'code' || field.kind === 'json' ? <textarea rows={field.kind === 'code' ? 8 : 5} required={field.required} value={form[field.key] ?? ''} onChange={(event) => updateField(field.key, event.target.value)} placeholder={field.placeholder} spellCheck={false} /> :
                      <input type={field.kind === 'number' ? 'number' : field.kind === 'url' ? 'url' : 'text'} required={field.required} value={form[field.key] ?? ''} onChange={(event) => updateField(field.key, event.target.value)} placeholder={field.placeholder} />}
                    {field.help && <small>{field.help}</small>}
                  </label>
                ))}
                <button className="primary serviceSubmit" type="submit" disabled={busy || !clerk?.session}>{busy ? t.loading : config.createLabel}</button>
              </form>
              {created && <div className="success serviceOutput" role="status"><strong>{t.created}</strong>{Object.entries(created).map(([key, value]) => {
                if (value === null || value === undefined || typeof value === 'object') return null;
                const secret = (SECRET_KEYS as readonly string[]).includes(key);
                const display = displayText(value);
                if (!display || key === 'tier') return null;
                return <div className="serviceOutputRow" key={key}><span>{secret ? t.secret : key}{secret ? ` · ${t.secretNotice}` : ''}</span><code>{display}</code><button className="ghost" type="button" onClick={() => { void copyValue(display); }}>{copied === display ? t.copied : t.copy}</button></div>;
              })}</div>}
              {(result !== null || downloadUrl) && <div className="serviceOutput" role="status"><strong>{t.result}</strong>{downloadUrl && <div><a className="primary" href={downloadUrl} target="_blank" rel="noreferrer" download={downloadType.includes('pdf') ? 'capture.pdf' : 'capture.png'}>{t.open}</a>{downloadType.startsWith('image/') && <img className="servicePreview" src={downloadUrl} alt="Captured page preview" />}</div>}{resultText && <pre>{resultText}</pre>}</div>}
            </div>
            {config.listPath && <div className="serviceInventory">
              <div className="sectionHead"><div><span className="kicker">{capacity.toUpperCase()}{total !== null ? ` · ${items.length}/${total} ${t.used}` : ''}</span><h2>{t.resources}</h2></div><button className="ghost" disabled={loading} onClick={() => { void refresh(); }}>{loading ? t.loading : t.refresh}</button></div>
              {loading && data === null ? <div className="empty" role="status">{t.loading}</div> : items.length === 0 ? <div className="empty">{config.empty}</div> :
                <div className="serviceResourceList">{items.map((item, index) => {
                  const id = displayText(item.id) || `${index}`;
                  const links = publicLinks(item);
                  return <article className="deployment serviceResource" key={id}>
                    <div className="deploymentTop"><div><strong>{resourceName(item, index)}</strong><p>{displayText(item.status || item.method || item.created_at || item.createdAt || '')}</p></div><span className="status ready">{t.ready}</span></div>
                    {links.map((link) => <div className="serviceResourceLink" key={link.label}><span>{link.label}</span><code>{link.url}</code><button className="ghost" onClick={() => { void copyValue(link.url); }}>{copied === link.url ? t.copied : t.copy}</button></div>)}
                    <div className="deploymentBottom"><code>{displayText(item.public_id || item.publicId || item.id)}</code><button className="secondary" onClick={() => setSelected(item)}>{t.details} →</button></div>
                  </article>;
                })}</div>}
            </div>}
          </div>
          {selected && <ServiceResourceDetail service={service} resource={selected} api={api} onClose={() => setSelected(null)} onChanged={() => { void refresh(); }} copyValue={copyValue} />}
        </section>
      )}
    </main>
  );
}
