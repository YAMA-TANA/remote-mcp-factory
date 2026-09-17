'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import { JSON_COPY } from './service-json-copy';
import './service-json-management.css';

type Data = Record<string, unknown>;
type Scope = 'read' | 'write' | 'readwrite';
type Props = { resource: Data; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type ExportDocument = { key: string; value: unknown; updatedAt: string };
const API_ORIGIN = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const keyPattern = /^[A-Za-z0-9._:@/-]{1,200}$/;
const object = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorText = (value: unknown): string => value instanceof Error ? value.message : String(value);

export default function JsonManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = JSON_COPY[locale];
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
    if (!settingsData || typeof settingsData.publicRead !== 'boolean' || !issuedData || !Array.isArray(issuedData.tokens)) throw new Error(t.invalidResponse);
    const nextPublicRead = settingsData.publicRead as boolean;
    setPublicRead(old => old === savedPublicRead ? nextPublicRead : old);
    setSavedPublicRead(nextPublicRead);
    setTokens(issuedData.tokens.filter((item): item is Data => object(item) !== null));
  }, [api, base, savedPublicRead, t.invalidResponse]);
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
      if (!result || !Object.prototype.hasOwnProperty.call(result, 'value')) throw new Error(t.invalidResponse);
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
      if (!result || result.publicRead !== publicRead) throw new Error(t.invalidResponse);
      setSavedPublicRead(publicRead); setNotice(t.settingsSaved); onChanged();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function issueToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if ((prefix && !keyPattern.test(prefix)) || label.length > 120 || (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now()))) { setError(t.tokenInvalid); return; }
    if (!dropSecret()) return;
    const expiresAt = expires ? new Date(expires).toISOString() : null;
    setBusy('issue'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/tokens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: label.trim() || 'Scoped token', scope, ...(prefix ? { keyPrefix: prefix } : {}), expiresAt }) })).payload);
      if (!result || typeof result.bearerToken !== 'string' || !result.bearerToken) throw new Error(t.tokenNoResponse);
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
    if (busy || !window.confirm(t.rotateConfirm) || !dropSecret()) return;
    setBusy('rotate'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/token/rotate`, { method: 'POST' })).payload);
      if (!result || typeof result.bearerToken !== 'string' || !result.bearerToken) throw new Error(t.tokenNoResponse);
      setOneTimeToken(result.bearerToken); setRevealed(false); setNotice(t.rotated);
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function loadExport(after = '') {
    if (busy) return;
    setBusy('export'); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/export${after ? `?after=${encodeURIComponent(after)}` : ''}`)).payload);
      if (!result || !Array.isArray(result.documents)) throw new Error(t.invalidResponse);
      setExportRows(result.documents.filter((entry): entry is ExportDocument => object(entry) !== null && typeof entry.key === 'string'));
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
      <div className="jsonConsoleTokens"><h3>{t.tokenList} <small>{tokens.length}/20</small></h3>{!loaded && <p role="status">{t.loading}</p>}{loaded && !tokens.length && <p>{t.empty}</p>}{tokens.map(item => <article key={text(item.id)}><div><strong>{text(item.label) || text(item.id)}</strong><p><code>{text(item.scope)}</code> · {text(item.key_prefix) || '*'} · {item.expires_at ? new Date(text(item.expires_at)).toLocaleString(locale) : '—'}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => { void revokeToken(item); }}>{t.revoke}</button></article>)}</div></section>
    </div></div>
    <footer className="jsonConsoleDanger"><button type="button" disabled={Boolean(busy)} onClick={() => { void deleteStore(); }}>{t.storeDelete}</button></footer>
  </section>;
}
