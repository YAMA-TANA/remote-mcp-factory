'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import type { GenericServiceSlug } from './service-data';
import './service-forms-management.css';

type Data = Record<string, unknown>;
type Props = { service: GenericServiceSlug; resource: Data; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type Lang = 'ja' | 'en' | 'zh-CN';
type Settings = { allowedOrigins: string; requiredFields: string; honeypotField: string; webhookUrl: string; successRedirect: string; requireTurnstile: boolean };
const API_ORIGIN = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const data = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const string = (value: unknown): string => value === undefined || value === null ? '' : String(value);
const errorMessage = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason);
const formDate = (value: unknown, locale: Lang): string => {
  const date = new Date(string(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
};
const lines = (value: string): string[] => value.split(/[\n,]/).map(part => part.trim()).filter(Boolean);
const fieldName = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
function exactHttpsOrigin(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; }
  catch { return false; }
}
function publicHttpUrl(value: string): boolean {
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; }
  catch { return false; }
}
const EMPTY: Settings = { allowedOrigins: '', requiredFields: '', honeypotField: '_website', webhookUrl: '', successRedirect: '', requireTurnstile: false };
function parseSettings(raw: Data): Settings {
  return {
    allowedOrigins: Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins.filter(v => typeof v === 'string').join('\n') : '',
    requiredFields: Array.isArray(raw.requiredFields) ? raw.requiredFields.filter(v => typeof v === 'string').join('\n') : '',
    honeypotField: string(raw.honeypotField) || '_website',
    webhookUrl: string(raw.webhookUrl), successRedirect: string(raw.successRedirect), requireTurnstile: raw.requireTurnstile === true,
  };
}
const COPY: Record<Lang, Record<string, string>> = {
  ja: { title: 'フォームの受信・保護設定', intro: '公開送信先・スパム対策・受信履歴をまとめて管理します。', endpoint: '公開POST送信先', copy: 'URLをコピー', method: 'JSON または application/x-www-form-urlencoded をPOSTしてください。', settings: '送信ルールと通知', origins: '許可するHTTPSオリジン（1行に1件）', originsHint: '空欄はオリジン制限なし。Originヘッダーの制限は認証ではありません。', fields: '必須フィールド名（1行に1件）', honey: 'ハニーポットのフィールド名', honeyHint: '通常のユーザーには非表示の空欄をフォームに置いてください。入力があると受理扱いで破棄します。', webhook: '送信時Webhook（任意）', redirect: '送信成功後のリダイレクトURL（任意）', redirectHint: 'HTMLをAcceptするリクエストのみ303で転送します。JSONの送信は202を返します。', turnstile: 'Cloudflare Turnstileの検証を必須にする', turnstileHint: 'WorkerにTURNSTILE_SECRET_KEYが必要です。フォーム側からcf-turnstile-responseを送ってください。', protect: '設定を保存すると保護ルールが有効になります。未設定のフォームは従来の基本的な受信処理を使います。', save: '設定を保存', saved: '設定を保存しました。', reload: '設定を読み直す', discard: '未保存の変更を破棄しますか？', invalid: 'オリジン・フィールド名・URLと件数制限を確認してください。', submissions: '受信データ', search: '送信内容を検索（最大100文字）', find: '検索', more: '古いデータを読み込む', empty: '一致する投稿がありません。', export: 'CSVをダウンロード', exportHint: '検索条件に一致する新しい順の最大500件を出力します。全件ではありません。', deliveries: 'Webhook配信履歴', deliveriesHint: '直近最大100件。配信失敗は自動再試行されません。', noDelivery: 'Webhookの配信履歴はありません。', status: 'HTTP結果', error: 'エラー', refresh: '更新', delete: 'フォームを完全に削除', confirm: 'フォームと受信データを削除しますか？元に戻せません。', close: '閉じる', loading: '処理中…', limited: '受信履歴は100件ずつ読み込めます。同時刻の投稿も投稿IDを使って順番に取得します。', noEndpoint: '公開URLを確認できません。' },
  en: { title: 'Form inbox & protection', intro: 'Manage your public endpoint, abuse controls and submissions.', endpoint: 'Public POST endpoint', copy: 'Copy URL', method: 'POST JSON or application/x-www-form-urlencoded.', settings: 'Submission rules and delivery', origins: 'Allowed HTTPS origins (one per line)', originsHint: 'Blank allows any origin. Checking the Origin header is not authentication.', fields: 'Required field names (one per line)', honey: 'Honeypot field name', honeyHint: 'Add a hidden, empty field to your HTML form. A nonempty value is silently discarded.', webhook: 'Submission webhook (optional)', redirect: 'Success redirect URL (optional)', redirectHint: 'Only requests accepting HTML receive a 303 redirect. JSON submissions receive HTTP 202.', turnstile: 'Require Cloudflare Turnstile verification', turnstileHint: 'Configure TURNSTILE_SECRET_KEY on the Worker and submit cf-turnstile-response from your form.', protect: 'Save settings to activate protection. Unconfigured forms still use the legacy basic submission handler.', save: 'Save settings', saved: 'Settings saved.', reload: 'Reload settings', discard: 'Discard unsaved settings?', invalid: 'Check HTTPS origins, field names, URL formats and entry limits.', submissions: 'Submissions', search: 'Search submission data (max 100 characters)', find: 'Search', more: 'Load older submissions', empty: 'No matching submissions.', export: 'Download CSV', exportHint: 'Exports up to 500 latest matches for the current search, not all submissions.', deliveries: 'Webhook deliveries', deliveriesHint: 'Latest 100 attempts; failed deliveries are not automatically retried.', noDelivery: 'No webhook deliveries recorded.', status: 'HTTP result', error: 'Error', refresh: 'Refresh', delete: 'Permanently delete form', confirm: 'Delete this form and its submissions? This cannot be undone.', close: 'Close', loading: 'Working…', limited: 'Load submissions in pages of 100, including entries that share the same timestamp.', noEndpoint: 'Public endpoint unavailable.' },
  'zh-CN': { title: '表单收件箱与安全设置', intro: '集中管理公开端点、防滥用规则和提交记录。', endpoint: '公开 POST 端点', copy: '复制 URL', method: '通过 POST 提交 JSON 或 application/x-www-form-urlencoded。', settings: '提交规则与通知', origins: '允许的 HTTPS 来源（每行一个）', originsHint: '留空不限制来源。检查 Origin 请求头不等于身份认证。', fields: '必填字段（每行一个）', honey: '蜜罐字段名称', honeyHint: '在表单中添加对普通用户隐藏的空字段。非空提交会被静默丢弃。', webhook: '提交 Webhook（可选）', redirect: '成功后的跳转 URL（可选）', redirectHint: '仅接受 HTML 的请求会收到303跳转；JSON提交返回202。', turnstile: '强制验证 Cloudflare Turnstile', turnstileHint: '须先在 Worker 设置 TURNSTILE_SECRET_KEY，表单需发送cf-turnstile-response。', protect: '保存配置后防护规则才生效。未配置的表单仍使用旧版基础接收逻辑。', save: '保存设置', saved: '设置已保存。', reload: '重新加载配置', discard: '放弃未保存的设置？', invalid: '请检查 HTTPS 来源、字段名、URL 格式与条目数。', submissions: '提交记录', search: '搜索提交内容（最多100字符）', find: '搜索', more: '加载更早的记录', empty: '没有匹配的提交。', export: '下载 CSV', exportHint: '按当前搜索条件导出最新最多500条，并非全部记录。', deliveries: 'Webhook 投递记录', deliveriesHint: '最多显示最近100次；失败的投递不会自动重试。', noDelivery: '暂无 Webhook 投递记录。', status: 'HTTP结果', error: '错误', refresh: '刷新', delete: '永久删除表单', confirm: '删除此表单及其提交记录？无法恢复。', close: '关闭', loading: '处理中…', limited: '每页加载100条记录，同一时间戳的记录也会按ID依次获取。', noEndpoint: '无法获取公开端点。' },
};

export default function FormsManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const id = string(resource.id);
  const base = `/api/picosvc/forms/${encodeURIComponent(id)}`;
  const publicId = string(resource.public_id ?? resource.publicId);
  let endpoint = '';
  try { const origin = new URL(API_ORIGIN).origin; if (/^[a-f0-9]{32}$/i.test(publicId)) endpoint = `${origin}/forms/${publicId}`; } catch { /* No configured Worker URL. */ }
  const [saved, setSaved] = useState<Settings>(EMPTY);
  const [draft, setDraft] = useState<Settings>(EMPTY);
  const [submissions, setSubmissions] = useState<Data[]>([]);
  const [deliveries, setDeliveries] = useState<Data[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [nextBefore, setNextBefore] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const withQuery = (path: string, q: string, before = '') => `${path}?${new URLSearchParams({ ...(q ? { q } : {}), ...(before ? { before } : {}) }).toString()}`;
  const loadSettings = useCallback(async (replace = true) => {
    const result = data((await api(`${base}/config`)).payload);
    if (!result || !Array.isArray(result.allowedOrigins) || !Array.isArray(result.requiredFields)) throw new Error('Invalid Forms configuration response.');
    const next = parseSettings(result);
    setSaved(next); if (replace) setDraft(next);
  }, [api, base]);
  const loadSubmissions = useCallback(async (q: string, before = '') => {
    const result = data((await api(withQuery(`${base}/search`, q, before))).payload);
    if (!result || !Array.isArray(result.submissions)) throw new Error('Invalid submission search response.');
    const entries = result.submissions.filter((value): value is Data => data(value) !== null);
    setSubmissions(previous => before ? [...previous, ...entries.filter(item => !previous.some(existing => existing.id === item.id))] : entries);
    setNextBefore(string(result.nextBefore));
  }, [api, base]);
  const loadDeliveries = useCallback(async () => {
    const result = data((await api(`${base}/deliveries`)).payload);
    if (!result || !Array.isArray(result.deliveries)) throw new Error('Invalid form delivery response.');
    setDeliveries(result.deliveries.filter((value): value is Data => data(value) !== null));
  }, [api, base]);
  // Supply mutable UI state only when the user requests a refresh. Draft edits and search updates
  // must not recreate this callback and trigger the initial-load effect again.
  const refresh = useCallback(async (q = '', replaceSettings = true) => {
    setBusy('refresh'); setError('');
    try { await Promise.all([loadSettings(replaceSettings), loadSubmissions(q), loadDeliveries()]); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setLoaded(true); setBusy(''); }
  }, [loadSettings, loadSubmissions, loadDeliveries]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function reloadSettings() {
    if (busy || (dirty && !window.confirm(t.discard))) return;
    setBusy('reload-settings'); setError('');
    try { await loadSettings(true); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(''); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const origins = lines(draft.allowedOrigins); const fields = lines(draft.requiredFields);
    if (origins.length > 20 || origins.some(value => !exactHttpsOrigin(value)) || fields.length > 30 || fields.some(value => !fieldName.test(value)) || !fieldName.test(draft.honeypotField) || (draft.webhookUrl.trim() && !publicHttpUrl(draft.webhookUrl.trim())) || (draft.successRedirect.trim() && !publicHttpUrl(draft.successRedirect.trim()))) { setError(t.invalid); return; }
    const body = { allowedOrigins: origins, requiredFields: fields, honeypotField: draft.honeypotField, webhookUrl: draft.webhookUrl.trim() || null, successRedirect: draft.successRedirect.trim() || null, requireTurnstile: draft.requireTurnstile };
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 32 * 1024) { setError(t.invalid); return; }
    setBusy('save'); setError(''); setNotice('');
    try {
      const result = data((await api(`${base}/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).payload);
      if (!result || !Array.isArray(result.allowedOrigins)) throw new Error('Invalid saved Forms configuration.');
      const next = parseSettings(result); setSaved(next); setDraft(next); setNotice(t.saved); onChanged();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(''); }
  }
  async function searchSubmissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const q = search.slice(0, 100); setBusy('search'); setError('');
    try { await loadSubmissions(q); setAppliedSearch(q); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(''); }
  }
  async function older() {
    if (!nextBefore || busy) return;
    setBusy('older'); setError('');
    try { await loadSubmissions(appliedSearch, nextBefore); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(''); }
  }
  async function exportCsv() {
    if (busy) return; setBusy('export'); setError('');
    try {
      const response = await api(withQuery(`${base}/export`, appliedSearch));
      if (typeof response.payload !== 'string') throw new Error('Expected a CSV text response.');
      const blob = new Blob(['\uFEFF', response.payload], { type: 'text/csv;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      try { const anchor = document.createElement('a'); anchor.href = href; anchor.download = `picosvc-form-${id}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
      finally { setTimeout(() => URL.revokeObjectURL(href), 1000); }
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(''); }
  }
  async function remove() {
    if (busy || !window.confirm(t.confirm)) return;
    setBusy('delete'); setError('');
    try { await api(base, { method: 'DELETE' }); onChanged(); onClose(); }
    catch (reason) { setError(errorMessage(reason)); setBusy(''); }
  }
  return <section className="formsConsole" aria-label={t.title}>
    <header className="formsConsoleHead"><div><span>PICOSVC / FORMS</span><h2>{t.title}</h2><p>{t.intro}</p></div><button type="button" onClick={onClose}>{t.close} ×</button></header>
    {error && <p role="alert" className="formsConsoleError">{error}</p>}{notice && <p role="status" className="formsConsoleSuccess">{notice}</p>}
    <div className="formsConsoleEndpoint"><div><strong>{t.endpoint}</strong><code>{endpoint || t.noEndpoint}</code><small>{t.method}</small></div><button type="button" disabled={!endpoint} onClick={() => { void copyValue(endpoint); }}>{t.copy}</button></div>
    <div className="formsConsoleGrid"><form className="formsConsoleCard formsConsoleSettings" onSubmit={event => { void save(event); }}><h3>{t.settings}</h3><p className="formsConsoleHint">{t.protect}</p><fieldset disabled={Boolean(busy) || !loaded}>
      <label>{t.origins}<textarea rows={3} value={draft.allowedOrigins} placeholder="https://example.com" onChange={event => setDraft(previous => ({ ...previous, allowedOrigins: event.target.value }))}/><small>{t.originsHint}</small></label>
      <label>{t.fields}<textarea rows={3} value={draft.requiredFields} placeholder="email\nmessage" onChange={event => setDraft(previous => ({ ...previous, requiredFields: event.target.value }))}/></label>
      <label>{t.honey}<input required value={draft.honeypotField} maxLength={64} onChange={event => setDraft(previous => ({ ...previous, honeypotField: event.target.value }))}/><small>{t.honeyHint}</small></label>
      <label>{t.webhook}<input type="url" value={draft.webhookUrl} placeholder="https://example.com/webhook" onChange={event => setDraft(previous => ({ ...previous, webhookUrl: event.target.value }))}/></label>
      <label>{t.redirect}<input type="url" value={draft.successRedirect} onChange={event => setDraft(previous => ({ ...previous, successRedirect: event.target.value }))}/><small>{t.redirectHint}</small></label>
      <label className="formsConsoleCheck"><input type="checkbox" checked={draft.requireTurnstile} onChange={event => setDraft(previous => ({ ...previous, requireTurnstile: event.target.checked }))}/>{t.turnstile}</label><p className="formsConsoleHint">{t.turnstileHint}</p>
      <div className="formsConsoleActions"><button type="submit" disabled={!dirty}>{busy === 'save' ? t.loading : t.save}</button><button type="button" disabled={Boolean(busy)} onClick={() => { void reloadSettings(); }}>{t.reload}</button></div>
    </fieldset></form>
    <div className="formsConsoleSide"><section className="formsConsoleCard"><div className="formsConsoleSectionHead"><h3>{t.submissions} <small>{submissions.length}</small></h3><button type="button" disabled={Boolean(busy)} onClick={() => { void refresh(appliedSearch, !dirty); }}>{t.refresh}</button></div>
      <form className="formsConsoleSearch" onSubmit={event => { void searchSubmissions(event); }}><input type="search" maxLength={100} aria-label={t.search} placeholder={t.search} value={search} onChange={event => setSearch(event.target.value)} /><button type="submit" disabled={Boolean(busy)}>{t.find}</button></form>
      <div className="formsConsoleActions"><button type="button" disabled={Boolean(busy)} onClick={() => { void exportCsv(); }}>{t.export}</button></div><p className="formsConsoleHint">{t.exportHint}</p>
      {!loaded ? <p role="status">{t.loading}</p> : !submissions.length ? <p className="formsConsoleEmpty">{t.empty}</p> : <div className="formsConsoleList">{submissions.map(entry => <details key={string(entry.id)}><summary><time>{formDate(entry.receivedAt, locale)}</time><code>{string(entry.id).slice(0, 8)}</code></summary><pre>{JSON.stringify(entry.payload, null, 2)}</pre></details>)}</div>}
      {Boolean(nextBefore) && <button type="button" disabled={Boolean(busy)} onClick={() => { void older(); }}>{t.more}</button>}<p className="formsConsoleHint">{t.limited}</p>
    </section>
    <section className="formsConsoleCard"><div className="formsConsoleSectionHead"><h3>{t.deliveries} <small>{deliveries.length}</small></h3><button type="button" disabled={Boolean(busy)} onClick={() => { void loadDeliveries().catch(reason => setError(errorMessage(reason))); }}>{t.refresh}</button></div><p className="formsConsoleHint">{t.deliveriesHint}</p>
      {!deliveries.length ? <p className="formsConsoleEmpty">{t.noDelivery}</p> : <div className="formsConsoleList">{deliveries.map(entry => <details key={string(entry.id)}><summary><time>{formDate(entry.delivered_at, locale)}</time><strong>{entry.error ? t.error : t.status}: {string(entry.response_status) || '—'}</strong></summary><dl><dt>Submission</dt><dd><code>{string(entry.submission_id)}</code></dd><dt>Destination</dt><dd><code>{string(entry.destination)}</code></dd>{Boolean(entry.error) && <><dt>{t.error}</dt><dd>{string(entry.error)}</dd></>}</dl></details>)}</div>}
    </section></div></div>
    <div className="formsConsoleDanger"><button type="button" disabled={Boolean(busy)} onClick={() => { void remove(); }}>{t.delete}</button></div>
  </section>;
}
