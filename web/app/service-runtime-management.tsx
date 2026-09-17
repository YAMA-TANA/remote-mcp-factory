'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import type { ManagementProps } from './service-management-detail';
import './service-runtime-management.css';

type Data = Record<string, unknown>;
const record = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const string = (value: unknown): string => value === undefined || value === null ? '' : String(value);
const message = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason);
const field = (item: Data, camel: string, snake: string): string => string(item[camel] ?? item[snake]);
const active = (item: Data): boolean => item.enabled !== false && item.enabled !== 0 && item.enabled !== '0';
const url = (value: string): string | null => {
  try { const result = new URL(value); return ['http:', 'https:'].includes(result.protocol) && !result.username && !result.password ? result.toString() : null; }
  catch { return null; }
};
const date = (value: unknown, locale: string): string => {
  if (!value) return '—';
  const parsed = new Date(string(value));
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : '—';
};
const FUNCTION_COPY = {
  ja: { title: '関数エディター', sub: '保存すると公開エンドポイントのコードが更新されます。', endpoint: '公開エンドポイント', copy: 'URLをコピー', open: 'GETで開く', invoke: '開くと関数が実行され、呼び出し枠を消費します。GETでも副作用を持つコードがあり得ます。', name: '関数名', code: 'JavaScript ソース', bytes: 'ソースのサイズ', dirty: '未保存の変更', saved: '保存済み', save: 'コードと設定を保存', reset: '保存済みに戻す', enabled: '関数を有効にする', paused: '停止中のため公開URLは404を返します。', hint: 'Cloudflare Worker形式の `export default { async fetch(request) { ... } }` を使用します。', refresh: 'サーバーから再読み込み', delete: '関数を削除', confirm: '関数を完全に削除しますか？公開URLも無効になります。', discard: '未保存の変更を破棄してサーバーから読み込みますか？', invalid: '空でないJavaScriptソースを64 KiB以内で指定してください。', loading: '取得中…', success: '関数を保存しました。', close: '閉じる', updated: '最終更新', unavailable: '公開URLは取得できませんでした。' },
  en: { title: 'Function editor', sub: 'Saving updates the code behind your public endpoint.', endpoint: 'Public endpoint', copy: 'Copy URL', open: 'Open with GET', invoke: 'Opening executes your function and consumes an invocation. Even GET handlers may have side effects.', name: 'Function name', code: 'JavaScript source', bytes: 'Source size', dirty: 'Unsaved changes', saved: 'Saved', save: 'Save code and settings', reset: 'Reset to saved', enabled: 'Function enabled', paused: 'The public URL returns 404 while this function is paused.', hint: 'Use a Cloudflare Worker-style `export default { async fetch(request) { ... } }` handler.', refresh: 'Reload from server', delete: 'Delete function', confirm: 'Permanently delete this function and disable its public endpoint?', discard: 'Discard unsaved changes and reload the server version?', invalid: 'Provide nonempty JavaScript source no larger than 64 KiB.', loading: 'Loading…', success: 'Function saved.', close: 'Close', updated: 'Last updated', unavailable: 'Public endpoint unavailable.' },
  'zh-CN': { title: '函数编辑器', sub: '保存后会更新公开端点的代码。', endpoint: '公开端点', copy: '复制 URL', open: '使用 GET 打开', invoke: '打开会执行函数并消耗调用额度。GET 处理程序也可能有副作用。', name: '函数名称', code: 'JavaScript 源码', bytes: '源码大小', dirty: '未保存的修改', saved: '已保存', save: '保存代码和设置', reset: '恢复已保存版本', enabled: '启用函数', paused: '函数暂停时公开 URL 返回 404。', hint: '使用 Cloudflare Worker 格式的 `export default { async fetch(request) { ... } }`。', refresh: '从服务器重新加载', delete: '删除函数', confirm: '永久删除此函数并停用公开端点？', discard: '放弃未保存的修改并加载服务器版本？', invalid: '请提供不超过 64 KiB 的非空 JavaScript 源码。', loading: '加载中…', success: '函数已保存。', close: '关闭', updated: '最后更新', unavailable: '无法获取公开端点。' },
} as const;

type FunctionDraft = { name: string; code: string; enabled: boolean };
const functionDraft = (value: Data): FunctionDraft => ({ name: string(value.name), code: string(value.code), enabled: active(value) });

export function FunctionsManagementDetail({ resource, api, onClose, onChanged, copyValue }: ManagementProps) {
  const { locale } = useI18n(); const t = FUNCTION_COPY[locale];
  const id = string(resource.id); const base = `/api/picosvc/functions/apps/${encodeURIComponent(id)}`;
  const [current, setCurrent] = useState<Data>(resource);
  const [draft, setDraft] = useState<FunctionDraft>(() => functionDraft(resource));
  const [saved, setSaved] = useState<FunctionDraft>(() => functionDraft(resource));
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const dirty = draft.name !== saved.name || draft.code !== saved.code || draft.enabled !== saved.enabled;
  const codeBytes = new TextEncoder().encode(draft.code).byteLength;
  const endpoint = url(string(current.endpoint || resource.endpoint));

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = record((await api(base)).payload);
      if (!result || typeof result.code !== 'string') throw new Error('Invalid function detail response.');
      setCurrent(result); const next = functionDraft(result); setDraft(next); setSaved(next);
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [api, base]);
  useEffect(() => { void reload(); }, [reload]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || loading) return;
    if (!draft.name.trim() || !draft.code.trim() || codeBytes > 64 * 1024) { setError(t.invalid); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = record((await api(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) })).payload);
      if (!result) throw new Error('Invalid function update response.');
      const next = { ...draft, name: string(result.name || draft.name), enabled: result.enabled === undefined ? draft.enabled : active(result) };
      setSaved(next); setDraft(next); setCurrent(previous => ({ ...previous, ...result, code: next.code }));
      setNotice(t.success); onChanged();
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !window.confirm(t.confirm)) return;
    setBusy(true); setError('');
    try { await api(base, { method: 'DELETE' }); onChanged(); onClose(); }
    catch (reason) { setError(message(reason)); setBusy(false); }
  }
  async function refresh() { if (busy || loading) return; if (dirty && !window.confirm(t.discard)) return; await reload(); }
  return <section className="runtimeManager functionsManager" aria-label={t.title}>
    <header className="runtimeHeading"><div><span className="runtimeEyebrow">PICOSVC / FUNCTIONS</span><h2>{t.title}</h2><p>{t.sub}</p></div><button type="button" className="runtimeGhost" onClick={onClose}>{t.close} ×</button></header>
    {error && <p className="runtimeError" role="alert">{error}</p>}{notice && <p className="runtimeSuccess" role="status">{notice}</p>}
    <div className="runtimeFunctionTop"><section className="runtimePanel runtimeEndpoint"><h3>{t.endpoint}</h3>{endpoint ? <><code>{endpoint}</code><div className="runtimeActions"><button type="button" className="runtimeGhost" onClick={() => { void copyValue(endpoint); }}>{t.copy}</button>{draft.enabled && <a href={endpoint} target="_blank" rel="noopener noreferrer" className="runtimeLink">{t.open} ↗</a>}</div><small>{t.invoke}</small></> : <p>{t.unavailable}</p>}{!draft.enabled && <p className="runtimeHint">{t.paused}</p>}</section>
    <section className="runtimePanel runtimeFunctionMeta"><h3>{t.updated}</h3><strong>{date(current.updatedAt ?? current.updated_at, locale)}</strong><span className={dirty ? 'runtimeDirty' : 'runtimeSaved'} role="status">{dirty ? t.dirty : t.saved}</span><button type="button" className="runtimeGhost" disabled={busy || loading} onClick={() => { void refresh(); }}>{t.refresh}</button></section></div>
    <form className="runtimePanel runtimeEditor" onSubmit={event => { void save(event); }}><fieldset disabled={busy || loading}><div className="runtimeEditorHead"><h3>{t.code}</h3><span className={codeBytes > 64 * 1024 ? 'runtimeOverLimit' : ''}>{t.bytes}: {new Intl.NumberFormat(locale).format(codeBytes)} / 65,536 bytes</span></div>
      <label className="runtimeField">{t.name}<input required maxLength={200} value={draft.name} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))}/></label>
      <label className="runtimeField runtimeCodeLabel">{t.code}<textarea required rows={18} spellCheck={false} value={draft.code} onChange={event => setDraft(previous => ({ ...previous, code: event.target.value }))}/></label>
      <p className="runtimeHint">{t.hint}</p><label className="runtimeToggle"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(previous => ({ ...previous, enabled: event.target.checked }))}/>{t.enabled}</label>
      <div className="runtimeActions"><button type="submit" className="runtimePrimary" disabled={!dirty || codeBytes > 64 * 1024 || !draft.code.trim() || !draft.name.trim()}>{busy ? t.loading : t.save}</button><button type="button" className="runtimeGhost" disabled={!dirty} onClick={() => setDraft(saved)}>{t.reset}</button><button type="button" className="runtimeDanger" onClick={() => { void remove(); }}>{t.delete}</button></div>
    </fieldset></form>
  </section>;
}

const MONITOR_COPY = {
  ja: { title: 'ページ監視', sub: '最新のチェック時刻と検知した変更を確認します。', state: '監視状態', active: '監視中', paused: '停止中', latest: '最終チェック試行', changed: '最終変更検知', never: 'まだチェックされていません', noChanges: '記録された変更はありません', hash: '最新の内容フィンガープリント', hashEmpty: 'まだ取得されていません', schedule: '監視と通知の設定', name: '監視名', target: '監視対象URL', interval: 'チェック間隔（分）', minimum: 'プランの最短間隔', webhook: '変更通知Webhook（任意）', webhookHint: '空欄にすると変更通知を送りません。変更時の通知のみ対応します。', enabled: '監視を有効にする', save: '設定を保存', saved: '設定を保存しました。', reset: '元に戻す', reload: '最新の状態を取得', delete: '監視を削除', confirm: 'この監視を完全に削除しますか？', note: '最終チェック時刻は成功を保証しません。現行APIにはチェックごとの履歴・手動実行・エラー詳細はありません。', invalidUrl: '有効なHTTP(S) URLを指定してください。', invalidInterval: '許可された範囲内の整数分を指定してください。', loading: '取得中…', close: '閉じる' },
  en: { title: 'Page monitor', sub: 'Inspect the latest check attempt and recorded page change.', state: 'Monitor status', active: 'Monitoring', paused: 'Paused', latest: 'Last check attempted', changed: 'Last change detected', never: 'No checks yet', noChanges: 'No changes recorded', hash: 'Latest content fingerprint', hashEmpty: 'Not yet collected', schedule: 'Monitoring and notification settings', name: 'Monitor name', target: 'Target URL', interval: 'Check interval (minutes)', minimum: 'Plan minimum interval', webhook: 'Change notification webhook (optional)', webhookHint: 'Leave blank to disable change notifications. Only change events trigger a webhook.', enabled: 'Monitor enabled', save: 'Save settings', saved: 'Monitor settings saved.', reset: 'Reset changes', reload: 'Refresh status', delete: 'Delete monitor', confirm: 'Permanently delete this monitor?', note: 'The last-check timestamp does not prove a successful fetch. The API does not expose per-check history, manual checks or error details.', invalidUrl: 'Provide a valid HTTP(S) URL.', invalidInterval: 'Provide an integer interval within your plan limits.', loading: 'Loading…', close: 'Close' },
  'zh-CN': { title: '页面监控', sub: '查看最近检查尝试及已记录的页面变化。', state: '监控状态', active: '监控中', paused: '已暂停', latest: '最近检查尝试', changed: '最近检测到变化', never: '尚未检查', noChanges: '暂无变化记录', hash: '最新内容指纹', hashEmpty: '尚未获取', schedule: '监控和通知设置', name: '监控名称', target: '目标 URL', interval: '检查间隔（分钟）', minimum: '套餐最短间隔', webhook: '变化通知 Webhook（可选）', webhookHint: '留空则不发送变化通知。仅在检测到变化时发送。', enabled: '启用监控', save: '保存设置', saved: '已保存监控设置。', reset: '重置更改', reload: '刷新状态', delete: '删除监控', confirm: '永久删除此监控？', note: '最近检查时间并不代表抓取成功。当前 API 不提供逐次检查历史、手动检查或错误详情。', invalidUrl: '请输入有效的 HTTP(S) URL。', invalidInterval: '请输入套餐允许范围内的整数分钟。', loading: '加载中…', close: '关闭' },
} as const;

type MonitorDraft = { name: string; targetUrl: string; webhookUrl: string; intervalMinutes: string; enabled: boolean };
const monitorDraft = (value: Data): MonitorDraft => ({ name: string(value.name), targetUrl: field(value, 'targetUrl', 'target_url'), webhookUrl: field(value, 'webhookUrl', 'webhook_url'), intervalMinutes: field(value, 'intervalMinutes', 'interval_minutes') || '15', enabled: active(value) });

export function MonitorManagementDetail({ resource, api, onClose, onChanged }: ManagementProps) {
  const { locale } = useI18n(); const t = MONITOR_COPY[locale];
  const id = string(resource.id); const base = `/api/picosvc/monitor/${encodeURIComponent(id)}`;
  const [current, setCurrent] = useState<Data>(resource);
  const [draft, setDraft] = useState<MonitorDraft>(() => monitorDraft(resource));
  const [saved, setSaved] = useState<MonitorDraft>(() => monitorDraft(resource));
  const [minimum, setMinimum] = useState(5); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const dirty = Object.keys(draft).some(key => draft[key as keyof MonitorDraft] !== saved[key as keyof MonitorDraft]);
  const target = url(draft.targetUrl); const webhook = draft.webhookUrl.trim() ? url(draft.webhookUrl) : null;
  const validInterval = Number.isSafeInteger(Number(draft.intervalMinutes)) && Number(draft.intervalMinutes) >= minimum && Number(draft.intervalMinutes) <= 10080;
  const reload = useCallback(async (resetDraft = false) => {
    setLoading(true); setError('');
    try {
      const response = record((await api('/api/picosvc/monitor')).payload);
      const items = response?.monitors;
      if (!Array.isArray(items)) throw new Error('Invalid monitor list response.');
      const found = items.find((item: unknown) => record(item)?.id === id);
      const next = record(found);
      if (!next) throw new Error('Monitor not found.');
      setCurrent(next);
      const planMin = Number(response?.minIntervalMinutes);
      setMinimum(Number.isSafeInteger(planMin) && planMin >= 1 ? planMin : 5);
      if (resetDraft) { const nextDraft = monitorDraft(next); setDraft(nextDraft); setSaved(nextDraft); }
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [api, id]);
  useEffect(() => { void reload(true); }, [reload]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || loading) return;
    if (!target || (draft.webhookUrl.trim() && !webhook)) { setError(t.invalidUrl); return; }
    if (!validInterval || !draft.name.trim()) { setError(t.invalidInterval); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { name: draft.name, targetUrl: target, webhookUrl: webhook, intervalMinutes: Number(draft.intervalMinutes), enabled: draft.enabled };
      const result = record((await api(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).payload);
      if (!result) throw new Error('Invalid monitor update response.');
      const next = { ...draft, intervalMinutes: string(result.intervalMinutes ?? draft.intervalMinutes) };
      setDraft(next); setSaved(next);
      setCurrent(previous => ({ ...previous, name: draft.name, target_url: target, webhook_url: webhook, interval_minutes: Number(next.intervalMinutes), enabled: result.enabled ?? draft.enabled }));
      setNotice(t.saved); onChanged();
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !window.confirm(t.confirm)) return;
    setBusy(true); setError('');
    try { await api(base, { method: 'DELETE' }); onChanged(); onClose(); }
    catch (reason) { setError(message(reason)); setBusy(false); }
  }
  const checked = current.last_checked_at ?? current.lastCheckedAt;
  const changed = current.last_changed_at ?? current.lastChangedAt;
  const fingerprint = string(current.last_hash ?? current.lastHash);
  return <section className="runtimeManager monitorManager" aria-label={t.title}>
    <header className="runtimeHeading"><div><span className="runtimeEyebrow">PICOSVC / MONITOR</span><h2>{t.title}</h2><p>{t.sub}</p></div><button type="button" className="runtimeGhost" onClick={onClose}>{t.close} ×</button></header>
    {error && <p className="runtimeError" role="alert">{error}</p>}{notice && <p className="runtimeSuccess" role="status">{notice}</p>}
    <div className="runtimeMonitorStats"><div className="runtimePanel runtimeStatus"><span>{t.state}</span><strong className={active(current) ? 'runtimeSaved' : 'runtimeDirty'}>{active(current) ? t.active : t.paused}</strong><small>{string(current.name)}</small></div><div className="runtimePanel"><span>{t.latest}</span><strong>{checked ? date(checked, locale) : t.never}</strong></div><div className="runtimePanel"><span>{t.changed}</span><strong>{changed ? date(changed, locale) : t.noChanges}</strong></div></div>
    <div className="runtimeMonitorColumns"><form className="runtimePanel runtimeSettings" onSubmit={event => { void save(event); }}><fieldset disabled={busy || loading}><h3>{t.schedule}</h3><label className="runtimeField">{t.name}<input required maxLength={200} value={draft.name} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))}/></label><label className="runtimeField">{t.target}<input required type="url" value={draft.targetUrl} onChange={event => setDraft(previous => ({ ...previous, targetUrl: event.target.value }))}/></label><div className="runtimeTwoFields"><label className="runtimeField">{t.interval}<input required type="number" step={1} min={minimum} max={10080} value={draft.intervalMinutes} onChange={event => setDraft(previous => ({ ...previous, intervalMinutes: event.target.value }))}/></label><p className="runtimeHint">{t.minimum}: {minimum} min</p></div><label className="runtimeField">{t.webhook}<input type="url" placeholder="https://example.com/changes" value={draft.webhookUrl} onChange={event => setDraft(previous => ({ ...previous, webhookUrl: event.target.value }))}/></label><p className="runtimeHint">{t.webhookHint}</p><label className="runtimeToggle"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(previous => ({ ...previous, enabled: event.target.checked }))}/>{t.enabled}</label><div className="runtimeActions"><button type="submit" className="runtimePrimary" disabled={!dirty || !target || Boolean(draft.webhookUrl.trim() && !webhook) || !validInterval || !draft.name.trim()}>{busy ? t.loading : t.save}</button><button type="button" className="runtimeGhost" disabled={!dirty} onClick={() => setDraft(saved)}>{t.reset}</button><button type="button" className="runtimeDanger" onClick={() => { void remove(); }}>{t.delete}</button></div></fieldset></form>
    <aside className="runtimePanel runtimeMonitorInfo"><h3>{t.hash}</h3><code>{fingerprint ? `${fingerprint.slice(0, 16)}…${fingerprint.slice(-8)}` : t.hashEmpty}</code><button type="button" className="runtimeGhost" disabled={busy || loading} onClick={() => { void reload(false); }}>{loading ? t.loading : t.reload}</button><p className="runtimeHint">{t.note}</p></aside></div>
  </section>;
}
