'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { useI18n } from './i18n';
import { mockRequestBody, type MockFormValues } from './mock-form';
import './mock-app-workspace.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
type Endpoint = { id: string; name: string; method: string; path: string; statusCode: number; contentType: string; body: string; enabled: boolean; endpoint: string; updatedAt: string };
type Rule = { id: string; name: string; priority: number; method: string | null; pathGlob: string | null; bodyContains: string | null; statusCode: number; contentType: string; body: string; delayMs: number; failurePercent: number; enabled: boolean };
type RequestEntry = { id: string; ruleId: string | null; method: string; path: string; responseStatus: number; sizeBytes: number; receivedAt: string };
type RuleDraft = { name: string; priority: string; method: string; pathGlob: string; bodyContains: string; statusCode: string; contentType: string; body: string; delayMs: string; failurePercent: string; enabled: boolean };
const EMPTY: MockFormValues = { name: '', method: 'GET', path: '', statusCode: '200', contentType: 'application/json; charset=utf-8', body: '{\n  "ok": true\n}', enabled: true };
const EMPTY_RULE: RuleDraft = { name: '', priority: '100', method: '', pathGlob: '', bodyContains: '', statusCode: '200', contentType: 'application/json; charset=utf-8', body: '{\n  "ok": true\n}', delayMs: '0', failurePercent: '0', enabled: true };
const COPY = {
  ja: { title: 'Mock API 管理', intro: 'エンドポイント別に応答、条件分岐ルール、受信履歴を管理します。', signIn: 'ログインして管理する', endpoints: 'エンドポイント', create: '新規作成', select: '左の一覧からエンドポイントを選択してください。', empty: 'エンドポイントはまだありません。', name: '名前', method: 'HTTPメソッド', path: 'パス', status: '応答ステータス', type: 'Content-Type', body: '応答本文', enabled: '有効にする', save: '保存', cancel: '編集を破棄', remove: 'エンドポイントを削除', confirmRemove: 'このエンドポイントとルール・履歴を削除しますか？元に戻せません。', copied: 'URLをコピーしました。', copy: '接続URLをコピー', refresh: '更新', rules: '条件分岐ルール', ruleName: 'ルール名', priority: '優先順位（小さい順）', anyMethod: 'すべてのメソッド', glob: 'パス条件（任意・*使用可）', contains: '本文に含む文字列（任意）', delay: '応答遅延（ミリ秒）', failure: 'エラー注入率（%）', newRule: 'ルール追加', editRule: 'ルールを編集', saveRule: 'ルールを保存', deleteRule: 'ルール削除', confirmRule: 'このルールを削除しますか？', noRules: '条件分岐ルールはありません。', requests: '直近の受信履歴', requestNote: '直近最大100件。リクエスト本文・ヘッダーはこの画面に表示しません。', noRequests: 'まだリクエストはありません。', received: '受信日時', size: '受信サイズ', busy: '処理中…', invalid: '入力値を確認してください。', limit: '作成上限に達しました。', responseNote: 'HTMLもこの画面では実行せず、テキストとして編集します。', ruleHint: 'ルールは優先順位順に評価されます。適用条件が一致しない場合は基本応答を返します。' },
  en: { title: 'Mock API management', intro: 'Manage each endpoint, conditional response rules and recent requests.', signIn: 'Sign in to manage', endpoints: 'Endpoints', create: 'New endpoint', select: 'Select an endpoint from the list.', empty: 'No endpoints yet.', name: 'Name', method: 'HTTP method', path: 'Path', status: 'Response status', type: 'Content-Type', body: 'Response body', enabled: 'Enable endpoint', save: 'Save', cancel: 'Discard changes', remove: 'Delete endpoint', confirmRemove: 'Delete this endpoint, its rules and history permanently?', copied: 'URL copied.', copy: 'Copy endpoint URL', refresh: 'Refresh', rules: 'Conditional response rules', ruleName: 'Rule name', priority: 'Priority (lower first)', anyMethod: 'Any method', glob: 'Path condition (optional; * supported)', contains: 'Body contains (optional)', delay: 'Response delay (ms)', failure: 'Injected failure rate (%)', newRule: 'Add rule', editRule: 'Edit rule', saveRule: 'Save rule', deleteRule: 'Delete rule', confirmRule: 'Delete this rule?', noRules: 'No response rules yet.', requests: 'Recent requests', requestNote: 'Latest 100 only. Request bodies and headers are not shown here.', noRequests: 'No requests yet.', received: 'Received', size: 'Request size', busy: 'Working…', invalid: 'Check the input values.', limit: 'Endpoint limit reached.', responseNote: 'HTML responses are edited as text, never executed in this console.', ruleHint: 'Rules run in priority order. If none matches, the endpoint returns its default response.' },
  'zh-CN': { title: 'Mock API 管理', intro: '分别管理端点、条件响应规则与请求记录。', signIn: '登录以管理', endpoints: '端点', create: '新建端点', select: '请从列表选择端点。', empty: '暂无端点。', name: '名称', method: 'HTTP 方法', path: '路径', status: '响应状态码', type: 'Content-Type', body: '响应正文', enabled: '启用端点', save: '保存', cancel: '放弃修改', remove: '删除端点', confirmRemove: '永久删除端点、规则和历史记录？', copied: '已复制地址。', copy: '复制端点地址', refresh: '刷新', rules: '条件响应规则', ruleName: '规则名称', priority: '优先级（小值优先）', anyMethod: '所有方法', glob: '路径条件（可选，支持*）', contains: '正文包含（可选）', delay: '响应延迟（毫秒）', failure: '故障注入率（%）', newRule: '添加规则', editRule: '编辑规则', saveRule: '保存规则', deleteRule: '删除规则', confirmRule: '删除此规则？', noRules: '暂无条件规则。', requests: '最近请求', requestNote: '最多最近100条。此界面不展示请求正文或头部。', noRequests: '暂无请求。', received: '接收时间', size: '请求大小', busy: '处理中…', invalid: '请检查输入值。', limit: '已达到端点数量上限。', responseNote: 'HTML响应仅以文本形式编辑，不会在控制台执行。', ruleHint: '规则按优先级执行，无匹配规则则返回默认响应。' },
} as const;
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function fromEndpoint(item: Endpoint): MockFormValues { return { name: item.name, method: item.method, path: item.path, statusCode: String(item.statusCode), contentType: item.contentType, body: item.body, enabled: item.enabled }; }
function fromRule(item: Rule): RuleDraft { return { name: item.name, priority: String(item.priority), method: item.method || '', pathGlob: item.pathGlob || '', bodyContains: item.bodyContains || '', statusCode: String(item.statusCode), contentType: item.contentType, body: item.body, delayMs: String(item.delayMs), failurePercent: String(item.failurePercent), enabled: item.enabled }; }
function validRule(form: RuleDraft): Record<string, unknown> {
  const priority = Number(form.priority); const statusCode = Number(form.statusCode); const delayMs = Number(form.delayMs); const failurePercent = Number(form.failurePercent);
  if (!form.name.trim() || form.name.length > 120 || !Number.isSafeInteger(priority) || priority < -100000 || priority > 100000 || !Number.isSafeInteger(statusCode) || statusCode < 200 || statusCode > 599 || !Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 5000 || !Number.isFinite(failurePercent) || failurePercent < 0 || failurePercent > 100 || (form.method && !METHODS.includes(form.method)) || form.pathGlob.length > 500 || form.bodyContains.length > 2000 || !form.contentType.trim() || form.contentType.length > 255 || new TextEncoder().encode(form.body).byteLength > 256 * 1024) throw new Error('Invalid rule configuration.');
  if ((form.method === 'HEAD' || [204, 205, 304].includes(statusCode)) && form.body.trim()) throw new Error('HEAD, 204, 205 and 304 responses cannot have a body.');
  return { name: form.name.trim(), priority, method: form.method || null, pathGlob: form.pathGlob.trim() || null, bodyContains: form.bodyContains || null, statusCode, contentType: form.contentType.trim(), body: form.body, delayMs, failurePercent, enabled: form.enabled };
}

export default function MockAppWorkspace() {
  const { locale } = useI18n(); const t = COPY[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null); const [signedIn, setSignedIn] = useState(false);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]); const [limit, setLimit] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState(''); const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MockFormValues>(EMPTY); const [rules, setRules] = useState<Rule[]>([]); const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleDraft>(EMPTY_RULE); const [editingRule, setEditingRule] = useState(''); const [showRuleForm, setShowRuleForm] = useState(false);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const requestSequence = useRef(0);
  const selected = endpoints.find(entry => entry.id === selectedId);
  useEffect(() => {
    if (!CLERK_KEY) { setError('Clerk publishable key is not configured.'); return; }
    let active = true; let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: Constructor }) => {
      const instance = new Constructor(CLERK_KEY); await instance.load({ ui }); if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn));
      unsubscribe = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (active) setError(message(reason)); });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  async function api(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!API) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    const token = await clerk?.session?.getToken(); if (!token) throw new Error(t.signIn);
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers });
    if (response.status === 204) return null;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) { const record = payload && typeof payload === 'object' ? payload as { error?: string } : null; throw new Error(record?.error || `HTTP ${response.status}`); }
    return payload;
  }
  async function refresh(preferredId?: string) {
    const result = await api('/api/picosvc/mock/endpoints') as { endpoints?: Endpoint[]; limit?: number | null };
    if (!Array.isArray(result?.endpoints)) throw new Error('Invalid Mock endpoint list response.');
    setEndpoints(result.endpoints); setLimit(typeof result.limit === 'number' ? result.limit : null);
    setSelectedId(old => { const desired = preferredId ?? old; return result.endpoints!.some(item => item.id === desired) ? desired : result.endpoints![0]?.id || ''; });
  }
  useEffect(() => {
    if (!clerk || !signedIn) { requestSequence.current += 1; setEndpoints([]); setSelectedId(''); setRules([]); setRequests([]); return; }
    setLoading(true); refresh().catch(reason => setError(message(reason))).finally(() => setLoading(false));
  }, [clerk, signedIn]);
  useEffect(() => {
    if (!selectedId || !signedIn || !clerk) { requestSequence.current += 1; setRules([]); setRequests([]); return; }
    const sequence = ++requestSequence.current; setLoading(true);
    Promise.all([api(`/api/picosvc/mock/endpoints/${encodeURIComponent(selectedId)}/rules`), api(`/api/picosvc/mock/endpoints/${encodeURIComponent(selectedId)}/requests?limit=100`)]).then(([rulesPayload, requestsPayload]) => {
      const ruleList = rulesPayload as { rules?: Rule[] }; const requestList = requestsPayload as { requests?: RequestEntry[] };
      if (!Array.isArray(ruleList?.rules) || !Array.isArray(requestList?.requests)) throw new Error('Invalid Mock rules or request history response.');
      if (sequence === requestSequence.current) { setRules(ruleList.rules); setRequests(requestList.requests); }
    }).catch(reason => { if (sequence === requestSequence.current) setError(message(reason)); }).finally(() => { if (sequence === requestSequence.current) setLoading(false); });
    return () => { requestSequence.current += 1; };
  }, [selectedId, clerk, signedIn]);
  function select(item: Endpoint) { setSelectedId(item.id); setCreating(false); setForm(fromEndpoint(item)); setEditingRule(''); setShowRuleForm(false); setError(''); setNotice(''); }
  function startCreate() { setCreating(true); setForm({ ...EMPTY }); setEditingRule(''); setShowRuleForm(false); setError(''); setNotice(''); }
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await work(); } catch (reason) { setError(message(reason)); } finally { setBusy(false); } }
  async function saveEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); await run(async () => {
      const body = mockRequestBody(form); const path = creating ? '/api/picosvc/mock/endpoints' : `/api/picosvc/mock/endpoints/${encodeURIComponent(selectedId)}`;
      const payload = await api(path, { method: creating ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const response = payload as { endpoint?: Endpoint } | Endpoint;
      const updated = creating ? (response as { endpoint?: Endpoint }).endpoint : response as Endpoint;
      if (!updated?.id) throw new Error('Invalid Mock save response.');
      await refresh(updated.id); setForm(fromEndpoint(updated)); setCreating(false); setNotice(t.save);
    });
  }
  async function removeEndpoint() {
    if (!selected || !window.confirm(t.confirmRemove)) return;
    await run(async () => { await api(`/api/picosvc/mock/endpoints/${encodeURIComponent(selected.id)}`, { method: 'DELETE' }); setRules([]); setRequests([]); await refresh(''); setCreating(false); setNotice(t.remove); });
  }
  async function toggleEndpoint() {
    if (!selected) return;
    await run(async () => { const updated = await api(`/api/picosvc/mock/endpoints/${encodeURIComponent(selected.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !selected.enabled }) }) as Endpoint; await refresh(selected.id); setForm(fromEndpoint(updated)); });
  }
  function editRule(rule?: Rule) { setRuleForm(rule ? fromRule(rule) : { ...EMPTY_RULE }); setEditingRule(rule?.id || ''); setShowRuleForm(true); setError(''); }
  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    await run(async () => {
      const body = validRule(ruleForm); const path = `/api/picosvc/mock/endpoints/${encodeURIComponent(selected.id)}/rules${editingRule ? `/${encodeURIComponent(editingRule)}` : ''}`;
      await api(path, { method: editingRule ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await api(`/api/picosvc/mock/endpoints/${encodeURIComponent(selected.id)}/rules`) as { rules?: Rule[] };
      if (!Array.isArray(result?.rules)) throw new Error('Invalid Mock rules response.');
      setRules(result.rules); setEditingRule(''); setShowRuleForm(false); setNotice(t.saveRule);
    });
  }
  async function removeRule(rule: Rule) {
    if (!selected || !window.confirm(t.confirmRule)) return;
    await run(async () => { await api(`/api/picosvc/mock/endpoints/${encodeURIComponent(selected.id)}/rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' }); setRules(previous => previous.filter(entry => entry.id !== rule.id)); setShowRuleForm(false); setNotice(t.deleteRule); });
  }
  async function copyEndpoint() { if (!selected) return; try { await navigator.clipboard.writeText(selected.endpoint); setNotice(t.copied); } catch (reason) { setError(message(reason)); } }
  function date(value: string) { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(parsed) : '—'; }
  return <main className="mockConsole shell" aria-label={t.title}>
    <header className="mockConsoleHeading"><div><span className="kicker">PICOSVC / MOCK</span><h1>{t.title}</h1><p>{t.intro}</p></div>{signedIn && <button type="button" className="ghost" disabled={busy || loading} onClick={() => { void run(() => refresh()); }}>{t.refresh}</button>}</header>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    {!signedIn ? <section className="mockConsolePanel"><button type="button" className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></section> : <div className="mockConsoleLayout">
      <aside className="mockConsolePanel"><div className="mockConsoleSectionHead"><h2>{t.endpoints} <small>{endpoints.length} / {limit ?? '∞'}</small></h2><button type="button" className="secondary" disabled={busy || (limit !== null && endpoints.length >= limit)} onClick={startCreate}>{t.create}</button></div>{endpoints.length === 0 ? <p>{t.empty}</p> : <div className="mockConsoleList">{endpoints.map(item => <button key={item.id} type="button" className={item.id === selectedId && !creating ? 'selected' : ''} aria-pressed={item.id === selectedId && !creating} onClick={() => select(item)}><strong>{item.name}</strong><span>{item.method} · {item.statusCode} · {item.enabled ? 'ON' : 'OFF'}</span></button>)}</div>}</aside>
      <div className="mockConsoleDetails">{creating || selected ? <>
        <section className="mockConsolePanel"><div className="mockConsoleSectionHead"><h2>{creating ? t.create : selected?.name}</h2>{!creating && selected && <button className="ghost" type="button" onClick={() => { void copyEndpoint(); }}>{t.copy}</button>}</div>{!creating && selected && <p className="mockConsoleAddress"><code>{selected.endpoint}</code></p>}
          <form className="mockConsoleForm" onSubmit={event => { void saveEndpoint(event); }}><div className="mockConsoleFields"><label>{t.name}<input required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>{t.method}<select value={form.method} onChange={event => setForm({ ...form, method: event.target.value })}>{METHODS.map(method => <option key={method}>{method}</option>)}</select></label><label>{t.path}<input maxLength={500} value={form.path} onChange={event => setForm({ ...form, path: event.target.value })}/></label><label>{t.status}<input type="number" min={200} max={599} step={1} required value={form.statusCode} onChange={event => setForm({ ...form, statusCode: event.target.value })}/></label><label>{t.type}<input required maxLength={255} value={form.contentType} onChange={event => setForm({ ...form, contentType: event.target.value })}/></label></div><label>{t.body}<textarea rows={8} spellCheck={false} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })}/></label><p className="mockConsoleHint">{t.responseNote}</p><label className="mockConsoleCheck"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })}/>{t.enabled}</label><div className="mockConsoleActions"><button type="submit" className="primary" disabled={busy}>{busy ? t.busy : t.save}</button><button type="button" className="ghost" disabled={busy} onClick={() => { setCreating(false); if (selected) setForm(fromEndpoint(selected)); }}>{t.cancel}</button>{!creating && selected && <button type="button" className="ghost" disabled={busy} onClick={() => { void toggleEndpoint(); }}>{selected.enabled ? 'Pause' : 'Resume'}</button>}{!creating && <button type="button" className="mockConsoleDanger" disabled={busy} onClick={() => { void removeEndpoint(); }}>{t.remove}</button>}</div></form>
        </section>
        {!creating && selected && <><section className="mockConsolePanel"><div className="mockConsoleSectionHead"><h2>{t.rules} <small>{rules.length}</small></h2><button type="button" className="secondary" disabled={busy} onClick={() => editRule()}>{t.newRule}</button></div><p className="mockConsoleHint">{t.ruleHint}</p>{!loading && rules.length === 0 && <p>{t.noRules}</p>}{rules.map(rule => <div className="mockConsoleItem" key={rule.id}><div><strong>{rule.name}</strong><p>{rule.priority} · {rule.method || '*'} · HTTP {rule.statusCode} · {rule.enabled ? 'ON' : 'OFF'}</p></div><button type="button" className="ghost" disabled={busy} onClick={() => editRule(rule)}>{t.editRule}</button><button type="button" className="ghost" disabled={busy} onClick={() => { void removeRule(rule); }}>{t.deleteRule}</button></div>)}
          {showRuleForm && <form className="mockConsoleForm mockRuleForm" onSubmit={event => { void saveRule(event); }}><h3>{editingRule ? t.editRule : t.newRule}</h3><div className="mockConsoleFields"><label>{t.ruleName}<input required maxLength={120} value={ruleForm.name} onChange={event => setRuleForm({ ...ruleForm, name: event.target.value })}/></label><label>{t.priority}<input type="number" required step={1} min={-100000} max={100000} value={ruleForm.priority} onChange={event => setRuleForm({ ...ruleForm, priority: event.target.value })}/></label><label>{t.method}<select value={ruleForm.method} onChange={event => setRuleForm({ ...ruleForm, method: event.target.value })}><option value="">{t.anyMethod}</option>{METHODS.map(method => <option key={method}>{method}</option>)}</select></label><label>{t.glob}<input maxLength={500} value={ruleForm.pathGlob} onChange={event => setRuleForm({ ...ruleForm, pathGlob: event.target.value })}/></label><label>{t.contains}<input maxLength={2000} value={ruleForm.bodyContains} onChange={event => setRuleForm({ ...ruleForm, bodyContains: event.target.value })}/></label><label>{t.status}<input required type="number" min={200} max={599} value={ruleForm.statusCode} onChange={event => setRuleForm({ ...ruleForm, statusCode: event.target.value })}/></label><label>{t.type}<input required maxLength={255} value={ruleForm.contentType} onChange={event => setRuleForm({ ...ruleForm, contentType: event.target.value })}/></label><label>{t.delay}<input required type="number" min={0} max={5000} value={ruleForm.delayMs} onChange={event => setRuleForm({ ...ruleForm, delayMs: event.target.value })}/></label><label>{t.failure}<input required type="number" step="0.1" min={0} max={100} value={ruleForm.failurePercent} onChange={event => setRuleForm({ ...ruleForm, failurePercent: event.target.value })}/></label></div><label>{t.body}<textarea rows={5} spellCheck={false} value={ruleForm.body} onChange={event => setRuleForm({ ...ruleForm, body: event.target.value })}/></label><label className="mockConsoleCheck"><input type="checkbox" checked={ruleForm.enabled} onChange={event => setRuleForm({ ...ruleForm, enabled: event.target.checked })}/>{t.enabled}</label><div className="mockConsoleActions"><button type="submit" className="primary" disabled={busy}>{busy ? t.busy : t.saveRule}</button><button type="button" className="ghost" onClick={() => setShowRuleForm(false)}>{t.cancel}</button></div></form>}
        </section><section className="mockConsolePanel"><div className="mockConsoleSectionHead"><h2>{t.requests} <small>{requests.length} / 100</small></h2><button type="button" className="ghost" disabled={loading || busy} onClick={() => { setSelectedId(''); queueMicrotask(() => setSelectedId(selected.id)); }}>{t.refresh}</button></div><p className="mockConsoleHint">{t.requestNote}</p>{loading ? <p role="status">{t.busy}</p> : requests.length === 0 ? <p>{t.noRequests}</p> : <div className="mockConsoleHistory">{requests.map(entry => <div key={entry.id} className="mockConsoleItem"><strong>{entry.method} {entry.path || '/'}</strong><span>HTTP {entry.responseStatus}</span><span>{entry.sizeBytes} B</span><time>{date(entry.receivedAt)}</time></div>)}</div>}</section></>}
      </> : <section className="mockConsolePanel"><p>{t.select}</p><button type="button" className="secondary" onClick={startCreate}>{t.create}</button></section>}</div>
    </div>}
  </main>;
}
