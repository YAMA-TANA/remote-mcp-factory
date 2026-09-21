'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { mockRequestBody, type MockFormValues } from './mock-form';
import { filterMockInventory, mockInventoryCsv, downloadManagementCsv } from './service-standalone-management';
import { workspaceApiError } from './workspace-helpers';
import './service-fleet-console.css';
import './service-on-demand-console.css';
import './service-mock-console.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
type Endpoint = { id: string; name: string; method: string; path: string; statusCode: number; contentType: string; headers: Record<string, string>; body: string; enabled: boolean; endpoint: string; createdAt: string; updatedAt: string };
type Inventory = { tier: string; limit: number | null; endpoints: Endpoint[] };
const DEFAULT_FORM: MockFormValues = { name: '', method: 'GET', path: '', statusCode: '200', contentType: 'application/json; charset=utf-8', body: '{}', enabled: true };
const WORDS = {
  ja: { dashboard: '全体ダッシュボード', workspace: '作成・テスト画面', usage: '利用量・上限', title: 'Mock エンドポイント個別管理', intro: 'エンドポイントを選び、レスポンス設定・公開状態の変更と削除を管理します。', signIn: 'ログインして管理画面を開く', config: '認証またはWorker APIが未設定です。', error: 'エンドポイントを取得できませんでした。', loading: '読み込み中…', refresh: '一覧を更新', inventory: 'エンドポイント一覧', search: '名前・パスで検索', methodFilter: 'HTTPメソッド', all: 'すべて', noMatch: '該当するエンドポイントはありません。', create: '新規作成', edit: '個別編集', save: '変更を保存', add: 'エンドポイントを作成', saving: '処理中…', cancel: '編集を取り消す', discard: '未保存の編集内容を破棄しますか？', select: '編集する', plan: 'プラン', count: '登録件数', enabled: '公開中', paused: '停止中', name: '名前', method: 'HTTPメソッド', path: 'パス', status: 'レスポンスのHTTPステータス', contentType: 'Content-Type', body: 'レスポンス本文', active: 'エンドポイントを有効にする', url: '公開URL', copy: 'URLをコピー', copied: 'コピーしました', copyError: 'URLをコピーできませんでした。', open: 'GETエンドポイントを開く', export: '表示中の一覧をCSV出力', exportHint: 'CSVにはレスポンス本文・ヘッダーを含めません。', toggleOff: '停止する', toggleOn: '再開する', pauseConfirm: 'このエンドポイントを停止しますか？公開URLから応答しなくなります。', delete: '削除する', deleteConfirm: 'このエンドポイントを完全に削除しますか？元に戻せません。', saved: '変更を保存しました。', added: 'エンドポイントを作成しました。', removed: 'エンドポイントを削除しました。', toggled: '公開状態を変更しました。', nothing: '左の一覧から選ぶか、新規作成してください。', dirty: '編集内容に未保存の変更があります。', limit: 'このプランの登録上限に達しています。', noBody: 'HEAD・204・205・304の応答には本文を設定できません。', privacy: 'レスポンス本文は編集中の対象だけに表示します。URLやレスポンスに秘密情報を含めないでください。' },
  en: { dashboard: 'All-service dashboard', workspace: 'Create / test workspace', usage: 'Usage & limits', title: 'Mock endpoint management', intro: 'Select an endpoint to manage its response, availability and deletion.', signIn: 'Sign in to manage endpoints', config: 'Authentication or Worker API is not configured.', error: 'Could not load endpoints.', loading: 'Loading…', refresh: 'Refresh inventory', inventory: 'Endpoints', search: 'Search name or path', methodFilter: 'HTTP method', all: 'All', noMatch: 'No matching endpoints.', create: 'New endpoint', edit: 'Edit endpoint', save: 'Save changes', add: 'Create endpoint', saving: 'Working…', cancel: 'Cancel editing', discard: 'Discard unsaved changes?', select: 'Edit', plan: 'Plan', count: 'Endpoints', enabled: 'Enabled', paused: 'Paused', name: 'Name', method: 'HTTP method', path: 'Path', status: 'Response status', contentType: 'Content-Type', body: 'Response body', active: 'Enable endpoint', url: 'Public URL', copy: 'Copy URL', copied: 'Copied', copyError: 'Could not copy URL.', open: 'Open GET endpoint', export: 'Export filtered CSV', exportHint: 'Response bodies and headers are excluded from the CSV.', toggleOff: 'Pause', toggleOn: 'Resume', pauseConfirm: 'Pause this endpoint? Its public URL will stop responding.', delete: 'Delete', deleteConfirm: 'Permanently delete this endpoint? This cannot be undone.', saved: 'Changes saved.', added: 'Endpoint created.', removed: 'Endpoint deleted.', toggled: 'Availability updated.', nothing: 'Select an endpoint or create a new one.', dirty: 'There are unsaved edits.', limit: 'Your plan endpoint limit has been reached.', noBody: 'HEAD, 204, 205 and 304 responses cannot contain a body.', privacy: 'The response body is shown for the selected endpoint only. Do not place secrets in URLs or responses.' },
  'zh-CN': { dashboard: '全部服务总览', workspace: '创建／测试工作台', usage: '用量与限额', title: 'Mock 端点单项管理', intro: '选择端点，管理响应设置、启用状态和删除。', signIn: '登录后管理端点', config: '身份验证或 Worker API 未配置。', error: '无法加载端点。', loading: '加载中…', refresh: '刷新列表', inventory: '端点列表', search: '搜索名称或路径', methodFilter: 'HTTP 方法', all: '全部', noMatch: '没有匹配的端点。', create: '创建新端点', edit: '编辑端点', save: '保存更改', add: '创建端点', saving: '处理中…', cancel: '取消编辑', discard: '放弃未保存的修改？', select: '编辑', plan: '套餐', count: '端点数量', enabled: '已启用', paused: '已停用', name: '名称', method: 'HTTP 方法', path: '路径', status: '响应状态码', contentType: 'Content-Type', body: '响应正文', active: '启用端点', url: '公开地址', copy: '复制地址', copied: '已复制', copyError: '无法复制地址。', open: '打开 GET 端点', export: '导出筛选 CSV', exportHint: 'CSV 不包含响应正文或请求头。', toggleOff: '暂停', toggleOn: '恢复', pauseConfirm: '暂停此端点？公开地址将停止响应。', delete: '删除', deleteConfirm: '永久删除此端点？此操作无法撤销。', saved: '更改已保存。', added: '端点已创建。', removed: '端点已删除。', toggled: '启用状态已更新。', nothing: '选择端点或创建一个新端点。', dirty: '存在未保存的修改。', limit: '当前套餐已达到端点数量上限。', noBody: 'HEAD、204、205 和 304 响应不能包含正文。', privacy: '仅显示选中端点的响应正文。请勿在 URL 或响应中放入秘密信息。' },
} as const;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function readInventory(value: unknown): Inventory {
  if (!object(value) || !Array.isArray(value.endpoints) || typeof value.tier !== 'string' || !(value.limit === null || (typeof value.limit === 'number' && Number.isFinite(value.limit)))) throw new Error('Invalid Mock inventory response.');
  const endpoints = value.endpoints.filter((row): row is Endpoint => object(row) && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.method === 'string' && typeof row.path === 'string' && typeof row.statusCode === 'number' && typeof row.contentType === 'string' && typeof row.body === 'string' && typeof row.enabled === 'boolean' && typeof row.endpoint === 'string' && typeof row.updatedAt === 'string');
  if (endpoints.length !== value.endpoints.length) throw new Error('Invalid Mock endpoint data.');
  return { tier: value.tier, limit: value.limit, endpoints };
}
function toForm(row: Endpoint): MockFormValues { return { name: row.name, method: row.method, path: row.path, statusCode: String(row.statusCode), contentType: row.contentType, body: row.body, enabled: row.enabled }; }
function safeUrl(raw: string): string { try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }

export default function ServiceMockConsole() {
  const { locale, localizedHref, messages } = useI18n();
  const t = WORDS[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [ready, setReady] = useState(!KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MockFormValues>({ ...DEFAULT_FORM });
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('all');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const accountNode = useRef<HTMLDivElement>(null);
  const version = useRef(0);

  useEffect(() => {
    if (!KEY) return;
    let mounted = true; let stop: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(KEY); await instance.load({ ui });
      if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      stop = instance.addListener(() => {
        if (!mounted) return;
        version.current++; setInventory(null); setSelectedId(''); setCreating(false); setForm({ ...DEFAULT_FORM }); setError(''); setNotice('');
        setSignedIn(Boolean(instance.isSignedIn)); setAuthRevision(n => n + 1);
      });
    }).catch(() => { if (mounted) { setReady(true); setError(t.error); } });
    return () => { mounted = false; stop?.(); version.current++; };
  }, [t.error]);
  useEffect(() => {
    if (!clerk || !signedIn || !accountNode.current) return;
    const node = accountNode.current; clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn]);
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    if (!API || !clerk?.isSignedIn) throw new Error(t.config);
    const token = await clerk.session?.getToken();
    if (!token) throw new Error(t.signIn);
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, redirect: 'error', cache: 'no-store' });
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return payload;
  }, [clerk, t.config, t.signIn]);
  const refresh = useCallback(async (preferredId?: string) => {
    if (!signedIn || !clerk) return;
    const current = ++version.current;
    setLoading(true); setError('');
    try {
      const rows = readInventory(await request('/api/picosvc/mock/endpoints'));
      if (current !== version.current) return;
      setInventory(rows);
      const chosen = rows.endpoints.find(row => row.id === preferredId) || rows.endpoints.find(row => row.id === selectedId) || rows.endpoints[0];
      setSelectedId(chosen?.id || '');
      if (!creating && chosen) setForm(toForm(chosen));
      else if (!creating) setForm({ ...DEFAULT_FORM });
    } catch (reason) {
      if (current === version.current) { setInventory(null); setSelectedId(''); setError(reason instanceof Error ? reason.message : t.error); }
    } finally { if (current === version.current) setLoading(false); }
  }, [clerk, creating, request, selectedId, signedIn, t.error]);
  useEffect(() => {
    if (signedIn && clerk) void refresh();
    else { version.current++; setInventory(null); setSelectedId(''); setForm({ ...DEFAULT_FORM }); setLoading(false); }
    return () => { version.current++; };
    // Initial load and account switches only; editor selection is handled locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerk, signedIn, authRevision]);
  const rows = inventory?.endpoints || [];
  const visible = filterMockInventory(rows, query, method);
  const selected = rows.find(row => row.id === selectedId) || null;
  const dirty = creating ? JSON.stringify(form) !== JSON.stringify(DEFAULT_FORM) : Boolean(selected && JSON.stringify(form) !== JSON.stringify(toForm(selected)));
  const atLimit = inventory?.limit !== null && inventory !== null && rows.length >= inventory.limit;
  const active = rows.filter(row => row.enabled).length;
  const url = selected ? safeUrl(selected.endpoint) : '';
  function confirmDiscard(): boolean { return !dirty || window.confirm(t.discard); }
  function choose(row: Endpoint) {
    if (busy || !confirmDiscard()) return;
    setSelectedId(row.id); setCreating(false); setForm(toForm(row)); setNotice(''); setError('');
  }
  function beginCreate() {
    if (busy || atLimit || !confirmDiscard()) return;
    setSelectedId(''); setCreating(true); setForm({ ...DEFAULT_FORM }); setNotice(''); setError('');
  }
  function cancel() {
    if (busy || !confirmDiscard()) return;
    setCreating(false); setSelectedId(rows[0]?.id || ''); setForm(rows[0] ? toForm(rows[0]) : { ...DEFAULT_FORM }); setError('');
  }
  function change<K extends keyof MockFormValues>(key: K, value: MockFormValues[K]) { setForm(old => ({ ...old, [key]: value })); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!creating && !selected) || (creating && atLimit)) return;
    const current = version.current;
    let body: Record<string, unknown>;
    try { body = mockRequestBody(form); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = await request(creating ? '/api/picosvc/mock/endpoints' : `/api/picosvc/mock/endpoints/${encodeURIComponent(selected!.id)}`, { method: creating ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (current !== version.current) return;
      const nextId = creating && object(payload) && typeof payload.id === 'string' ? payload.id : selected?.id;
      const wasCreating = creating;
      setCreating(false);
      await refresh(nextId);
      setNotice(wasCreating ? t.added : t.saved);
    } catch (reason) { if (current === version.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function toggle(row: Endpoint) {
    if (busy || (row.enabled && !window.confirm(t.pauseConfirm)) || (selected?.id === row.id && !confirmDiscard())) return;
    const current = version.current;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/picosvc/mock/endpoints/${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !row.enabled }) });
      if (current !== version.current) return;
      await refresh(row.id); setNotice(t.toggled);
    } catch (reason) { if (current === version.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function remove(row: Endpoint) {
    if (busy || (selected?.id === row.id && !confirmDiscard()) || !window.confirm(`${t.deleteConfirm}\n${row.name}`)) return;
    const current = version.current;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/picosvc/mock/endpoints/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      if (current !== version.current) return;
      setSelectedId(''); setCreating(false);
      await refresh(); setNotice(t.removed);
    } catch (reason) { if (current === version.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function copyUrl() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setNotice(t.copied); }
    catch { setError(t.copyError); }
  }
  function exportCsv() { if (visible.length) downloadManagementCsv(mockInventoryCsv(visible), 'picosvc-mock-endpoints.csv'); }
  return <main className="fleetConsole">
    <nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt="" />PicoSvc</a><div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={localizedHref('/mock/app/')}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher />{signedIn ? <div ref={accountNode} /> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <div className="shell fleetBody mockManageBody"><header className="fleetHero"><span>PICOSVC / MOCK / MANAGEMENT</span><h1>{t.title}</h1><p>{t.intro}</p></header>
      {!API || !KEY ? <p className="fleetError" role="alert">{t.config}</p> : !ready ? <p role="status">{t.loading}</p> : !signedIn ? <section className="fleetPanel"><p>{t.signIn}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <>
        <div className="mockManageActions"><span>{t.plan}: {inventory?.tier ?? '—'} · {t.count}: {inventory ? `${rows.length} / ${inventory.limit ?? '∞'}` : '—'} · {t.enabled}: {inventory ? active : '—'}</span><button type="button" disabled={loading || busy} onClick={() => { if (confirmDiscard()) void refresh(); }}>{loading ? t.loading : t.refresh}</button><button type="button" disabled={loading || busy || atLimit} onClick={beginCreate}>{t.create}</button></div>
        {error && <p className="fleetError" role="alert">{error}</p>}{notice && <p className="fleetNotice" role="status">{notice}</p>}{atLimit && <p className="mockManageHint">{t.limit}</p>}
        <div className="mockManageLayout"><section className="fleetPanel mockManageInventory"><h2>{t.inventory}</h2><label htmlFor="mock-manage-search">{t.search}</label><input id="mock-manage-search" value={query} onChange={event => setQuery(event.target.value)} /><label htmlFor="mock-manage-method">{t.methodFilter}</label><select id="mock-manage-method" value={method} onChange={event => setMethod(event.target.value)}><option value="all">{t.all}</option>{METHODS.map(value => <option key={value} value={value}>{value}</option>)}</select><button type="button" disabled={!visible.length} onClick={exportCsv}>{t.export}</button><p className="mockManageHint">{t.exportHint}</p>
          {!visible.length ? <p>{loading ? t.loading : t.noMatch}</p> : <ul>{visible.map(row => <li key={row.id}><button type="button" className={selectedId === row.id && !creating ? 'mockManageSelected' : ''} onClick={() => choose(row)} disabled={busy}><strong>{row.name}</strong><small>{row.method} · /{row.path} · {row.enabled ? t.enabled : t.paused}</small><span>{t.select} →</span></button></li>)}</ul>}
        </section><section className="fleetPanel mockManageEditor"><h2>{creating ? t.create : selected ? `${t.edit}: ${selected.name}` : t.edit}</h2>{!creating && !selected ? <p>{t.nothing}</p> : <>
          {url && !creating && <div className="mockManageUrl"><strong>{t.url}</strong><code>{url}</code><button type="button" onClick={() => void copyUrl()}>{t.copy}</button>{selected?.method === 'GET' && <a href={url} target="_blank" rel="noopener noreferrer">{t.open} ↗</a>}</div>}
          <form onSubmit={event => void save(event)}><div className="mockManageFields"><label>{t.name}<input required maxLength={120} value={form.name} onChange={event => change('name', event.target.value)} /></label><label>{t.method}<select value={form.method} onChange={event => change('method', event.target.value)}>{METHODS.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>{t.path}<input maxLength={500} value={form.path} onChange={event => change('path', event.target.value)} /></label><label>{t.status}<input type="number" required min={200} max={599} step={1} value={form.statusCode} onChange={event => change('statusCode', event.target.value)} /></label><label>{t.contentType}<input maxLength={255} required value={form.contentType} onChange={event => change('contentType', event.target.value)} /></label></div><label className="mockManageBodyField">{t.body}<textarea rows={8} spellCheck={false} value={form.body} onChange={event => change('body', event.target.value)} /></label><p className="mockManageHint">{t.noBody}</p><label className="mockManageCheck"><input type="checkbox" checked={form.enabled} onChange={event => change('enabled', event.target.checked)} />{t.active}</label>{dirty && <p className="mockManageHint" role="status">{t.dirty}</p>}<div className="mockManageButtons"><button type="submit" disabled={busy || loading || !dirty || !form.name.trim()}>{busy ? t.saving : creating ? t.add : t.save}</button><button type="button" disabled={busy} onClick={cancel}>{t.cancel}</button>{selected && !creating && <><button type="button" disabled={busy} onClick={() => void toggle(selected)}>{selected.enabled ? t.toggleOff : t.toggleOn}</button><button type="button" className="mockManageDanger" disabled={busy} onClick={() => void remove(selected)}>{t.delete}</button></>}</div></form><p className="mockManageHint">{t.privacy}</p>
        </>}</section></div>
      </>}
    </div>
  </main>;
}
