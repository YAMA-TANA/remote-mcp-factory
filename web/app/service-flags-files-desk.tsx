'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { workspaceApiError } from './workspace-helpers';
import { dataPaths, parseDataProjects, parseFiles, parseFlags, prepareFlag, publicDataUrl, validFilePath, type DataDeskService, type DataProject, type FileItem, type FlagItem } from './service-flags-files-model';
import './service-fleet-console.css';
import './service-resource-desk.css';
import './service-flags-files-desk.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const COPY = {
  ja: { flags: 'Flags 個別管理', files: 'Files 個別管理', flagsIntro: 'プロジェクトの機能フラグを追加・編集し、公開状態を管理します。', filesIntro: '保存領域の容量・ファイルを確認し、アップロードと削除を行います。', dashboard: '全体ダッシュボード', workspace: '作成・詳細設定', usage: '利用量・上限', signIn: 'ログインして個別管理を開く', config: '認証またはWorker APIが未設定です。', loading: '読み込み中…', error: '情報を取得できませんでした。', refresh: '再読み込み', search: '名前で検索', resources: '管理対象', empty: '対象がありません。', choose: '左の一覧から選択してください。', select: '管理する', flagsList: '機能フラグ', fileList: 'ファイル一覧（最大500件）', active: '有効', inactive: '無効', key: 'フラグ名', value: 'JSON値', enabled: '有効にする', newFlag: '新規フラグ', save: 'フラグを保存', toggle: '状態を切り替える', removeFlag: 'フラグを削除', removeFlagConfirm: 'このフラグを完全に削除しますか？利用中のアプリで値が取得できなくなります。', disableConfirm: 'このフラグを無効にしますか？公開APIから返されなくなります。', invalidNull: 'nullのフラグはAPIがfalseに変換するため、JSON値を編集してから保存してください。', saved: '保存しました。', deleted: '削除しました。', unsaved: '未保存の変更を破棄しますか？', endpoint: '公開API', copy: 'URLをコピー', copied: 'コピーしました', noFlags: 'フラグがありません。', noFiles: 'ファイルがありません。', filename: '保存パス', size: '容量', type: '種類', updated: '最終更新', storage: 'ストレージ使用量', unlimited: '上限なし', upload: 'ファイルをアップロード', uploadFile: 'アップロードするファイル', uploadPath: '保存先パス（相対パス）', uploadConfirm: '同じパスのファイルを上書きしますか？既存の内容は失われます。', uploadHelp: '1ファイル10MiBまで。保存先パスに「..」や制御文字は使用できません。', deleteFile: 'ファイルを完全に削除', deleteFileConfirm: 'このファイルを完全に削除しますか？公開URLからも取得できなくなります。', published: '公開ファイルURL', paused: '停止中', fileWarning: 'ファイル本文・ETagは管理一覧には表示しません。公開URLはファイル領域が有効な場合のみ動作します。', flagWarning: 'フラグのJSON値はAPI利用者から取得可能です。秘密情報を保存しないでください。', working: '処理中…' },
  en: { flags: 'Flags management', files: 'Files management', flagsIntro: 'Create, edit and control the availability of feature flags per project.', filesIntro: 'Inspect storage capacity and files; upload and delete objects.', dashboard: 'All-service dashboard', workspace: 'Create / detailed settings', usage: 'Usage & limits', signIn: 'Sign in to manage resources', config: 'Authentication or Worker API is not configured.', loading: 'Loading…', error: 'Could not load management data.', refresh: 'Refresh', search: 'Search by name', resources: 'Resources', empty: 'Nothing found.', choose: 'Select a resource from the list.', select: 'Manage', flagsList: 'Feature flags', fileList: 'Files (up to 500)', active: 'Enabled', inactive: 'Disabled', key: 'Flag key', value: 'JSON value', enabled: 'Enabled', newFlag: 'New flag', save: 'Save flag', toggle: 'Toggle state', removeFlag: 'Delete flag', removeFlagConfirm: 'Permanently delete this flag? Applications will no longer receive it.', disableConfirm: 'Disable this flag? It will disappear from the public API response.', invalidNull: 'The API converts null into false. Edit the value before saving.', saved: 'Saved.', deleted: 'Deleted.', unsaved: 'Discard unsaved changes?', endpoint: 'Public API', copy: 'Copy URL', copied: 'Copied', noFlags: 'No flags.', noFiles: 'No files.', filename: 'Storage path', size: 'Size', type: 'Type', updated: 'Updated', storage: 'Storage used', unlimited: 'Unlimited', upload: 'Upload file', uploadFile: 'Choose file', uploadPath: 'Destination path (relative)', uploadConfirm: 'Overwrite the existing file at this path? Its contents will be lost.', uploadHelp: 'Maximum 10 MiB per file. Path cannot contain ".." or control characters.', deleteFile: 'Permanently delete file', deleteFileConfirm: 'Permanently delete this file? Its public URL will stop working.', published: 'Public file URL', paused: 'Paused', fileWarning: 'File bodies and ETags are not shown. Public URLs work only while a file space is enabled.', flagWarning: 'Flag JSON values are available through the public API. Never store secrets in them.', working: 'Working…' },
  'zh-CN': { flags: 'Flags 单项管理', files: 'Files 单项管理', flagsIntro: '按项目创建和修改功能开关并管理启用状态。', filesIntro: '查看存储空间及文件，上传和删除对象。', dashboard: '全部服务总览', workspace: '创建／详细设置', usage: '用量与限额', signIn: '登录后管理资源', config: '身份验证或 Worker API 未配置。', loading: '加载中…', error: '无法加载管理数据。', refresh: '刷新', search: '按名称搜索', resources: '资源列表', empty: '未找到项目。', choose: '请从左侧选择资源。', select: '管理', flagsList: '功能开关', fileList: '文件列表（最多500条）', active: '已启用', inactive: '已停用', key: '开关键', value: 'JSON 值', enabled: '启用', newFlag: '新建开关', save: '保存开关', toggle: '切换状态', removeFlag: '删除开关', removeFlagConfirm: '永久删除该开关？应用程序将无法获取它。', disableConfirm: '停用该开关？公开 API 将不再返回它。', invalidNull: '当前 API 会将 null 转为 false；请先修改 JSON 值。', saved: '已保存。', deleted: '已删除。', unsaved: '放弃未保存的修改？', endpoint: '公开 API', copy: '复制地址', copied: '已复制', noFlags: '没有开关。', noFiles: '没有文件。', filename: '存储路径', size: '大小', type: '类型', updated: '最后更新', storage: '已用存储', unlimited: '无限制', upload: '上传文件', uploadFile: '选择文件', uploadPath: '目标路径（相对路径）', uploadConfirm: '覆盖此路径下的现有文件？原内容将丢失。', uploadHelp: '单个文件上限10 MiB，路径不能包含“..”或控制字符。', deleteFile: '永久删除文件', deleteFileConfirm: '永久删除此文件？公开地址也将失效。', published: '公开文件地址', paused: '已暂停', fileWarning: '列表不显示文件内容或 ETag。只有空间启用时公开地址才可访问。', flagWarning: '开关的 JSON 值可被公开 API 读取，请勿存储机密。', working: '处理中…' },
} as const;
function formattedDate(value: string | null, locale: string): string { if (!value) return '—'; return new Date(value).toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US'); }
function prettyBytes(value: number): string { return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1048576).toFixed(2)} MiB`; }
function Editor({ service, clerk }: { service: DataDeskService; clerk: Clerk }) {
  const { locale } = useI18n(); const t = COPY[locale];
  const [projects, setProjects] = useState<DataProject[]>([]); const [projectId, setProjectId] = useState(''); const [search, setSearch] = useState('');
  const [flags, setFlags] = useState<FlagItem[]>([]); const [files, setFiles] = useState<FileItem[]>([]); const [used, setUsed] = useState(0); const [limit, setLimit] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState(''); const [selectedPath, setSelectedPath] = useState('');
  const [flagKey, setFlagKey] = useState(''); const [flagText, setFlagText] = useState('false'); const [flagEnabled, setFlagEnabled] = useState(true);
  const [upload, setUpload] = useState<File | null>(null); const [uploadPath, setUploadPath] = useState('');
  const [loading, setLoading] = useState(false); const [detailsLoading, setDetailsLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [copied, setCopied] = useState(false);
  const listVersion = useRef(0); const detailVersion = useRef(0);
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const token = await clerk.session?.getToken();
    if (!API || !clerk.isSignedIn || !token) throw new Error('Authentication required');
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, cache: 'no-store', redirect: 'error' });
    const result: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(result, response.status, response.headers.get('x-request-id')));
    return result;
  }, [clerk]);
  const reloadProjects = useCallback(async () => {
    const v = ++listVersion.current; setLoading(true); setError('');
    try { const next = parseDataProjects(await request(dataPaths(service).list), service); if (v !== listVersion.current) return;
      setProjects(next); setProjectId(previous => next.some(item => item.id === previous) ? previous : next[0]?.id || '');
    } catch (reason) { if (v === listVersion.current) { setProjects([]); setProjectId(''); setError(reason instanceof Error ? reason.message : t.error); } }
    finally { if (v === listVersion.current) setLoading(false); }
  }, [request, service, t.error]);
  const reloadDetail = useCallback(async (id: string) => {
    const v = ++detailVersion.current; setDetailsLoading(true); setError('');
    try { const raw = await request(dataPaths(service, id).children); if (v !== detailVersion.current) return;
      if (service === 'flags') { const next = parseFlags(raw); setFlags(next); setSelectedKey(previous => next.some(item => item.key === previous) ? previous : next[0]?.key || ''); }
      else { const next = parseFiles(raw); setFiles(next.files); setUsed(next.used); setLimit(next.limit); setSelectedPath(previous => next.files.some(item => item.path === previous) ? previous : next.files[0]?.path || ''); }
    } catch (reason) { if (v === detailVersion.current) { setFlags([]); setFiles([]); setError(reason instanceof Error ? reason.message : t.error); } }
    finally { if (v === detailVersion.current) setDetailsLoading(false); }
  }, [request, service, t.error]);
  useEffect(() => { void reloadProjects(); return () => { listVersion.current++; }; }, [reloadProjects]);
  useEffect(() => { detailVersion.current++; setFlags([]); setFiles([]); setSelectedKey(''); setSelectedPath(''); setUpload(null); setUploadPath(''); setNotice(''); setCopied(false);
    if (projectId) void reloadDetail(projectId);
    return () => { detailVersion.current++; };
  }, [projectId, reloadDetail]);
  const project = projects.find(item => item.id === projectId) || null;
  const flag = flags.find(item => item.key === selectedKey) || null;
  const file = files.find(item => item.path === selectedPath) || null;
  useEffect(() => { setFlagKey(flag?.key || ''); setFlagText(flag ? JSON.stringify(flag.value, null, 2) : 'false'); setFlagEnabled(flag?.enabled ?? true); setNotice(''); }, [flag?.key, flag?.updatedAt]);
  const dirty = Boolean(service === 'flags' && (flag ? flagKey !== flag.key || flagText !== JSON.stringify(flag.value, null, 2) || flagEnabled !== flag.enabled : flagKey.trim() !== '' || flagText !== 'false' || !flagEnabled));
  function selectProject(id: string) { if (dirty && !window.confirm(t.unsaved)) return; setProjectId(id); }
  function selectFlag(key: string) { if (dirty && !window.confirm(t.unsaved)) return; setSelectedKey(key); }
  const visible = projects.filter(item => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  async function saveFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!project || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = prepareFlag(flagKey.trim(), flagText, flagEnabled);
      if (flag && body.key !== flag.key) throw new Error('Rename requires a new flag. Create it separately, then delete the old key.');
      await request(dataPaths('flags', project.id).children, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await reloadDetail(project.id); setSelectedKey(body.key); setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function toggleFlag() {
    if (!project || !flag || busy || dirty) return;
    if (flag.enabled && !window.confirm(t.disableConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try { const body = prepareFlag(flag.key, JSON.stringify(flag.value), !flag.enabled);
      await request(dataPaths('flags', project.id).children, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await reloadDetail(project.id); setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function deleteFlag() {
    if (!project || !flag || busy || dirty || !window.confirm(t.removeFlagConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(dataPaths('flags', project.id, flag.key).flag, { method: 'DELETE' }); await reloadDetail(project.id); setNotice(t.deleted); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!project || !upload || busy || !validFilePath(uploadPath)) { setError(t.uploadHelp); return; }
    if (upload.size > 10 * 1024 * 1024) { setError(t.uploadHelp); return; }
    if (files.some(item => item.path === uploadPath) && !window.confirm(t.uploadConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(dataPaths('files', project.id, uploadPath).object, { method: 'PUT', headers: { 'content-type': upload.type || 'application/octet-stream' }, body: await upload.arrayBuffer() });
      setUpload(null); setUploadPath(''); await reloadDetail(project.id); setSelectedPath(uploadPath); setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function deleteFile() {
    if (!project || !file || busy || !window.confirm(t.deleteFileConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(dataPaths('files', project.id, file.path).object, { method: 'DELETE' }); await reloadDetail(project.id); setNotice(t.deleted); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setCopied(true); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } }
  return <div className="shell resourceDeskBody">
    {error && <p className="fleetError" role="alert">{error}</p>}{notice && <p className="fleetNotice" role="status">{notice}</p>}
    <section className="fleetSummary" aria-label={t.resources}><div><small>{t.resources}</small><strong>{projects.length}</strong></div><div><small>{service === 'flags' ? t.flagsList : t.fileList}</small><strong>{service === 'flags' ? flags.length : files.length}</strong></div>{service === 'files' && <div><small>{t.storage}</small><strong>{prettyBytes(used)}</strong></div>}</section>
    <div className="resourceDeskGrid"><section className="fleetPanel resourceDeskInventory"><div className="resourceDeskHeading"><h2>{t.resources}</h2><button type="button" disabled={loading || busy} onClick={() => { void reloadProjects(); }}>{loading ? t.loading : t.refresh}</button></div>
      <input aria-label={t.search} placeholder={t.search} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} />
      {!visible.length ? <p>{loading ? t.loading : t.empty}</p> : <ul className="resourceDeskList">{visible.map(item => <li key={item.id}><button type="button" className={projectId === item.id ? 'resourceDeskSelected' : ''} aria-pressed={projectId === item.id} onClick={() => selectProject(item.id)}><strong>{item.name}</strong><small>{service === 'files' ? item.enabled ? t.active : t.paused : t.flagsList}</small><em>{t.select} →</em></button></li>)}</ul>}
    </section><section className="fleetPanel resourceDeskDetail"><h2>{project?.name || t.choose}</h2>{detailsLoading && <p role="status">{t.loading}</p>}
      {project && service === 'flags' && <><div className="resourceDeskPublic"><strong>{t.endpoint}</strong><code>{publicDataUrl('flags', API, project.publicId)}</code><button type="button" onClick={() => { void copy(publicDataUrl('flags', API, project.publicId)); }}>{copied ? t.copied : t.copy}</button></div>
        <h3>{t.flagsList}</h3><div className="dataDeskChildList" role="group" aria-label={t.flagsList}><button type="button" className={!selectedKey ? 'resourceDeskSelected' : ''} onClick={() => { if (dirty && !window.confirm(t.unsaved)) return; setSelectedKey(''); setFlagKey(''); setFlagText('false'); setFlagEnabled(true); }}>{t.newFlag} +</button>
          {flags.map(item => <button type="button" key={item.key} aria-pressed={selectedKey === item.key} className={selectedKey === item.key ? 'resourceDeskSelected' : ''} onClick={() => selectFlag(item.key)}><strong>{item.key}</strong><small>{item.enabled ? t.active : t.inactive}</small></button>)}</div>
        <form className="resourceDeskForm" onSubmit={event => { void saveFlag(event); }}><label>{t.key}<input required maxLength={100} readOnly={Boolean(flag)} value={flagKey} onChange={event => setFlagKey(event.target.value)} /></label><label>{t.value}<textarea rows={6} maxLength={32768} value={flagText} onChange={event => setFlagText(event.target.value)} /></label><label className="dataDeskCheck"><input type="checkbox" checked={flagEnabled} onChange={event => setFlagEnabled(event.target.checked)} />{t.enabled}</label>
          <div className="resourceDeskActions"><button type="submit" disabled={busy || !flagKey.trim() || Boolean(flag && !dirty)}>{busy ? t.working : t.save}</button>{flag && <><button type="button" disabled={busy || dirty} onClick={() => { void toggleFlag(); }}>{t.toggle}</button><button type="button" disabled={busy || dirty} onClick={() => { void deleteFlag(); }}>{t.removeFlag}</button></>}</div></form><p className="resourceDeskSafety">{t.flagWarning}</p>
      </>}
      {project && service === 'files' && <><p role="status">{t.storage}: {prettyBytes(used)} / {limit === null ? t.unlimited : prettyBytes(limit)}</p><h3>{t.fileList}</h3>
        {!files.length ? <p>{detailsLoading ? t.loading : t.noFiles}</p> : <div className="dataDeskChildList" role="group" aria-label={t.fileList}>{files.map(item => <button type="button" key={item.path} className={selectedPath === item.path ? 'resourceDeskSelected' : ''} aria-pressed={selectedPath === item.path} onClick={() => { setSelectedPath(item.path); setCopied(false); }}><strong>{item.path}</strong><small>{prettyBytes(item.size)} · {item.contentType}</small></button>)}</div>}
        {file && <section className="resourceDeskResults"><h4>{file.path}</h4><p>{t.size}: {prettyBytes(file.size)} · {t.type}: {file.contentType}</p><p>{t.updated}: {formattedDate(file.updatedAt, locale)}</p>{project.enabled ? <div className="resourceDeskPublic"><strong>{t.published}</strong><code>{publicDataUrl('files', API, project.publicId, file.path)}</code><button type="button" disabled={busy} onClick={() => { void copy(publicDataUrl('files', API, project.publicId, file.path)); }}>{copied ? t.copied : t.copy}</button></div> : <p>{t.paused}</p>}
          <div className="resourceDeskActions"><button type="button" disabled={busy} onClick={() => { void deleteFile(); }}>{t.deleteFile}</button></div></section>}
        <form className="resourceDeskForm" onSubmit={event => { void uploadFile(event); }}><h3>{t.upload}</h3><label>{t.uploadFile}<input type="file" onChange={event => { const next = event.target.files?.[0] || null; setUpload(next); setUploadPath(next?.name || ''); }} /></label><label>{t.uploadPath}<input required maxLength={512} value={uploadPath} onChange={event => setUploadPath(event.target.value)} /></label><p>{t.uploadHelp}</p><div className="resourceDeskActions"><button type="submit" disabled={!upload || !validFilePath(uploadPath) || busy}>{busy ? t.working : t.upload}</button></div></form><p className="resourceDeskSafety">{t.fileWarning}</p>
      </>}
    </section></div>
  </div>;
}
export default function ServiceFlagsFilesDesk({ service }: { service: DataDeskService }) {
  const { localizedHref, messages } = useI18n(); const { locale } = useI18n(); const t = COPY[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null); const [ready, setReady] = useState(!KEY); const [signedIn, setSignedIn] = useState(false); const [revision, setRevision] = useState(0);
  const account = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!KEY) return; let mounted = true; let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => { const instance = new ClerkClass(KEY); await instance.load({ ui }); if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      unsubscribe = instance.addListener(() => { if (mounted) { setSignedIn(Boolean(instance.isSignedIn)); setRevision(value => value + 1); } });
    }).catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; unsubscribe?.(); };
  }, []);
  useEffect(() => { if (!clerk || !signedIn || !account.current) return; const node = account.current; clerk.mountUserButton(node); return () => clerk.unmountUserButton(node); }, [clerk, signedIn, revision]);
  return <main className="fleetConsole resourceDesk"><nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a><div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={localizedHref(`/${service}/app/`)}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher />{signedIn ? <div ref={account} /> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <header className="shell fleetHero"><span>PICOSVC / {service.toUpperCase()} / RESOURCE MANAGEMENT</span><h1>{t[service]}</h1><p>{service === 'flags' ? t.flagsIntro : t.filesIntro}</p></header>
    {!API || !KEY ? <p className="shell fleetError" role="alert">{t.config}</p> : !ready ? <p className="shell" role="status">{t.loading}</p> : !signedIn || !clerk ? <section className="shell fleetPanel"><p>{t.signIn}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <Editor key={revision} service={service} clerk={clerk} />}
  </main>;
}
