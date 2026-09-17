'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import { fileUrl, MAX_FILE_BYTES, metadataQueryPath, signedBodyPath, validExpirySeconds, validFilePath } from './files-manager-validation';
import { FILES_COPY } from './service-files-copy';
import './service-files-management.css';

type Data = Record<string, unknown>;
type Mode = 'public' | 'private';
type SignedAction = 'download' | 'upload';
type Props = { resource: Data; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
const API_ORIGIN = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const obj = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const str = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorText = (value: unknown): string => value instanceof Error ? value.message : String(value);

export default function FilesManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = FILES_COPY[locale];
  const id = str(resource.id);
  const base = `/api/picosvc/files/spaces/${encodeURIComponent(id)}`;
  const publicId = str(resource.public_id ?? resource.publicId);
  const [mode, setMode] = useState<Mode | ''>('');
  const [files, setFiles] = useState<Data[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [selectedPath, setSelectedPath] = useState('');
  const [signAction, setSignAction] = useState<SignedAction>('download');
  const [signPath, setSignPath] = useState('');
  const [ttl, setTtl] = useState('300');
  const [signed, setSigned] = useState<{ url: string; method: string; expiresAt: string } | null>(null);
  const [cacheChoice, setCacheChoice] = useState('');
  const [storage, setStorage] = useState<{ used: number; limit: number | null } | null>(null);

  const reload = useCallback(async () => {
    const [accessResponse, listResponse] = await Promise.all([api(`${base}/access`), api(`${base}/objects`)]);
    const access = obj(accessResponse.payload); const list = obj(listResponse.payload);
    if (!access || (access.accessMode !== 'public' && access.accessMode !== 'private') || !list || !Array.isArray(list.objects)) throw new Error(t.failed);
    setMode(access.accessMode as Mode);
    setFiles(list.objects.filter((row): row is Data => obj(row) !== null && typeof row.path === 'string'));
    const used = Number(list.storageUsedBytes);
    setStorage({ used: Number.isFinite(used) ? used : 0, limit: typeof list.storageLimitBytes === 'number' ? list.storageLimitBytes : null });
  }, [api, base, t.failed]);
  useEffect(() => { let active = true; void reload().catch(reason => { if (active) setError(errorText(reason)); }).finally(() => { if (active) setLoaded(true); }); return () => { active = false; }; }, [reload]);

  async function refresh() { if (busy) return; setBusy('refresh'); setError(''); try { await reload(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); } }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const target = path.trim();
    if (!validFilePath(target)) { setError(t.invalidPath); return; }
    if (!file || file.size > MAX_FILE_BYTES) { setError(t.tooLarge); return; }
    if (files.some(row => row.path === target) && !window.confirm(t.overwrite)) return;
    setBusy('upload'); setError(''); setNotice('');
    try {
      await api(`${base}/object?path=${encodeURIComponent(target)}`, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
      setFile(null); setPath(''); setFileInputKey(old => old + 1); setSigned(null);
      await reload(); setNotice(t.uploaded); onChanged();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function changeMode(next: Mode) {
    if (busy || next === mode || !window.confirm(t.accessConfirm)) return;
    setBusy('access'); setError(''); setNotice(''); setSigned(null);
    try {
      const result = obj((await api(`${base}/access`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: next }) })).payload);
      if (!result || result.accessMode !== next) throw new Error(t.failed);
      setMode(next); setNotice(t.changed); onChanged();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const target = signPath.trim(); const duration = Number(ttl);
    if (!validFilePath(target) || !validExpirySeconds(duration)) { setError(t.invalidSign); return; }
    setBusy('sign'); setError(''); setNotice(''); setSigned(null);
    try {
      // This API decodes JSON `path` once: encode it to preserve literal % sequences.
      const response = obj((await api(`${base}/sign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: signedBodyPath(target), action: signAction, expiresInSeconds: duration }) })).payload);
      const expectedMethod = signAction === 'download' ? 'GET' : 'PUT';
      if (!response || typeof response.url !== 'string' || typeof response.expiresAt !== 'string' || response.method !== expectedMethod) throw new Error(t.failed);
      setSigned({ url: response.url, method: expectedMethod, expiresAt: response.expiresAt });
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  function choose(pathValue: string) { setSelectedPath(pathValue); setSignPath(pathValue); setSignAction('download'); setSigned(null); setCacheChoice(''); setError(''); setNotice(''); }
  async function applyCache(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !selectedPath || !cacheChoice) return;
    setBusy('cache'); setError(''); setNotice('');
    try {
      // URLSearchParams and the metadata handler both decode the path.
      const result = obj((await api(`${base}/metadata?path=${metadataQueryPath(selectedPath)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cacheControl: cacheChoice }) })).payload);
      if (!result || result.path !== selectedPath || result.cacheControl !== cacheChoice) throw new Error(t.failed);
      setCacheChoice(''); setNotice(t.cacheSaved);
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function deleteFile(pathValue: string) {
    if (busy || !window.confirm(t.deleteConfirm)) return;
    setBusy('delete-file'); setError(''); setNotice('');
    try {
      await api(`${base}/object?path=${encodeURIComponent(pathValue)}`, { method: 'DELETE' });
      if (selectedPath === pathValue) choose('');
      await reload(); setNotice(t.deleted); onChanged();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function deleteSpace() {
    if (busy || !window.confirm(t.deleteSpaceConfirm)) return;
    setBusy('delete-space'); setError('');
    try { await api(base, { method: 'DELETE' }); onChanged(); onClose(); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  const publicUrl = (value: string) => mode === 'public' ? fileUrl(API_ORIGIN, publicId, value) : null;
  return <section className="filesConsole deployCard serviceDetail" aria-label={t.title}>
    <div className="sectionHead"><div><span className="kicker">FILES</span><h2>{t.title}</h2></div><button className="ghost" type="button" onClick={onClose}>{t.close} ×</button></div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    {!loaded ? <p>{t.loading}</p> : <>
      <section className="filesPanel"><h3>{t.access}</h3><p>{t.accessHint}</p><div className="filesActions"><button type="button" aria-pressed={mode === 'public'} disabled={Boolean(busy)} onClick={() => { void changeMode('public'); }}>{t.public}</button><button type="button" aria-pressed={mode === 'private'} disabled={Boolean(busy)} onClick={() => { void changeMode('private'); }}>{t.private}</button></div></section>
      <form className="filesPanel" onSubmit={event => { void upload(event); }}><h3>{t.upload}</h3><label>{t.file}<input key={fileInputKey} type="file" required onChange={event => { const next = event.target.files?.[0] || null; setFile(next); setPath(next?.name || ''); }} /></label><label>{t.path}<input required maxLength={512} value={path} onChange={event => setPath(event.target.value)} placeholder="images/logo.png" /></label><button className="primary" type="submit" disabled={Boolean(busy) || !file}>{t.save}</button></form>
      <section className="filesPanel"><div className="sectionHead"><h3>{t.objects} ({files.length})</h3><button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => { void refresh(); }}>{t.refresh}</button></div><p>{t.count}</p>{storage && <p>{t.storage}: {storage.used.toLocaleString()} B{storage.limit === null ? '' : `${t.of}${storage.limit.toLocaleString()} B`}</p>}
        {files.length === 0 ? <p>{t.empty}</p> : <div className="filesRows">{files.map(item => { const itemPath = str(item.path); const url = publicUrl(itemPath); return <div className="filesRow" key={itemPath}><div><button type="button" className="filesPath" aria-pressed={selectedPath === itemPath} onClick={() => choose(itemPath)}>{itemPath}</button><p>{Number(item.size_bytes || 0).toLocaleString()} B · {str(item.content_type)} · {str(item.updated_at)}</p>{url ? <div className="filesLink"><a href={url} target="_blank" rel="noopener noreferrer">{t.publicLink}</a><button className="ghost" type="button" onClick={() => { void copyValue(url); }}>{t.copy}</button></div> : <small>{mode === 'private' ? t.privateLink : t.noEndpoint}</small>}</div><button className="ghost" type="button" disabled={Boolean(busy)} onClick={() => { void deleteFile(itemPath); }}>{t.deleteFile}</button></div>; })}</div>}
      </section>
      <section className="filesPanel"><h3>{t.signed}</h3><p>{t.signedHint}</p><form onSubmit={event => { void sign(event); }}><label>{t.action}<select value={signAction} onChange={event => { setSignAction(event.target.value as SignedAction); setSigned(null); }}><option value="download">{t.download}</option><option value="upload">{t.signedUpload}</option></select></label><label>{t.path}<input required maxLength={512} value={signPath} onChange={event => { setSignPath(event.target.value); setSigned(null); }} placeholder="images/logo.png" /></label><label>{t.ttl}<input required type="number" min={1} max={900} step={1} value={ttl} onChange={event => { setTtl(event.target.value); setSigned(null); }} /></label><button className="primary" type="submit" disabled={Boolean(busy)}>{t.sign}</button></form>{signed && <div className="filesSigned" role="status"><p>{signed.method} · {t.expires}: {signed.expiresAt}</p><code>{signed.url}</code><div className="filesActions"><button className="ghost" type="button" onClick={() => { void copyValue(signed.url); }}>{t.copy}</button><button className="ghost" type="button" onClick={() => setSigned(null)}>{t.clear}</button></div>{signed.method === 'PUT' && <p>{t.signedUploadHint}</p>}</div>}</section>
      {selectedPath && <form className="filesPanel" onSubmit={event => { void applyCache(event); }}><h3>{t.cache}: <code>{selectedPath}</code></h3><p>{t.cacheHint}</p><label>{t.cache}<select value={cacheChoice} onChange={event => setCacheChoice(event.target.value)}><option value="">{t.choose}</option><option value="no-store">no-store</option><option value="public, max-age=300">public, max-age=300</option><option value="public, max-age=3600">public, max-age=3600</option></select></label><button className="ghost" type="submit" disabled={Boolean(busy) || !cacheChoice}>{t.apply}</button></form>}
      <div className="serviceDanger"><button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => { void deleteSpace(); }}>{t.deleteSpace}</button></div>
    </>}
  </section>;
}
