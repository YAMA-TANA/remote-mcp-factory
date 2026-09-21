'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { workspaceApiError } from './workspace-helpers';
import { dataPaths, parseDocument, parseHookEvents, parseResources, parseSettings, parseTokens, prepareDocument, publicJsonUrl, validDocumentKey, type DataResource, type DataService, type HookEvent, type ScopedToken } from './service-json-hooks-model';
import './service-fleet-console.css';
import './service-resource-desk.css';
import './service-json-hooks-desk.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const COPY = {
  ja: { json: 'JSON 個別管理', hooks: 'Hooks 個別管理', jsonIntro: 'ストアの公開設定と、キーを指定したドキュメントの読み書きを管理します。', hooksIntro: '受信箱を管理し、本文を表示せずに受信履歴を確認します。', dashboard: '全体ダッシュボード', workspace: '作成・詳細設定', usage: '利用量・上限', login: 'ログインして個別管理を開く', config: '認証またはWorker APIが未設定です。', loading: '読み込み中…', error: '管理情報を取得できませんでした。', refresh: '再読み込み', search: '名前で検索', resources: '管理対象', none: '対象がありません。', choose: '左の一覧から選択してください。', select: '管理する', active: '受信中', paused: '停止中', settings: 'ストア設定', publicRead: '認証なしの読み取りを許可する', publicWarning: '公開すると、キーを知っている誰でも認証なしでドキュメントを読み取れます。秘密情報を保存しないでください。', save: '設定を保存', saved: '保存しました。', key: 'ドキュメントキー', open: 'キーを指定して読み込む', newDoc: '新規ドキュメント', document: 'JSON ドキュメント', write: 'ドキュメントを保存', remove: 'ドキュメントを削除', removeConfirm: 'このドキュメントを完全に削除しますか？', overwriteConfirm: '同じキーのドキュメントを保存しますか？他の編集を上書きする可能性があります。', unsaved: '未保存の編集を破棄しますか？', missing: 'ドキュメントが存在しません。新規として保存できます。', endpoint: '公開エンドポイント', copy: 'URLをコピー', copied: 'コピーしました', tokenList: 'スコープ付きトークン（秘密文字列は非表示）', revoke: 'トークンを無効化', revokeConfirm: 'このトークンを完全に無効化しますか？利用中の連携が停止します。', permissions: '権限', expiry: '期限', inbox: 'Webhook受信箱', rename: '受信箱の名称', update: '名称を更新', pause: '受信を停止', resume: '受信を再開', pauseConfirm: 'この受信箱の受付を停止しますか？新しいWebhookは404になります。', events: '受信イベント（本文・ヘッダーは非表示）', method: 'メソッド', time: '受信日時', bytes: 'サイズ', type: 'Content-Type', more: '過去の履歴を表示', deleteEvent: 'イベントを削除', deleteConfirm: 'このイベントと保存された本文を完全に削除しますか？', noEvents: '受信履歴はありません。', note: '本文・認証ヘッダー・クエリ・受信パスはこの画面では取得・表示しません。', caution: '保存値は指定したキーを明示的に読み込んだときだけ取得します。編集画面ではブラウザにのみ保持されます。', working: '処理中…', notFound: '選択したリソースが見つかりません。' },
  en: { json: 'JSON management', hooks: 'Hooks management', jsonIntro: 'Control store visibility and read/write documents by explicit key.', hooksIntro: 'Manage webhook inboxes and view event metadata without showing payloads.', dashboard: 'All-service dashboard', workspace: 'Create / detailed settings', usage: 'Usage & limits', login: 'Sign in to manage resources', config: 'Authentication or Worker API is not configured.', loading: 'Loading…', error: 'Could not load management information.', refresh: 'Refresh', search: 'Search by name', resources: 'Resources', none: 'Nothing found.', choose: 'Select a resource from the list.', select: 'Manage', active: 'Receiving', paused: 'Paused', settings: 'Store settings', publicRead: 'Allow unauthenticated reads', publicWarning: 'Anyone who knows a key can read that document without signing in when public reads are enabled. Never store secrets.', save: 'Save settings', saved: 'Saved.', key: 'Document key', open: 'Load document by key', newDoc: 'New document', document: 'JSON document', write: 'Save document', remove: 'Delete document', removeConfirm: 'Permanently delete this document?', overwriteConfirm: 'Save this document key? Another editor’s changes may be overwritten.', unsaved: 'Discard unsaved edits?', missing: 'Document does not exist. You can save a new one.', endpoint: 'Public endpoint', copy: 'Copy URL', copied: 'Copied', tokenList: 'Scoped tokens (secret values hidden)', revoke: 'Revoke token', revokeConfirm: 'Permanently revoke this token? Integrations using it will stop.', permissions: 'Scope', expiry: 'Expires', inbox: 'Webhook inbox', rename: 'Inbox name', update: 'Update name', pause: 'Pause receiving', resume: 'Resume receiving', pauseConfirm: 'Pause this inbox? New webhook requests will return 404.', events: 'Received events (payloads and headers hidden)', method: 'Method', time: 'Received', bytes: 'Size', type: 'Content type', more: 'Load older events', deleteEvent: 'Delete event', deleteConfirm: 'Permanently delete this event and its stored body?', noEvents: 'No events.', note: 'Payloads, authentication headers, query values and request paths are not fetched or displayed in this view.', caution: 'Values are fetched only for explicitly selected document keys and kept in browser memory while editing.', working: 'Working…', notFound: 'The resource could not be found.' },
  'zh-CN': { json: 'JSON 单项管理', hooks: 'Hooks 单项管理', jsonIntro: '管理存储区公开设置，并按指定键读写文档。', hooksIntro: '管理Webhook收件箱，仅查看事件元数据，不显示正文。', dashboard: '全部服务总览', workspace: '创建／详细设置', usage: '用量与限额', login: '登录后管理资源', config: '身份验证或Worker API未配置。', loading: '加载中…', error: '无法获取管理信息。', refresh: '刷新', search: '按名称搜索', resources: '资源列表', none: '没有找到资源。', choose: '请从左侧选择资源。', select: '管理', active: '接收中', paused: '已暂停', settings: '存储区设置', publicRead: '允许无需身份验证读取', publicWarning: '启用后，任何知道文档键的人都可无需登录读取内容，请勿存储机密。', save: '保存设置', saved: '已保存。', key: '文档键', open: '按键读取文档', newDoc: '新建文档', document: 'JSON 文档', write: '保存文档', remove: '删除文档', removeConfirm: '永久删除此文档？', overwriteConfirm: '保存此文档键？可能覆盖其他编辑者的更改。', unsaved: '放弃未保存的修改？', missing: '文档不存在，可以创建新文档。', endpoint: '公开端点', copy: '复制地址', copied: '已复制', tokenList: '限定范围令牌（隐藏密钥）', revoke: '撤销令牌', revokeConfirm: '永久撤销该令牌？使用它的集成将停止。', permissions: '权限', expiry: '过期时间', inbox: 'Webhook收件箱', rename: '收件箱名称', update: '更新名称', pause: '停止接收', resume: '恢复接收', pauseConfirm: '暂停收件箱？新Webhook请求将返回404。', events: '接收事件（隐藏正文和请求头）', method: '方法', time: '接收时间', bytes: '大小', type: '内容类型', more: '加载更早事件', deleteEvent: '删除事件', deleteConfirm: '永久删除此事件和保存的正文？', noEvents: '暂无事件。', note: '此界面不获取或显示正文、身份验证请求头、查询参数或请求路径。', caution: '仅在明确指定文档键后获取值，编辑期间仅保存在浏览器内存中。', working: '处理中…', notFound: '找不到所选资源。' },
} as const;
const fmt = (value: string | null, locale: string) => value ? new Date(value).toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US') : '—';

function Editor({ service, clerk }: { service: DataService; clerk: Clerk }) {
  const { locale } = useI18n(); const t = COPY[locale];
  const [resources, setResources] = useState<DataResource[]>([]); const [selectedId, setSelectedId] = useState(''); const [search, setSearch] = useState('');
  const [publicRead, setPublicRead] = useState(false); const [tokens, setTokens] = useState<ScopedToken[]>([]);
  const [documentKey, setDocumentKey] = useState(''); const [loadedKey, setLoadedKey] = useState(''); const [docText, setDocText] = useState(''); const [originalText, setOriginalText] = useState(''); const [docExists, setDocExists] = useState(false);
  const [events, setEvents] = useState<HookEvent[]>([]); const [nextBefore, setNextBefore] = useState<string | null>(null); const [inboxName, setInboxName] = useState('');
  const [loading, setLoading] = useState(false); const [detailLoading, setDetailLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [copied, setCopied] = useState(false);
  const listVersion = useRef(0); const detailVersion = useRef(0); const documentVersion = useRef(0);
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const token = await clerk.session?.getToken(); if (!API || !clerk.isSignedIn || !token) throw new Error('Authentication required');
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, cache: 'no-store', redirect: 'error' });
    const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(data, response.status, response.headers.get('x-request-id')));
    return data;
  }, [clerk]);
  const reloadList = useCallback(async () => {
    const version = ++listVersion.current; setLoading(true); setError('');
    try { const next = parseResources(await request(dataPaths(service).list), service);
      if (version !== listVersion.current) return; setResources(next); setSelectedId(previous => next.some(item => item.id === previous) ? previous : next[0]?.id || '');
    } catch (reason) { if (version === listVersion.current) { setResources([]); setSelectedId(''); setError(reason instanceof Error ? reason.message : t.error); } }
    finally { if (version === listVersion.current) setLoading(false); }
  }, [request, service, t.error]);
  const reloadDetails = useCallback(async (id: string) => {
    const version = ++detailVersion.current; setDetailLoading(true); setError('');
    try { const paths = dataPaths(service, id);
      if (service === 'json') {
        const [settings, scoped] = await Promise.all([request(paths.settings), request(paths.tokens)]);
        if (version !== detailVersion.current) return; setPublicRead(parseSettings(settings)); setTokens(parseTokens(scoped));
      } else {
        const history = parseHookEvents(await request(paths.events));
        if (version !== detailVersion.current) return; setEvents(history.events); setNextBefore(history.nextBefore);
      }
    } catch (reason) { if (version === detailVersion.current) { setTokens([]); setEvents([]); setNextBefore(null); setError(reason instanceof Error ? reason.message : t.error); } }
    finally { if (version === detailVersion.current) setDetailLoading(false); }
  }, [request, service, t.error]);
  useEffect(() => { void reloadList(); return () => { listVersion.current++; }; }, [reloadList]);
  useEffect(() => {
    detailVersion.current++; documentVersion.current++; setTokens([]); setEvents([]); setNextBefore(null); setDocumentKey(''); setLoadedKey(''); setDocText(''); setOriginalText(''); setDocExists(false); setPublicRead(false); setError(''); setNotice(''); setCopied(false);
    setInboxName(resources.find(resource => resource.id === selectedId)?.name || '');
    if (selectedId) void reloadDetails(selectedId);
    return () => { detailVersion.current++; documentVersion.current++; };
  }, [selectedId, reloadDetails, resources]);
  const selected = resources.find(resource => resource.id === selectedId) || null;
  const dirty = Boolean(loadedKey && docText !== originalText);
  function selectResource(id: string) { if (busy || (dirty && !window.confirm(t.unsaved))) return; setSelectedId(id); }
  const visible = resources.filter(resource => resource.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  async function loadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy || !validDocumentKey(documentKey) || (dirty && !window.confirm(t.unsaved))) return;
    const version = ++documentVersion.current; const key = documentKey; setBusy(true); setError(''); setNotice(''); setLoadedKey(''); setDocExists(false); setDocText(''); setOriginalText('');
    try { const data = parseDocument(await request(dataPaths('json', selected.id, key).document), key);
      if (version !== documentVersion.current) return; const text = JSON.stringify(data.value, null, 2); setLoadedKey(key); setDocText(text); setOriginalText(text); setDocExists(true);
    } catch (reason) { if (version === documentVersion.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { if (version === documentVersion.current) setBusy(false); }
  }
  function newDocument() { if (busy || (dirty && !window.confirm(t.unsaved))) return; documentVersion.current++; setLoadedKey(''); setDocumentKey(''); setDocText('{}'); setOriginalText('{}'); setDocExists(false); setError(''); setNotice(''); }
  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return;
    const key = loadedKey || documentKey; setBusy(true); setError(''); setNotice('');
    try { const prepared = prepareDocument(key, docText); if (docExists && !window.confirm(t.overwriteConfirm)) return;
      await request(dataPaths('json', selected.id, prepared.key).document, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: prepared.body });
      setLoadedKey(prepared.key); setDocumentKey(prepared.key); setOriginalText(docText); setDocExists(true); setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function removeDocument() {
    if (!selected || !loadedKey || !docExists || busy || !window.confirm(t.removeConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(dataPaths('json', selected.id, loadedKey).document, { method: 'DELETE' }); newDocumentAfterDelete(); setNotice(t.saved); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  function newDocumentAfterDelete() { documentVersion.current++; setLoadedKey(''); setDocumentKey(''); setDocText('{}'); setOriginalText('{}'); setDocExists(false); }
  async function changeVisibility() {
    if (!selected || busy || (publicRead === false && !window.confirm(t.publicWarning))) return;
    setBusy(true); setError(''); setNotice('');
    try { const result = await request(dataPaths('json', selected.id).settings, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicRead: !publicRead }) }); setPublicRead(parseSettings(result)); setNotice(t.saved); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function revokeToken(id: string) {
    if (!selected || busy || !window.confirm(t.revokeConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(`${dataPaths('json', selected.id).tokens}/${id}`, { method: 'DELETE' }); await reloadDetails(selected.id); setNotice(t.saved); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function changeInbox(pause: boolean) {
    if (!selected || busy || (pause && !window.confirm(t.pauseConfirm))) return;
    setBusy(true); setError(''); setNotice('');
    try { const name = inboxName.trim(); if (!name || name.length > 120) throw new Error('Name must be 1–120 characters');
      await request(dataPaths('hooks', selected.id).item, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, enabled: !pause }) });
      await reloadList(); setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function loadMore() {
    if (!selected || !nextBefore || busy) return;
    const id = selected.id; const version = detailVersion.current; setBusy(true); setError('');
    try { const next = parseHookEvents(await request(`${dataPaths('hooks', id).events}&before=${encodeURIComponent(nextBefore)}`));
      if (version !== detailVersion.current) return; setEvents(previous => [...previous, ...next.events.filter(item => !previous.some(existing => existing.id === item.id))]); setNextBefore(next.nextBefore);
    } catch (reason) { if (version === detailVersion.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function deleteEvent(id: string) {
    if (!selected || busy || !window.confirm(t.deleteConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(`/api/picosvc/hooks/events/${id}`, { method: 'DELETE' }); setEvents(previous => previous.filter(item => item.id !== id)); await reloadList(); setNotice(t.saved); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setCopied(true); } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); } }
  const endpoint = selected && service === 'json' ? publicJsonUrl(API, selected, loadedKey || documentKey) : selected?.endpoint || null;
  return <div className="shell resourceDeskBody">
    {error && <p className="fleetError" role="alert">{error}</p>}{notice && <p className="fleetNotice" role="status">{notice}</p>}
    <section className="fleetSummary" aria-label={t.resources}><div><small>{t.resources}</small><strong>{resources.length}</strong></div><div><small>{service === 'json' ? t.tokenList : t.events}</small><strong>{service === 'json' ? tokens.length : events.length}</strong></div></section>
    <div className="resourceDeskGrid"><section className="fleetPanel resourceDeskInventory"><div className="resourceDeskHeading"><h2>{t.resources}</h2><button type="button" disabled={busy || loading} onClick={() => { void reloadList(); }}>{loading ? t.loading : t.refresh}</button></div><input aria-label={t.search} placeholder={t.search} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} />
      {!visible.length ? <p>{loading ? t.loading : t.none}</p> : <ul className="resourceDeskList">{visible.map(item => <li key={item.id}><button type="button" disabled={busy} className={selectedId === item.id ? 'resourceDeskSelected' : ''} aria-pressed={selectedId === item.id} onClick={() => selectResource(item.id)}><strong>{item.name}</strong><small>{service === 'hooks' ? item.enabled ? t.active : t.paused : 'JSON'}</small><em>{t.select} →</em></button></li>)}</ul>}
    </section><section className="fleetPanel resourceDeskDetail"><h2>{selected?.name || t.choose}</h2>{detailLoading && <p role="status">{t.loading}</p>}
      {selected && service === 'json' && <><section className="resourceDeskResults"><h3>{t.settings}</h3><label className="jsonHooksCheck"><input type="checkbox" checked={publicRead} disabled={busy || detailLoading} onChange={() => { void changeVisibility(); }} />{t.publicRead}</label><p className="resourceDeskSafety">{t.publicWarning}</p></section>
        <section className="resourceDeskResults"><h3>{t.document}</h3><div className="resourceDeskActions"><button type="button" disabled={busy} onClick={newDocument}>{t.newDoc}</button></div><form className="resourceDeskForm" onSubmit={event => { void loadDocument(event); }}><label>{t.key}<input required maxLength={200} value={documentKey} disabled={busy || Boolean(loadedKey)} onChange={event => setDocumentKey(event.target.value)} /></label><button type="submit" disabled={busy || !validDocumentKey(documentKey) || Boolean(loadedKey)}>{t.open}</button></form>
          {(loadedKey || (docText && !docExists)) && <form className="resourceDeskForm" onSubmit={event => { void saveDocument(event); }}><label>{t.document}<textarea rows={12} value={docText} onChange={event => setDocText(event.target.value)} spellCheck={false} /></label><div className="resourceDeskActions"><button type="submit" disabled={busy || !validDocumentKey(loadedKey || documentKey)}>{busy ? t.working : t.write}</button>{docExists && <button type="button" disabled={busy} onClick={() => { void removeDocument(); }}>{t.remove}</button>}</div></form>}
          {endpoint && <div className="resourceDeskPublic"><strong>{t.endpoint}</strong><code>{endpoint}</code><button type="button" disabled={busy} onClick={() => { void copy(endpoint); }}>{copied ? t.copied : t.copy}</button></div>}<p className="resourceDeskSafety">{t.caution}</p></section>
        <section className="resourceDeskResults"><h3>{t.tokenList}</h3>{!tokens.length ? <p>{t.none}</p> : <ul className="jsonHooksEvents">{tokens.map(token => <li key={token.id}><strong>{token.label || token.id}</strong><small>{t.permissions}: {token.scope} · {t.expiry}: {fmt(token.expiresAt, locale)} · {token.prefix || '*'}</small><button type="button" disabled={busy} onClick={() => { void revokeToken(token.id); }}>{t.revoke}</button></li>)}</ul>}</section>
      </>}
      {selected && service === 'hooks' && <><section className="resourceDeskResults"><h3>{t.inbox}</h3><div className="resourceDeskPublic"><strong>{t.endpoint}</strong><code>{selected.endpoint || '—'}</code><button type="button" disabled={!selected.endpoint} onClick={() => { if (selected.endpoint) void copy(selected.endpoint); }}>{copied ? t.copied : t.copy}</button></div><label className="resourceDeskForm">{t.rename}<input maxLength={120} value={inboxName} onChange={event => setInboxName(event.target.value)} /></label><div className="resourceDeskActions"><button type="button" disabled={busy || !inboxName.trim() || inboxName.trim() === selected.name} onClick={() => { void changeInbox(!selected.enabled); }}>{t.update}</button><button type="button" disabled={busy || inboxName.trim() !== selected.name} onClick={() => { void changeInbox(selected.enabled); }}>{selected.enabled ? t.pause : t.resume}</button></div></section>
        <section className="resourceDeskResults"><h3>{t.events}</h3><p className="resourceDeskSafety">{t.note}</p>{!events.length ? <p>{detailLoading ? t.loading : t.noEvents}</p> : <ul className="jsonHooksEvents">{events.map(event => <li key={event.id}><strong>{event.method} · {fmt(event.at, locale)}</strong><small>{t.bytes}: {event.bytes} · {t.type}: {event.contentType || '—'}</small><button type="button" disabled={busy} onClick={() => { void deleteEvent(event.id); }}>{t.deleteEvent}</button></li>)}</ul>}{nextBefore && <button type="button" disabled={busy} onClick={() => { void loadMore(); }}>{t.more}</button>}</section>
      </>}
    </section></div>
  </div>;
}
export default function ServiceJsonHooksDesk({ service }: { service: DataService }) {
  const { localizedHref, messages, locale } = useI18n(); const t = COPY[locale];
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
    <header className="shell fleetHero"><span>PICOSVC / {service.toUpperCase()} / RESOURCE MANAGEMENT</span><h1>{t[service]}</h1><p>{service === 'json' ? t.jsonIntro : t.hooksIntro}</p></header>
    {!API || !KEY ? <p className="shell fleetError" role="alert">{t.config}</p> : !ready ? <p className="shell" role="status">{t.loading}</p> : !signedIn || !clerk ? <section className="shell fleetPanel"><p>{t.login}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <Editor key={revision} service={service} clerk={clerk} />}
  </main>;
}
