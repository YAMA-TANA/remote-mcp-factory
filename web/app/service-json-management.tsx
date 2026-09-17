'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import './service-json-management.css';

type Data = Record<string, unknown>;
type Scope = 'read' | 'write' | 'readwrite';
type Lang = 'ja' | 'en' | 'zh-CN';
type Props = { resource: Data; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type ExportDocument = { key: string; value: unknown; updatedAt: string };
const API_ORIGIN = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const keyPattern = /^[A-Za-z0-9._:@/-]{1,200}$/;
const object = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorText = (value: unknown): string => value instanceof Error ? value.message : String(value);
const asDate = (value: unknown, locale: Lang): string => { const d = new Date(text(value)); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : '—'; };
const COPY: Record<Lang, Record<string, string>> = {
  ja: { title: 'JSONストア管理', intro: 'ドキュメント、公開範囲、アクセス用トークンを管理します。', endpoint: '公開APIのベースURL', endpointHint: 'ドキュメントはこのURLの末尾にキーを追加してGET・PUT・DELETE。秘密のトークンをURLに含めないでください。', copy: 'コピー', close: '閉じる', loading: '処理中…', refresh: '更新', settings: '読み取り権限', publicRead: 'トークンなしのGETを許可する', publicHint: '公開を有効にするとURLを知る人は誰でもドキュメントを読めます。更新と削除にはトークンが必要です。', publicConfirm: 'このストアの全ドキュメントをトークンなしで読み取れるようにしますか？', privateConfirm: '公開読み取りを停止しますか？', saveSettings: '公開設定を保存', settingsSaved: '公開設定を更新しました。', document: 'ドキュメント', documentHint: '管理用APIを使用します。保存は同じキーの内容を上書きします。', key: 'ドキュメントキー', value: 'JSONの内容', read: '読み込み', save: '保存', remove: '削除', docLoaded: 'ドキュメントを読み込みました。', docSaved: 'ドキュメントを保存しました。', docDeleted: 'ドキュメントを削除しました。', overwrite: 'このキーの最新内容を読み込んでいません。既存の内容を上書きする可能性があります。続けますか？', deleteConfirm: 'このドキュメントを削除しますか？元に戻せません。', invalidKey: 'キーは1〜200文字の英数字と . _ : @ / - のみ使用できます。', invalidValue: '256 KiB以内の正しいJSONを入力してください。nullも保存できます。', tokens: '権限付きトークン', tokenHint: 'トークンは発行時に一度しか表示されません。最大20個です。', tokenLabel: 'ラベル', scope: '権限', readScope: '読み取りのみ', writeScope: '書き込みのみ', bothScope: '読み書き', prefix: '許可するキープレフィックス（空欄なら全キー）', expires: '有効期限（任意・ローカル日時）', issue: '発行', issued: 'トークンを発行しました。', tokenList: '発行済みトークン', empty: 'まだありません。', revoke: '無効化', revokeConfirm: 'このトークンを無効化しますか？利用中のクライアントはアクセスできなくなります。', revoked: 'トークンを無効化しました。', root: 'ストアのマスタートークン', rotate: 'マスタートークンを再発行', rotateConfirm: '現在のマスタートークンは即時無効になります。権限付きトークンはそのままです。続けますか？', rotated: 'マスタートークンを再発行しました。', oneTime: '今回限り表示されるトークン', oneTimeHint: 'この画面を離れると再取得できません。安全に保管してください。', reveal: '表示', hide: '隠す', clear: '表示を消去', discard: '表示中のトークンは再取得できません。破棄して続けますか？', export: 'ドキュメントのエクスポート', exportHint: 'キー順の最大100件・約1 MiBまでを1ページずつ取得します。全件の自動ダウンロードではありません。', loadPage: '最初のページを取得', next: '次のページ', download: '表示中のページをJSONで保存', page: 'このページの件数', finished: '続きはありません。', storeDelete: 'ストアを完全に削除', storeDeleteConfirm: 'ストア・全ドキュメント・トークンを完全に削除しますか？元に戻せません。', failed: '処理に失敗しました。', tokenInvalid: 'プレフィックス・有効期限・ラベルを確認してください。' },
  en: { title: 'JSON store management', intro: 'Manage documents, public access and scoped tokens.', endpoint: 'Public API base URL', endpointHint: 'Append a document key to this URL for GET, PUT or DELETE. Never put tokens in a URL.', copy: 'Copy', close: 'Close', loading: 'Working…', refresh: 'Refresh', settings: 'Read access', publicRead: 'Allow GET without a token', publicHint: 'Anyone with the URL can read every document when public read is enabled. Writing and deletion still require a token.', publicConfirm: 'Allow unauthenticated reading of all documents in this store?', privateConfirm: 'Disable public reading?', saveSettings: 'Save access settings', settingsSaved: 'Access settings updated.', document: 'Document', documentHint: 'Uses the authenticated management API. Saving replaces the contents of this key.', key: 'Document key', value: 'JSON value', read: 'Read', save: 'Save', remove: 'Delete', docLoaded: 'Document loaded.', docSaved: 'Document saved.', docDeleted: 'Document deleted.', overwrite: 'You have not loaded the latest value for this key. Saving could overwrite an existing document. Continue?', deleteConfirm: 'Delete this document permanently?', invalidKey: 'Key must be 1–200 letters, numbers or . _ : @ / -.', invalidValue: 'Enter valid JSON up to 256 KiB. null is supported.', tokens: 'Scoped tokens', tokenHint: 'Tokens are shown only at issuance; up to 20 per store.', tokenLabel: 'Label', scope: 'Scope', readScope: 'Read only', writeScope: 'Write only', bothScope: 'Read and write', prefix: 'Allowed key prefix (blank means every key)', expires: 'Expiration (optional, local time)', issue: 'Issue token', issued: 'Token issued.', tokenList: 'Issued tokens', empty: 'Nothing here yet.', revoke: 'Revoke', revokeConfirm: 'Revoke this token? Clients using it will lose access.', revoked: 'Token revoked.', root: 'Store master token', rotate: 'Rotate master token', rotateConfirm: 'This invalidates the existing master token immediately. Scoped tokens are unaffected. Continue?', rotated: 'Master token rotated.', oneTime: 'One-time token', oneTimeHint: 'You cannot retrieve it after leaving this screen. Store it securely.', reveal: 'Reveal', hide: 'Hide', clear: 'Clear', discard: 'The displayed token cannot be retrieved again. Clear it and continue?', export: 'Export documents', exportHint: 'Fetch one key-ordered page of up to 100 documents / about 1 MiB at a time. This is not a full-store automatic download.', loadPage: 'Load first page', next: 'Next page', download: 'Download displayed page as JSON', page: 'Documents on this page', finished: 'No more pages.', storeDelete: 'Permanently delete store', storeDeleteConfirm: 'Permanently delete the store, all documents and tokens?', failed: 'Operation failed.', tokenInvalid: 'Check prefix, expiration and label.' },
  'zh-CN': { title: 'JSON 存储管理', intro: '管理文档、公开权限和限定作用域的令牌。', endpoint: '公开 API 基础 URL', endpointHint: '在URL末尾附加文档键，可执行GET、PUT、DELETE。请勿将令牌放入URL。', copy: '复制', close: '关闭', loading: '处理中…', refresh: '刷新', settings: '读取权限', publicRead: '允许无令牌GET', publicHint: '启用后任何知道URL的人都能读取全部文档。写入和删除仍需令牌。', publicConfirm: '允许任何人无令牌读取此存储的全部文档？', privateConfirm: '关闭公开读取？', saveSettings: '保存权限', settingsSaved: '权限已更新。', document: '文档', documentHint: '使用已认证的管理API。保存会覆盖该键的内容。', key: '文档键', value: 'JSON内容', read: '读取', save: '保存', remove: '删除', docLoaded: '已读取文档。', docSaved: '已保存文档。', docDeleted: '已删除文档。', overwrite: '尚未读取此键的最新内容，保存可能覆盖已有文档。继续？', deleteConfirm: '永久删除此文档？', invalidKey: '键长度1至200，限英数字和 . _ : @ / -。', invalidValue: '请输入不超过256 KiB的有效JSON；支持null。', tokens: '限定权限令牌', tokenHint: '令牌仅在发行时显示，每存储最多20个。', tokenLabel: '标签', scope: '权限', readScope: '只读', writeScope: '只写', bothScope: '读写', prefix: '允许的键前缀（空白表示全部）', expires: '过期时间（可选，本地时间）', issue: '发行令牌', issued: '令牌已发行。', tokenList: '已发行令牌', empty: '暂无内容。', revoke: '撤销', revokeConfirm: '撤销此令牌？使用它的客户端将无法访问。', revoked: '令牌已撤销。', root: '主令牌', rotate: '轮换主令牌', rotateConfirm: '现有主令牌将立即失效，限定权限令牌不受影响。继续？', rotated: '主令牌已轮换。', oneTime: '仅本次显示的令牌', oneTimeHint: '离开页面后无法再次获取，请妥善保存。', reveal: '显示', hide: '隐藏', clear: '清除', discard: '显示中的令牌无法再次获取。清除并继续？', export: '导出文档', exportHint: '每次按键排序读取最多100条、约1 MiB的数据；不会自动下载整个存储。', loadPage: '读取第一页', next: '下一页', download: '下载当前页JSON', page: '当前页文档数', finished: '没有更多页。', storeDelete: '永久删除存储', storeDeleteConfirm: '永久删除存储、所有文档和令牌？', failed: '操作失败。', tokenInvalid: '请检查前缀、过期时间与标签。' },
};

export default function JsonManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const id = text(resource.id);
  const base = `/api/picosvc/json/stores/${encodeURIComponent(id)}`;
  const publicId = text(resource.public_id ?? resource.publicId);
  let endpoint = '';
  try { if (/^[0-9a-f]{32}$/i.test(publicId)) endpoint = `${new URL(API_ORIGIN).origin}/json/${publicId}`; } catch { /* Missing API configuration. */ }
  const [publicRead, setPublicRead] = useState(false);
  const [savedPublicRead, setSavedPublicRead] = useState(false);
  const [tokens, setTokens] = useState<Data[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [docKey, setDocKey] = useState('');
  const [docValue, setDocValue] = useState('{}');
  const [loadedDocKey, setLoadedDocKey] = useState('');
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<Scope>('read');
  const [prefix, setPrefix] = useState('');
  const [expires, setExpires] = useState('');
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [exportRows, setExportRows] = useState<ExportDocument[]>([]);
  const [exportCursor, setExportCursor] = useState('');
  const [exportLoaded, setExportLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [settings, issued] = await Promise.all([api(`${base}/settings`), api(`${base}/tokens`)]);
    const settingsData = object(settings.payload); const issuedData = object(issued.payload);
    if (!settingsData || typeof settingsData.publicRead !== 'boolean' || !issuedData || !Array.isArray(issuedData.tokens)) throw new Error('Invalid JSON store management response.');
    setSavedPublicRead(settingsData.publicRead);
    setPublicRead(old => old === savedPublicRead ? settingsData.publicRead : old);
    setTokens(issuedData.tokens.filter((item): item is Data => object(item) !== null));
  }, [api, base, savedPublicRead]);
  useEffect(() => { let active = true; void reload().catch(reason => { if (active) setError(errorText(reason)); }).finally(() => { if (active) setLoaded(true); }); return () => { active = false; }; }, [reload]);
  function dropSecret(): boolean {
    if (oneTimeToken && !window.confirm(t.discard)) return false;
    setOneTimeToken(''); setRevealed(false);
    return true;
  }
  function jsonPath(key: string): string { if (!keyPattern.test(key)) throw new Error(t.invalidKey); return `${base}/documents/${encodeURIComponent(key)}`; }
  async function readDocument() {
    if (busy) return;
    let path: string; try { path = jsonPath(docKey); } catch (reason) { setError(errorText(reason)); return; }
    setBusy('read'); setError(''); setNotice('');
    try {
      const result = object((await api(path)).payload);
      if (!result || !Object.prototype.hasOwnProperty.call(result, 'value')) throw new Error('Invalid document response.');
      setDocValue(JSON.stringify(result.value, null, 2)); setLoadedDocKey(docKey); setNotice(t.docLoaded);
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    let path: string; let value: unknown;
    try { path = jsonPath(docKey); value = JSON.parse(docValue); if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) throw new Error(t.invalidValue); }
    catch (reason) { setError(reason instanceof SyntaxError ? t.invalidValue : errorText(reason)); return; }
    if (loadedDocKey !== docKey && !window.confirm(t.overwrite)) return;
    setBusy('save'); setError(''); setNotice('');
    try { await api(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }); setLoadedDocKey(docKey); setNotice(t.docSaved); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function deleteDocument() {
    if (busy) return;
    let path: string; try { path = jsonPath(docKey); } catch (reason) { setError(errorText(reason)); return; }
    if (!window.confirm(t.deleteConfirm)) return;
    setBusy('delete-document'); setError(''); setNotice('');
    try { await api(path, { method: 'DELETE' }); setDocValue('{}'); setLoadedDocKey(''); setNotice(t.docDeleted); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function saveSettings() {
    if (busy || publicRead === savedPublicRead || !window.confirm(publicRead ? t.publicConfirm : t.privateConfirm)) return;
    setBusy('settings'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/settings`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicRead }) })).payload);
      if (!result || result.publicRead !== publicRead) throw new Error('Invalid JSON access settings response.');
      setSavedPublicRead(publicRead); setNotice(t.settingsSaved); onChanged();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function issueToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !dropSecret()) return;
    if ((prefix && !keyPattern.test(prefix)) || label.length > 120 || (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now()))) { setError(t.tokenInvalid); return; }
    const expiresAt = expires ? new Date(expires).toISOString() : null;
    setBusy('issue'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/tokens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: label.trim() || 'Scoped token', scope, ...(prefix ? { keyPrefix: prefix } : {}), expiresAt }) })).payload);
      if (!result || typeof result.bearerToken !== 'string' || !result.bearerToken) throw new Error('The API did not return a one-time token.');
      setOneTimeToken(result.bearerToken); setRevealed(false); setLabel(''); setExpires(''); setPrefix(''); setNotice(t.issued);
      try { await reload(); } catch (reason) { setError(errorText(reason)); }
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function revokeToken(item: Data) {
    if (busy || !window.confirm(t.revokeConfirm)) return;
    const tokenId = text(item.id);
    if (!/^[0-9a-f-]{36}$/i.test(tokenId)) { setError('Invalid token ID.'); return; }
    setBusy('revoke'); setError(''); setNotice('');
    try { await api(`${base}/tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' }); setTokens(previous => previous.filter(row => row.id !== item.id)); setNotice(t.revoked); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function rotateToken() {
    if (busy || !dropSecret() || !window.confirm(t.rotateConfirm)) return;
    setBusy('rotate'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/token/rotate`, { method: 'POST' })).payload);
      if (!result || typeof result.bearerToken !== 'string' || !result.bearerToken) throw new Error('The API did not return a one-time token.');
      setOneTimeToken(result.bearerToken); setRevealed(false); setNotice(t.rotated);
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function loadExport(after = '') {
    if (busy) return;
    setBusy('export'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/export${after ? `?after=${encodeURIComponent(after)}` : ''}`)).payload);
      if (!result || !Array.isArray(result.documents)) throw new Error('Invalid JSON export response.');
      setExportRows(result.documents.filter((entry): entry is ExportDocument => object(entry) !== null && typeof entry.key === 'string') as ExportDocument[]);
      setExportCursor(typeof result.nextCursor === 'string' ? result.nextCursor : ''); setExportLoaded(true);
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  function downloadExport() {
    if (!exportLoaded || !exportRows.length) return;
    const blob = new Blob([JSON.stringify({ storeId: id, documents: exportRows, nextCursor: exportCursor || null }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `picosvc-json-${id.slice(0, 8)}-page.json`; document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function deleteStore() {
    if (busy || !window.confirm(t.storeDeleteConfirm)) return;
    setBusy('delete-store'); setError('');
    try { await api(base, { method: 'DELETE' }); setOneTimeToken(''); onChanged(); onClose(); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  function close() { if (dropSecret()) onClose(); }
  return <section className="jsonConsole" aria-label={t.title}>
    <header className="jsonConsoleHead"><div><span>PICOSVC / JSON</span><h2>{t.title}</h2><p>{t.intro}</p></div><button type="button" onClick={close} disabled={Boolean(busy)}>{t.close} ×</button></header>
    {error && <p role="alert" className="jsonConsoleError">{t.failed} {error}</p>}{notice && <p role="status" className="jsonConsoleNotice">{notice}</p>}
    <section className="jsonConsoleCard jsonConsoleEndpoint"><div><h3>{t.endpoint}</h3><code>{endpoint || '—'}</code><small>{t.endpointHint}</small></div><button type="button" disabled={!endpoint} onClick={() => { void copyValue(endpoint); }}>{t.copy}</button></section>
    <div className="jsonConsoleGrid"><div className="jsonConsoleSide">
      <section className="jsonConsoleCard"><h3>{t.settings}</h3><label className="jsonConsoleCheck"><input type="checkbox" checked={publicRead} disabled={!loaded || Boolean(busy)} onChange={event => setPublicRead(event.target.checked)} />{t.publicRead}</label><p className="jsonConsoleHint">{t.publicHint}</p><div className="jsonConsoleActions"><button type="button" disabled={!loaded || Boolean(busy) || publicRead === savedPublicRead} onClick={() => { void saveSettings(); }}>{t.saveSettings}</button><button type="button" disabled={Boolean(busy)} onClick={() => { void reload().catch(reason => setError(errorText(reason))); }}>{t.refresh}</button></div></section>
      <section className="jsonConsoleCard"><h3>{t.document}</h3><p className="jsonConsoleHint">{t.documentHint}</p><form onSubmit={event => { void saveDocument(event); }}><label>{t.key}<input value={docKey} maxLength={200} required onChange={event => { setDocKey(event.target.value); setLoadedDocKey(''); }} placeholder="users/123" /></label><label>{t.value}<textarea value={docValue} rows={8} required spellCheck={false} onChange={event => setDocValue(event.target.value)} /></label><div className="jsonConsoleActions"><button type="submit" disabled={Boolean(busy)}>{t.save}</button><button type="button" disabled={Boolean(busy) || !docKey} onClick={() => { void readDocument(); }}>{t.read}</button><button type="button" disabled={Boolean(busy) || !docKey} onClick={() => { void deleteDocument(); }}>{t.remove}</button></div></form></section>
      <section className="jsonConsoleCard"><h3>{t.export}</h3><p className="jsonConsoleHint">{t.exportHint}</p><div className="jsonConsoleActions"><button type="button" disabled={Boolean(busy)} onClick={() => { void loadExport(); }}>{t.loadPage}</button><button type="button" disabled={Boolean(busy) || !exportCursor} onClick={() => { void loadExport(exportCursor); }}>{t.next}</button><button type="button" disabled={!exportRows.length || Boolean(busy)} onClick={downloadExport}>{t.download}</button></div>{exportLoaded && <p role="status">{t.page}: {exportRows.length} · {exportCursor ? t.next : t.finished}</p>}{exportRows.length > 0 && <div className="jsonConsoleExportList">{exportRows.map(row => <button type="button" key={row.key} disabled={Boolean(busy)} onClick={() => { setDocKey(row.key); setDocValue(JSON.stringify(row.value, null, 2)); setLoadedDocKey(''); }}>{row.key}</button>)}</div>}</section>
    </div><div className="jsonConsoleSide">
      <section className="jsonConsoleCard"><h3>{t.tokens}</h3><p className="jsonConsoleHint">{t.tokenHint}</p><form onSubmit={event => { void issueToken(event); }}><fieldset disabled={Boolean(busy)}><label>{t.tokenLabel}<input value={label} maxLength={120} onChange={event => setLabel(event.target.value)} placeholder="Production reader" /></label><label>{t.scope}<select value={scope} onChange={event => setScope(event.target.value as Scope)}><option value="read">{t.readScope}</option><option value="write">{t.writeScope}</option><option value="readwrite">{t.bothScope}</option></select></label><label>{t.prefix}<input value={prefix} maxLength={200} onChange={event => setPrefix(event.target.value)} placeholder="public/" /></label><label>{t.expires}<input type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} /></label><button type="submit">{t.issue}</button></fieldset></form>
      <div className="jsonConsoleActions jsonConsoleRoot"><strong>{t.root}</strong><button type="button" disabled={Boolean(busy)} onClick={() => { void rotateToken(); }}>{t.rotate}</button></div>
      {oneTimeToken && <div className="jsonConsoleSecret" role="status"><strong>{t.oneTime}</strong><code>{revealed ? oneTimeToken : '••••••••••••••••••••'}</code><p>{t.oneTimeHint}</p><div className="jsonConsoleActions"><button type="button" onClick={() => setRevealed(old => !old)}>{revealed ? t.hide : t.reveal}</button><button type="button" onClick={() => { void copyValue(oneTimeToken); }}>{t.copy}</button><button type="button" onClick={() => { setOneTimeToken(''); setRevealed(false); }}>{t.clear}</button></div></div>}
      <div className="jsonConsoleTokens"><h3>{t.tokenList} <small>{tokens.length}/20</small></h3>{!loaded && <p role="status">{t.loading}</p>}{loaded && !tokens.length && <p>{t.empty}</p>}{tokens.map(item => <article key={text(item.id)}><div><strong>{text(item.label) || text(item.id)}</strong><p><code>{text(item.scope)}</code> · {text(item.key_prefix) || '*'} · {asDate(item.expires_at, locale)}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => { void revokeToken(item); }}>{t.revoke}</button></article>)}</div></section>
    </div></div>
    <footer className="jsonConsoleDanger"><button type="button" disabled={Boolean(busy)} onClick={() => { void deleteStore(); }}>{t.storeDelete}</button></footer>
  </section>;
}
