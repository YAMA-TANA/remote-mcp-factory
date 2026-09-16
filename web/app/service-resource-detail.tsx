'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { GenericServiceSlug } from './service-data';
import { useI18n } from './i18n';

type Resource = Record<string, unknown>;
type ApiResult = { payload: unknown; blob?: Blob };
type Props = {
  service: GenericServiceSlug;
  resource: Resource;
  api: (path: string, init?: RequestInit) => Promise<ApiResult>;
  onClose: () => void;
  onChanged: () => void;
  copyValue: (value: string) => Promise<void>;
};
const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');

function object(value: unknown): Resource | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Resource : null;
}
function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function rows(payload: unknown, key: string): Resource[] {
  const list = object(payload)?.[key];
  if (!Array.isArray(list)) throw new Error(`The ${key} list was not found in the API response.`);
  return list.filter((row): row is Resource => object(row) !== null);
}
function isUrl(value: string): boolean {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:'; }
  catch { return false; }
}

export default function ServiceResourceDetail({ service, resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n();
  const ja = locale === 'ja';
  const id = asString(resource.id);
  const name = asString(resource.name || resource.repo_url || resource.id);
  const [subItems, setSubItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [oneTimeKey, setOneTimeKey] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('{\n  "hello": "world"\n}');
  const [filename, setFilename] = useState('');
  const [upload, setUpload] = useState<File | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [label, setLabel] = useState('');

  const nested = service === 'files' ? 'objects' : service === 'license' ? 'keys' : service === 'flags' ? 'flags' : service === 'forms' ? 'submissions' : '';
  const nestedPath = service === 'files' ? `/api/picosvc/files/spaces/${encodeURIComponent(id)}/objects`
    : service === 'license' ? `/api/picosvc/license/projects/${encodeURIComponent(id)}/keys`
    : service === 'flags' ? `/api/picosvc/flags/projects/${encodeURIComponent(id)}/flags`
    : service === 'forms' ? `/api/picosvc/forms/${encodeURIComponent(id)}/submissions` : '';

  const refresh = useCallback(async () => {
    if (!nestedPath) return;
    setLoading(true); setError('');
    try { setSubItems(rows((await api(nestedPath)).payload, nested)); }
    catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [api, nested, nestedPath]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setSuccess(''); setOneTimeKey('');
    try { await action(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  function jsonPath() {
    if (!key.trim()) throw new Error('A document key is required.');
    return `/api/picosvc/json/stores/${encodeURIComponent(id)}/documents/${encodeURIComponent(key.trim())}`;
  }
  async function readDocument() {
    await run(async () => {
      const response = await api(jsonPath());
      const record = object(response.payload);
      setValue(JSON.stringify(record?.value ?? response.payload, null, 2));
      setSuccess(ja ? '読み込みました。' : 'Document loaded.');
    });
  }
  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const documentValue = JSON.parse(value) as unknown;
      await api(jsonPath(), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(documentValue) });
      setSuccess(ja ? '保存しました。' : 'Document saved.');
    });
  }
  async function deleteDocument() {
    if (!window.confirm(ja ? 'このドキュメントを削除しますか？' : 'Delete this document?')) return;
    await run(async () => { await api(jsonPath(), { method: 'DELETE' }); setSuccess(ja ? '削除しました。' : 'Document deleted.'); });
  }
  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (!upload) throw new Error('Choose a file.');
      const path = filename.trim() || upload.name;
      if (!path || path.includes('..') || path.startsWith('/')) throw new Error('Invalid file path.');
      if (upload.size > 10 * 1024 * 1024) throw new Error('Files are limited to 10 MiB.');
      await api(`/api/picosvc/files/spaces/${encodeURIComponent(id)}/object?path=${encodeURIComponent(path)}`, {
        method: 'PUT', headers: { 'content-type': upload.type || 'application/octet-stream' }, body: upload,
      });
      setSuccess(ja ? 'アップロードしました。' : 'File uploaded.');
      setUpload(null); setFilename(''); await refresh();
    });
  }
  async function deleteFile(path: string) {
    if (!window.confirm(ja ? `${path} を削除しますか？` : `Delete ${path}?`)) return;
    await run(async () => {
      await api(`/api/picosvc/files/spaces/${encodeURIComponent(id)}/object?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      setSuccess(ja ? '削除しました。' : 'File deleted.'); await refresh();
    });
  }
  async function issueLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const response = await api(nestedPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
      setOneTimeKey(asString(object(response.payload)?.licenseKey));
      setLabel(''); setSuccess(ja ? 'ライセンスキーを発行しました。' : 'License key issued.'); await refresh();
    });
  }
  async function revokeLicense(item: Resource) {
    if (!window.confirm(ja ? 'このキーを失効させますか？' : 'Revoke this license key?')) return;
    await run(async () => {
      await api(`/api/picosvc/license/keys/${encodeURIComponent(asString(item.id))}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked: true }) });
      setSuccess(ja ? '失効させました。' : 'License revoked.'); await refresh();
    });
  }
  async function saveFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(key)) throw new Error('Flag key must be 1–100 letters, numbers, dots, underscores or hyphens.');
      const flagValue = JSON.parse(value) as unknown;
      await api(nestedPath, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, value: flagValue, enabled }) });
      setSuccess(ja ? 'フラグを保存しました。' : 'Flag saved.'); await refresh();
    });
  }
  async function deleteFlag(flagKey: string) {
    if (!window.confirm(ja ? `${flagKey} を削除しますか？` : `Delete ${flagKey}?`)) return;
    await run(async () => {
      await api(`${nestedPath}/${encodeURIComponent(flagKey)}`, { method: 'DELETE' });
      setSuccess(ja ? '削除しました。' : 'Flag deleted.'); await refresh();
    });
  }
  async function deleteResource() {
    if (!window.confirm(ja ? `${name} を完全に削除しますか？` : `Permanently delete ${name}?`)) return;
    await run(async () => {
      const base = service === 'json' ? '/api/picosvc/json/stores'
        : service === 'files' ? '/api/picosvc/files/spaces' : '/api/picosvc/forms';
      await api(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      onChanged(); onClose();
    });
  }

  const visibleFields = Object.entries(resource).filter(([field, fieldValue]) =>
    !/(?:^owner$|^owner_id$|^owner_org$|token|secret|password|key_hash|headers_json|metadata_json)/i.test(field)
    && fieldValue !== null && fieldValue !== undefined && typeof fieldValue !== 'object');
  const publicId = asString(resource.public_id || resource.publicId);
  const runtimeBase = service === 'files' && publicId && API_URL ? `${API_URL}/files/${encodeURIComponent(publicId)}` : '';

  return <section className="deployCard serviceDetail" aria-label={`${name} details`}>
    <div className="sectionHead"><div><span className="kicker">{ja ? 'リソースの管理' : 'RESOURCE DETAILS'}</span><h2>{name}</h2></div><button className="ghost" type="button" onClick={onClose}>{ja ? '閉じる' : 'Close'} ×</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {success && <div className="success" role="status">{success}</div>}
    {oneTimeKey && <div className="success serviceOutput" role="status"><strong>{ja ? '発行されたキー（再表示できません）' : 'New key (shown once)'}</strong><code>{oneTimeKey}</code><button className="ghost" onClick={() => { void copyValue(oneTimeKey); }}>{ja ? 'コピー' : 'Copy key'}</button></div>}
    <div className="serviceMetadata">{visibleFields.map(([field, fieldValue]) => {
      const text = asString(fieldValue);
      return <div key={field}><span>{field}</span>{isUrl(text) ? <a href={text} target="_blank" rel="noreferrer">{text}</a> : <code>{text}</code>}{isUrl(text) && <button className="ghost" onClick={() => { void copyValue(text); }}>{ja ? 'コピー' : 'Copy'}</button>}</div>;
    })}</div>
    {service === 'json' && <form className="serviceInnerForm" onSubmit={(event) => { void saveDocument(event); }}>
      <h3>{ja ? 'JSONドキュメント' : 'JSON document'}</h3>
      <label className="serviceField"><span>{ja ? 'キー' : 'Document key'}</span><input required maxLength={200} value={key} onChange={(event) => setKey(event.target.value)} placeholder="user:123" /></label>
      <label className="serviceField"><span>JSON</span><textarea required rows={7} value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} /></label>
      <div className="serviceButtons"><button className="primary" disabled={busy} type="submit">{ja ? '保存' : 'Save document'}</button><button className="ghost" disabled={busy || !key} type="button" onClick={() => { void readDocument(); }}>{ja ? '読み込む' : 'Read key'}</button><button className="ghost" disabled={busy || !key} type="button" onClick={() => { void deleteDocument(); }}>{ja ? 'キーを削除' : 'Delete key'}</button></div>
    </form>}
    {service === 'files' && <form className="serviceInnerForm" onSubmit={(event) => { void uploadFile(event); }}>
      <h3>{ja ? 'ファイルをアップロード' : 'Upload a file'}</h3>
      <label className="serviceField"><span>{ja ? 'ファイル' : 'File (max 10 MiB)'}</span><input type="file" required onChange={(event) => { const file = event.target.files?.[0] || null; setUpload(file); if (file) setFilename(file.name); }} /></label>
      <label className="serviceField"><span>{ja ? '公開パス' : 'Public file path'}</span><input required value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="images/logo.png" /></label>
      <button className="primary" type="submit" disabled={busy || !upload}>{ja ? 'アップロード' : 'Upload file'}</button>
    </form>}
    {service === 'license' && <form className="serviceInnerForm" onSubmit={(event) => { void issueLicense(event); }}>
      <h3>{ja ? 'ライセンスキーを発行' : 'Issue license key'}</h3>
      <label className="serviceField"><span>{ja ? 'ラベル' : 'Label'}</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Customer / order" maxLength={120} /></label>
      <button className="primary" disabled={busy} type="submit">{ja ? 'キーを発行' : 'Issue key'}</button>
    </form>}
    {service === 'flags' && <form className="serviceInnerForm" onSubmit={(event) => { void saveFlag(event); }}>
      <h3>{ja ? 'フラグを追加・更新' : 'Create or update a flag'}</h3>
      <label className="serviceField"><span>{ja ? 'フラグ名' : 'Flag key'}</span><input required maxLength={100} value={key} onChange={(event) => setKey(event.target.value)} placeholder="new_checkout" /></label>
      <label className="serviceField"><span>JSON value</span><textarea required rows={5} value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} /></label>
      <label className="serviceCheck"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{ja ? '有効' : 'Enabled'}</label>
      <button className="primary" disabled={busy} type="submit">{ja ? 'フラグを保存' : 'Save flag'}</button>
    </form>}
    {nestedPath && <div className="serviceNested"><div className="sectionHead"><h3>{service === 'files' ? ja ? 'ファイル一覧' : 'Files' : service === 'license' ? ja ? '発行済みキー' : 'Issued keys' : service === 'flags' ? ja ? 'フラグ一覧' : 'Flags' : ja ? '送信データ' : 'Submissions'}</h3><button className="ghost" disabled={loading} onClick={() => { void refresh(); }}>{loading ? '…' : ja ? '更新' : 'Refresh'}</button></div>
      {loading && subItems.length === 0 ? <p>{ja ? '読み込み中…' : 'Loading…'}</p> : subItems.length === 0 ? <p className="serviceMuted">{ja ? 'まだデータがありません。' : 'Nothing here yet.'}</p> : <div className="serviceNestedList">{subItems.map((item, index) => {
        const itemKey = asString(item.id || item.key || item.path || index);
        const path = asString(item.path);
        const url = runtimeBase && path ? `${runtimeBase}/${path.split('/').map(encodeURIComponent).join('/')}` : '';
        return <div className="serviceNestedRow" key={itemKey}><div><strong>{asString(item.key || item.label || item.path || item.id)}</strong><p>{service === 'forms' ? JSON.stringify(item.payload, null, 2) : service === 'flags' ? JSON.stringify(item.value) : asString(item.updated_at || item.receivedAt || item.created_at || item.size_bytes || '')}</p>{url && <a href={url} target="_blank" rel="noreferrer">{url}</a>}</div>
          {service === 'files' && <button className="ghost" disabled={busy} onClick={() => { void deleteFile(path); }}>{ja ? '削除' : 'Delete'}</button>}
          {service === 'flags' && <button className="ghost" disabled={busy} onClick={() => { void deleteFlag(asString(item.key)); }}>{ja ? '削除' : 'Delete'}</button>}
          {service === 'license' && !item.revoked && <button className="ghost" disabled={busy} onClick={() => { void revokeLicense(item); }}>{ja ? '失効' : 'Revoke'}</button>}
        </div>;
      })}</div>}
    </div>}
    {(['json', 'files', 'forms'] as GenericServiceSlug[]).includes(service) && <div className="serviceDanger"><button className="ghost" disabled={busy} onClick={() => { void deleteResource(); }}>{ja ? 'このリソースを削除' : 'Delete this resource'}</button></div>}
  </section>;
}
