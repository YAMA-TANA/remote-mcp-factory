'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import { fileUrl, MAX_FILE_BYTES, validExpirySeconds, validFilePath } from './files-manager-validation';
import './service-files-management.css';

type Data = Record<string, unknown>;
type Mode = 'public' | 'private';
type SignedAction = 'download' | 'upload';
type Props = { resource: Data; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
const API_ORIGIN = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const obj = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const str = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorText = (value: unknown): string => value instanceof Error ? value.message : String(value);
const COPY = {
  ja: { title: 'ファイルスペース管理', close: '閉じる', refresh: '一覧を更新', upload: 'ファイルをアップロード', file: 'ファイルを選択（最大10 MiB）', path: '保存パス', save: 'アップロード', uploaded: 'アップロードしました。', overwrite: '同じパスのファイルを上書きしますか？', invalidPath: 'パスは512文字以内で、先頭の /、..、バックスラッシュ、制御文字を含められません。', tooLarge: 'ファイルの上限は10 MiBです。', access: '公開範囲', public: '公開（URLを知る人が閲覧可能）', private: '非公開（署名URLが必要）', accessHint: '作成直後は公開です。非公開にすると通常のURLでは取得できません。', accessConfirm: '公開範囲を変更しますか？既存の共有リンクの動作が変わります。', changed: '公開範囲を更新しました。', objects: '保存済みファイル', count: '一覧は更新日時順の最大500件です。', empty: 'ファイルはまだありません。', publicLink: '公開URL', privateLink: '非公開のため通常のURLは利用できません。', copy: 'コピー', signed: '有効期限付きURLを発行', action: '用途', download: 'ダウンロード（GET）', signedUpload: 'アップロード（PUT）', ttl: '有効期間（秒・1〜900）', sign: '署名URLを発行', signedHint: '署名URLは期限内にアクセスできる秘密のリンクです。共有相手にだけ渡してください。発行自体ではダウンロード枠を消費しません。', signedUploadHint: 'PUTでファイル本体を送信してください。上限10 MiB。URLはブラウザーから自動送信しません。', expires: '期限', clear: '署名URLを消去', invalidSign: '有効なパスと1〜900秒の有効期間を指定してください。', cache: 'キャッシュポリシーを設定', cacheHint: '現在のキャッシュ設定は一覧APIから取得できません。選択した設定を適用します。非公開ファイルには常に no-store が適用されます。', choose: '設定を選択', apply: 'キャッシュ設定を適用', cacheSaved: 'キャッシュ設定を更新しました。', deleteFile: 'ファイルを削除', deleteConfirm: 'このファイルをR2から完全に削除しますか？', deleted: 'ファイルを削除しました。', deleteSpace: 'スペースを完全に削除', deleteSpaceConfirm: 'スペースとすべてのファイルを完全に削除しますか？この操作は取り消せません。', loading: '読み込み中…', failed: 'APIの応答が不正です。', storage: '使用容量', of: ' / ', noEndpoint: 'Workerの公開URLを構成できません。' },
  en: { title: 'File space management', close: 'Close', refresh: 'Refresh files', upload: 'Upload a file', file: 'Choose file (10 MiB max)', path: 'Storage path', save: 'Upload', uploaded: 'File uploaded.', overwrite: 'Overwrite the existing file at this path?', invalidPath: 'Path must be at most 512 characters, without leading /, .., backslashes or control characters.', tooLarge: 'Files are limited to 10 MiB.', access: 'Access mode', public: 'Public (anyone with the URL)', private: 'Private (signed URL required)', accessHint: 'New spaces are public. A private space cannot be downloaded using its ordinary URL.', accessConfirm: 'Change access mode? Existing shared links may stop working or become public.', changed: 'Access mode updated.', objects: 'Stored files', count: 'The API lists at most 500 files, newest first.', empty: 'No files yet.', publicLink: 'Public URL', privateLink: 'Private: ordinary URLs do not grant access.', copy: 'Copy', signed: 'Issue a time-limited URL', action: 'Action', download: 'Download (GET)', signedUpload: 'Upload (PUT)', ttl: 'Lifetime (seconds, 1–900)', sign: 'Generate signed URL', signedHint: 'Signed URLs are bearer credentials valid until expiry. Share only with their intended recipient. Issuing a URL does not consume download quota.', signedUploadHint: 'Send file bytes with PUT, up to 10 MiB. The console does not automatically upload through this link.', expires: 'Expires', clear: 'Clear signed URL', invalidSign: 'Enter a valid path and lifetime of 1–900 seconds.', cache: 'Apply cache policy', cacheHint: 'The list API does not report current cache settings. Select a new policy to apply. Private files always use no-store.', choose: 'Choose a policy', apply: 'Apply cache policy', cacheSaved: 'Cache policy updated.', deleteFile: 'Delete file', deleteConfirm: 'Permanently delete this file from R2?', deleted: 'File deleted.', deleteSpace: 'Permanently delete space', deleteSpaceConfirm: 'Permanently delete this space and all its files? This cannot be undone.', loading: 'Loading…', failed: 'Unexpected API response.', storage: 'Storage used', of: ' / ', noEndpoint: 'Worker public URL is not configured.' },
  'zh-CN': { title: '文件空间管理', close: '关闭', refresh: '刷新文件', upload: '上传文件', file: '选择文件（最大10 MiB）', path: '存储路径', save: '上传', uploaded: '文件已上传。', overwrite: '覆盖该路径下的现有文件？', invalidPath: '路径最长512字符，不能以 / 开头，也不能包含 ..、反斜杠或控制字符。', tooLarge: '文件最大10 MiB。', access: '访问模式', public: '公开（知道URL即可访问）', private: '私有（需要签名URL）', accessHint: '新空间默认公开。私有空间无法通过普通URL下载。', accessConfirm: '更改访问模式？已有分享链接的行为可能变化。', changed: '访问模式已更新。', objects: '已存储文件', count: 'API最多返回最新的500个文件。', empty: '还没有文件。', publicLink: '公开URL', privateLink: '私有文件：普通URL无法访问。', copy: '复制', signed: '生成限时URL', action: '用途', download: '下载（GET）', signedUpload: '上传（PUT）', ttl: '有效期（秒，1〜900）', sign: '生成签名URL', signedHint: '签名URL在过期前相当于访问凭据，只分享给目标收件人。生成URL本身不消耗下载配额。', signedUploadHint: '通过PUT发送文件内容，最大10 MiB。本页面不会自动通过该URL上传。', expires: '过期时间', clear: '清除签名URL', invalidSign: '请输入有效路径和1〜900秒的有效期。', cache: '应用缓存策略', cacheHint: '列表API不返回当前缓存设置；请选择要应用的新策略。私有文件始终使用no-store。', choose: '选择策略', apply: '应用缓存策略', cacheSaved: '缓存策略已更新。', deleteFile: '删除文件', deleteConfirm: '从R2中永久删除此文件？', deleted: '文件已删除。', deleteSpace: '永久删除空间', deleteSpaceConfirm: '永久删除空间及其所有文件？无法撤销。', loading: '加载中…', failed: 'API响应格式不正确。', storage: '已使用容量', of: ' / ', noEndpoint: '未配置Worker公开URL。' },
} as const;

export default function FilesManagementDetail({ resource, api, onClose, onChanged, copyValue }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
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
    setMode(access.accessMode);
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
      const response = obj((await api(`${base}/sign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: target, action: signAction, expiresInSeconds: duration }) })).payload);
      if (!response || typeof response.url !== 'string' || typeof response.expiresAt !== 'string' || response.method !== (signAction === 'download' ? 'GET' : 'PUT')) throw new Error(t.failed);
      setSigned({ url: response.url, method: response.method, expiresAt: response.expiresAt });
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  function choose(pathValue: string) { setSelectedPath(pathValue); setSignPath(pathValue); setSignAction('download'); setSigned(null); setCacheChoice(''); setError(''); setNotice(''); }
  async function applyCache(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !selectedPath || !cacheChoice) return;
    setBusy('cache'); setError(''); setNotice('');
    try {
      const result = obj((await api(`${base}/metadata?path=${encodeURIComponent(selectedPath)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cacheControl: cacheChoice }) })).payload);
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
