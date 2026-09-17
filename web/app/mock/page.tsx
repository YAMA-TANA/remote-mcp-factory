'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from '../i18n';
import { PICOSVC_PRICING, tierLabel, type BillingTierId } from '../pricing-data';
import { mockRequestBody, type MockFormValues } from '../mock-form';
import { downloadManagementCsv, filterMockInventory, mockInventoryCsv } from '../service-standalone-management';
import '../mock-workspace.css';
import '../service-standalone-management.css';

type MockEndpoint = { id: string; name: string; method: string; path: string; statusCode: number; contentType: string; headers: Record<string, string>; body: string; enabled: boolean; endpoint: string; createdAt: string; updatedAt: string };
type EndpointList = { tier: BillingTierId; limit: number | null; endpoints: MockEndpoint[] };
const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const DEFAULT_FORM: MockFormValues = { name: 'Hello API', method: 'GET', path: 'hello', statusCode: '200', contentType: 'application/json; charset=utf-8', body: '{\n  "hello": "world"\n}', enabled: true };
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
const PLAN_COPY = {
  en: `Create a stable public endpoint with the HTTP method, status and response body you need. Free includes 1 endpoint, Pico is $${PICOSVC_PRICING.standalone.pico}/month for 10 endpoints, and PicoPlus is $${PICOSVC_PRICING.standalone.picoPlus}/month for 100. Larger usage is available by contact.`,
  ja: `必要なHTTPメソッド、ステータス、レスポンス本文を持つ安定した公開エンドポイントを作成できます。Freeは1 endpoint、Picoは月$${PICOSVC_PRICING.standalone.pico}で10 endpoints、PicoPlusは月$${PICOSVC_PRICING.standalone.picoPlus}で100 endpoints。それ以上はお問い合わせください。`,
  'zh-CN': `创建稳定的公开 Mock API endpoint。Free 包含 1 个 endpoint，Pico 每月 $${PICOSVC_PRICING.standalone.pico} 包含 10 个，PicoPlus 每月 $${PICOSVC_PRICING.standalone.picoPlus} 包含 100 个；更高用量请联系我们。`,
} as const;
const EXTRA = {
  en: { edit: 'Edit endpoint', editing: 'Editing endpoint', cancel: 'Cancel editing', save: 'Save changes', contentType: 'Response content type', enabled: 'Endpoint enabled', pathHelp: 'Use URL-safe path segments, e.g. api/v1/users.', bodyHelp: 'Responses with status 204, 205, 304 or method HEAD cannot include a body.', copied: 'URL copied', copyFailed: 'Could not copy the URL.', deleteConfirm: 'Permanently delete this endpoint? This cannot be undone.', open: 'Open GET endpoint', loading: 'Loading endpoints…', saved: 'Endpoint saved.', created: 'Endpoint created.', deleted: 'Endpoint deleted.', discard: 'Discard unsaved changes to this endpoint?', find: 'Find endpoints by name, path or content type', methodFilter: 'HTTP method', allMethods: 'All methods', inventory: 'Endpoint inventory', export: 'Download filtered CSV', exportHint: 'Only endpoint metadata is exported. Response bodies and headers are excluded.', matches: 'matching endpoints', noMatches: 'No endpoints match these filters.' },
  ja: { edit: '編集', editing: 'エンドポイントを編集中', cancel: '編集を取り消す', save: '変更を保存', contentType: 'レスポンスのContent-Type', enabled: 'エンドポイントを有効にする', pathHelp: '例：api/v1/users。URLに使える文字で指定してください。', bodyHelp: '204・205・304またはHEADのレスポンスには本文を付けられません。', copied: 'URLをコピーしました', copyFailed: 'URLをコピーできませんでした。', deleteConfirm: 'このエンドポイントを完全に削除しますか？元に戻せません。', open: 'GETエンドポイントを開く', loading: 'エンドポイントを読み込み中…', saved: '変更を保存しました。', created: 'エンドポイントを作成しました。', deleted: 'エンドポイントを削除しました。', discard: '未保存の変更を破棄しますか？', find: '名前・パス・Content-Typeを検索', methodFilter: 'HTTPメソッド', allMethods: 'すべてのメソッド', inventory: 'エンドポイント一覧', export: '絞り込み結果をCSV出力', exportHint: '名前・メソッド・パスなどのメタデータのみ。本文・ヘッダーは出力しません。', matches: '件の一致', noMatches: '条件に一致するエンドポイントはありません。' },
  'zh-CN': { edit: '编辑', editing: '正在编辑端点', cancel: '取消编辑', save: '保存更改', contentType: '响应 Content-Type', enabled: '启用端点', pathHelp: '请输入 URL 安全的路径，例如 api/v1/users。', bodyHelp: '状态码 204、205、304 或 HEAD 请求不能包含响应正文。', copied: '已复制 URL', copyFailed: '无法复制 URL。', deleteConfirm: '永久删除此端点？此操作无法撤销。', open: '打开 GET 端点', loading: '正在加载端点…', saved: '已保存端点。', created: '已创建端点。', deleted: '已删除端点。', discard: '放弃未保存的更改？', find: '按名称、路径或内容类型搜索', methodFilter: 'HTTP 方法', allMethods: '所有方法', inventory: '端点清单', export: '导出筛选后的 CSV', exportHint: '仅包含端点元数据，不包含响应正文或请求头。', matches: '个匹配端点', noMatches: '没有符合条件的端点。' },
} as const;
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function originalForm(endpoint: MockEndpoint): MockFormValues {
  return { name: endpoint.name, method: endpoint.method, path: endpoint.path, statusCode: String(endpoint.statusCode), contentType: endpoint.contentType, body: endpoint.body, enabled: endpoint.enabled };
}

export default function MockPage() {
  const { locale, messages, localizedHref } = useI18n(); const t = messages.mock; const c = messages.common; const extra = EXTRA[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null); const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<EndpointList>({ tier: 'free', limit: 1, endpoints: [] });
  const [form, setForm] = useState<MockFormValues>({ ...DEFAULT_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState(''); const [methodFilter, setMethodFilter] = useState('all');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const userButtonRef = useRef<HTMLDivElement>(null); const formRef = useRef<HTMLDivElement>(null);
  const filtered = filterMockInventory(data.endpoints, filterQuery, methodFilter);

  useEffect(() => { if (!CLERK_KEY) return; let active = true; let removeListener: (() => void) | undefined; import('@clerk/clerk-js').then(async ({ Clerk }) => { const instance = new Clerk(CLERK_KEY); await instance.load({ ui }); if (!active) return; setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); removeListener = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); }); }).catch((error) => { if (active) setMessage(errorMessage(error)); }); return () => { active = false; removeListener?.(); }; }, []);
  useEffect(() => { if (!clerk || !signedIn || !userButtonRef.current) return; const node = userButtonRef.current; clerk.mountUserButton(node); return () => { clerk.unmountUserButton(node); }; }, [clerk, signedIn]);
  async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
    if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    const token = await clerk?.session?.getToken(); if (!token) throw new Error(c.signIn);
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API_URL}${route}`, { ...init, headers });
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const object = payload && typeof payload === 'object' ? payload as { error?: string | { message?: string }; message?: string } : null;
      throw new Error((typeof object?.error === 'string' ? object.error : object?.error?.message || object?.message) || `HTTP ${response.status}`);
    }
    return payload as T;
  }
  async function refresh() {
    if (!signedIn) return;
    setLoading(true);
    try { setData(await api<EndpointList>('/api/picosvc/mock/endpoints')); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (signedIn && clerk) void refresh(); else { setData({ tier: 'free', limit: 1, endpoints: [] }); setEditingId(null); } }, [signedIn, clerk]);
  function change<K extends keyof MockFormValues>(key: K, value: MockFormValues[K]) { setForm(old => ({ ...old, [key]: value })); }
  function dirtyEdit(): boolean {
    if (!editingId) return false;
    const original = data.endpoints.find(item => item.id === editingId);
    return !original || JSON.stringify(originalForm(original)) !== JSON.stringify(form);
  }
  function startEdit(endpoint: MockEndpoint) {
    if (busy || editingId === endpoint.id || (dirtyEdit() && !window.confirm(extra.discard))) return;
    setEditingId(endpoint.id); setForm(originalForm(endpoint)); setMessage('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cancelEdit() { if (busy || (dirtyEdit() && !window.confirm(extra.discard))) return; setEditingId(null); setForm({ ...DEFAULT_FORM }); setMessage(''); }
  async function submitEndpoint() {
    if (busy) return;
    let body: Record<string, unknown>;
    try { body = mockRequestBody(form); } catch (error) { setMessage(errorMessage(error)); return; }
    setBusy(true); setMessage('');
    try {
      await api(editingId ? `/api/picosvc/mock/endpoints/${encodeURIComponent(editingId)}` : '/api/picosvc/mock/endpoints', {
        method: editingId ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const notice = editingId ? extra.saved : extra.created;
      setEditingId(null); setForm({ ...DEFAULT_FORM }); await refresh(); setMessage(notice);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function removeEndpoint(id: string) {
    if (busy || !window.confirm(extra.deleteConfirm)) return;
    setBusy(true); setMessage('');
    try {
      await api(`/api/picosvc/mock/endpoints/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (editingId === id) { setEditingId(null); setForm({ ...DEFAULT_FORM }); }
      await refresh(); setMessage(extra.deleted);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function copyEndpoint(url: string) {
    try { await navigator.clipboard.writeText(url); setMessage(extra.copied); }
    catch { setMessage(extra.copyFailed); }
  }
  function exportInventory() {
    if (busy || !filtered.length) return;
    downloadManagementCsv(mockInventoryCsv(filtered), 'picosvc-mock-endpoints.csv');
  }
  return (
    <main className="mockWorkspace">
      <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{c.products}</a><a href={localizedHref('/pricing')}>Pricing</a><a href={localizedHref('/contact')}>{c.contact}</a><a href={localizedHref('/terms')}>{c.terms}</a><a href={localizedHref('/privacy')}>{c.privacy}</a><LanguageSwitcher />{signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{c.signIn}</button>}</div></nav>
      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> PicoSvc Mock</div><h1>{t.title1}<br />{t.title2}</h1><p className="lede">{PLAN_COPY[locale]}</p>
        {!signedIn ? <div className="deployCard signinState"><div><strong>{t.signInTitle}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signInPico}</button></div> : (
          <div className="deployCard mockEditor" ref={formRef}><div className="sectionHead"><div><span className="kicker">{tierLabel(data.tier)} {t.plan}</span><h2>{editingId ? extra.editing : t.newEndpoint}</h2></div><span>{data.endpoints.length} / {data.limit ?? '∞'}</span></div>
            <form onSubmit={event => { event.preventDefault(); void submitEndpoint(); }}>
              <div className="options"><label>{t.name} <input required maxLength={120} value={form.name} onChange={event => change('name', event.target.value)} /></label><label>{t.method} <select value={form.method} onChange={event => change('method', event.target.value)}>{HTTP_METHODS.map(method => <option key={method}>{method}</option>)}</select></label><label>{t.path} <input value={form.path} maxLength={500} onChange={event => change('path', event.target.value)} placeholder="hello" /><small>{extra.pathHelp}</small></label><label>{t.status} <input type="number" required min={200} max={599} step={1} value={form.statusCode} onChange={event => change('statusCode', event.target.value)} /></label><label>{extra.contentType} <input required maxLength={255} value={form.contentType} onChange={event => change('contentType', event.target.value)} placeholder="application/json; charset=utf-8" /></label></div>
              <label htmlFor="pico-mock-body">{t.responseBody}</label><textarea id="pico-mock-body" value={form.body} onChange={event => change('body', event.target.value)} rows={8} spellCheck={false} /><small className="mockHelp">{extra.bodyHelp}</small>
              {editingId && <label className="mockEnabled"><input type="checkbox" checked={form.enabled} onChange={event => change('enabled', event.target.checked)} />{extra.enabled}</label>}
              <div className="mockActions"><button className="primary" type="submit" disabled={busy || !form.name.trim() || (!editingId && data.limit !== null && data.endpoints.length >= data.limit)}>{busy ? t.saving : editingId ? extra.save : t.createEndpoint}</button>{editingId && <button className="ghost" type="button" disabled={busy} onClick={cancelEdit}>{extra.cancel}</button>}</div>
              {message && <div className="notice mockNotice" role="status">{message}</div>}
            </form>
          </div>
        )}
      </section>
      <section className="shell deploymentsSection"><div className="sectionHead"><div><span className="kicker">{t.yourMocks}</span><h2>{t.endpoints}</h2></div>{signedIn && <button className="ghost" type="button" disabled={loading || busy} onClick={() => { void refresh(); }}>{loading ? extra.loading : c.refresh}</button>}</div>
        {signedIn && <div className="standaloneTools" aria-label={extra.inventory}><div className="standaloneToolFilters"><label>{extra.find}<input type="search" value={filterQuery} maxLength={160} onChange={event => setFilterQuery(event.target.value)} /></label><label>{extra.methodFilter}<select value={methodFilter} onChange={event => setMethodFilter(event.target.value)}><option value="all">{extra.allMethods}</option>{HTTP_METHODS.map(method => <option key={method} value={method}>{method}</option>)}</select></label></div><div className="standaloneToolFoot"><span role="status">{filtered.length} / {data.endpoints.length} {extra.matches}</span><button className="secondary" type="button" disabled={busy || !filtered.length} onClick={exportInventory}>{extra.export}</button></div><small>{extra.exportHint}</small></div>}
        {!signedIn ? <div className="empty">{t.signInToView}</div> : loading && !data.endpoints.length ? <div className="empty" role="status">{extra.loading}</div> : data.endpoints.length === 0 ? <div className="empty">{t.noEndpoints}</div> : filtered.length === 0 ? <div className="empty">{extra.noMatches}</div> : <div className="deploymentGrid">{filtered.map(endpoint => <article className="deployment mockEndpoint" key={endpoint.id}><div className="deploymentTop"><div><strong>{endpoint.name}</strong><p>{endpoint.method} · {endpoint.statusCode} · {endpoint.contentType}</p></div><span className={`status ${endpoint.enabled ? 'ready' : ''}`}>{endpoint.enabled ? c.active : c.disabled}</span></div><div className="success"><code>{endpoint.endpoint}</code></div><div className="deploymentBottom"><button className="ghost" type="button" disabled={busy} onClick={() => { void copyEndpoint(endpoint.endpoint); }}>{t.copyUrl}</button>{endpoint.method === 'GET' && endpoint.enabled && <a className="ghost mockOpen" href={endpoint.endpoint} target="_blank" rel="noopener noreferrer">{extra.open} ↗</a>}<button className="secondary" type="button" disabled={busy} onClick={() => startEdit(endpoint)}>{extra.edit}</button><button className="ghost" type="button" disabled={busy} onClick={() => { void removeEndpoint(endpoint.id); }}>{c.delete}</button></div></article>)}</div>}
      </section>
    </main>
  );
}
