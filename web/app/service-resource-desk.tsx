'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { workspaceApiError } from './workspace-helpers';
import {
  filterDeskResources, parseDeskResources, parseFeedPreview, parseFeedRefresh, patchDeskResource,
  resourcePaths, resourcePublicUrl, type DeskResource, type DeskService, type FeedPreview, type FeedRefresh, type Selectors,
} from './service-resource-desk-model';
import './service-fleet-console.css';
import './service-resource-desk.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const FIELDS = ['itemSelector', 'titleSelector', 'linkSelector', 'contentSelector', 'dateSelector'] as const;
const WORDS = {
  ja: {
    qrTitle: 'QRリンク 個別管理', rssTitle: 'RSSフィード 個別管理', qrIntro: '発行済みQRを選び、転送先・スキャン数・公開状態を管理します。', rssIntro: 'フィードを選び、抽出設定・プレビュー・更新を管理します。',
    dashboard: '全体ダッシュボード', workspace: '作成・詳細設定', usage: '利用量・上限', login: 'ログインして個別管理を開く', config: '認証またはWorker APIが未設定です。', loading: '読み込み中…', error: '情報を取得できませんでした。', refresh: '一覧を更新', search: '名前・ドメインで検索', all: 'すべて', enabled: '公開中', paused: '停止中', total: '登録数', active: '公開中', stopped: '停止中', inventory: '管理対象', empty: '該当するリソースはありません。', select: '個別に管理', details: '選択したリソース', choose: '左から管理対象を選択してください。', name: '名前', target: '転送先URL', source: '取得元URL', updated: '最終更新', checked: '最終取得', scans: '累計スキャン', never: '記録なし', save: '設定を保存', saving: '処理中…', unchanged: '未保存の変更はありません。', saved: '設定を保存しました。', pause: '停止する', resume: '再開する', pauseQr: 'QRの転送を停止しますか？印刷済みQRもアクセスできなくなります。', pauseRss: 'フィードの公開と定期更新を停止しますか？RSSリーダーから取得できなくなります。', pausedNotice: '停止しました。', resumedNotice: '再開しました。', public: '公開URL', copy: 'URLをコピー', copied: 'コピーしました', qrImage: 'QRコード', noQr: '停止中のQRは画像を表示しません。', selectors: '記事抽出のCSSセレクター', itemSelector: '記事要素', titleSelector: 'タイトル', linkSelector: 'リンク', contentSelector: '本文', dateSelector: '日付', selectorHint: '空欄なら自動抽出します。プレビューは保存済みの設定で動作します。', quota: '抽出プレビュー・手動更新はそれぞれRSS確認枠を1回消費します。', preview: '保存済み設定でプレビュー（1回消費）', refreshFeed: '今すぐ更新（1回消費）', previewConfirm: 'RSS確認枠を1回消費してプレビューしますか？', refreshConfirm: 'RSS確認枠を1回消費してフィードを更新しますか？', previewTitle: '抽出プレビュー', noItems: '抽出項目がありません。', refreshTitle: '手動更新結果', changed: '変更あり', noChange: '変更なし', extracted: '抽出件数', inserted: '新規追加', used: '今月の確認済み回数', changeFirst: '設定を保存してからプレビュー・更新してください。', qrNote: '転送先URLはこの編集フォームだけに表示します。URLに秘密情報を含めないでください。', rssNote: 'プレビューは公開ページのタイトルのみ表示します。元ページ内の秘密情報を抽出対象にしないでください。',
  },
  en: {
    qrTitle: 'QR link management', rssTitle: 'RSS feed management', qrIntro: 'Choose a QR link to manage its destination, scan total and availability.', rssIntro: 'Choose a feed to manage extraction, previews and refreshes.',
    dashboard: 'All-service dashboard', workspace: 'Create / detailed settings', usage: 'Usage & limits', login: 'Sign in to manage resources', config: 'Authentication or Worker API is not configured.', loading: 'Loading…', error: 'Could not load management data.', refresh: 'Refresh inventory', search: 'Search name or domain', all: 'All', enabled: 'Published', paused: 'Paused', total: 'Resources', active: 'Published', stopped: 'Paused', inventory: 'Resources', empty: 'No matching resources.', select: 'Manage resource', details: 'Selected resource', choose: 'Choose a resource from the list.', name: 'Name', target: 'Destination URL', source: 'Source URL', updated: 'Last updated', checked: 'Last checked', scans: 'Total scans', never: 'No record', save: 'Save settings', saving: 'Working…', unchanged: 'No unsaved changes.', saved: 'Settings saved.', pause: 'Pause', resume: 'Resume', pauseQr: 'Pause QR redirects? Printed QR codes will stop working.', pauseRss: 'Pause feed publishing and scheduled updates? RSS readers will lose access.', pausedNotice: 'Paused.', resumedNotice: 'Resumed.', public: 'Public URL', copy: 'Copy URL', copied: 'Copied', qrImage: 'QR code', noQr: 'QR image is hidden while the link is paused.', selectors: 'Article CSS selectors', itemSelector: 'Article', titleSelector: 'Title', linkSelector: 'Link', contentSelector: 'Content', dateSelector: 'Date', selectorHint: 'Leave blank for automatic extraction. Preview uses saved settings only.', quota: 'Preview and manual refresh each consume one RSS check.', preview: 'Preview saved settings (1 check)', refreshFeed: 'Refresh now (1 check)', previewConfirm: 'Spend one RSS check to preview this feed?', refreshConfirm: 'Spend one RSS check to refresh this feed?', previewTitle: 'Extraction preview', noItems: 'No items extracted.', refreshTitle: 'Refresh result', changed: 'Changed', noChange: 'Unchanged', extracted: 'Extracted', inserted: 'New entries', used: 'Checks used this month', changeFirst: 'Save settings before previewing or refreshing.', qrNote: 'The full destination URL appears only in this editor. Avoid putting secrets in URLs.', rssNote: 'The preview shows article titles only. Do not extract private content from source pages.',
  },
  'zh-CN': {
    qrTitle: 'QR 链接单项管理', rssTitle: 'RSS 订阅单项管理', qrIntro: '选择二维码，管理目标地址、扫描次数与启用状态。', rssIntro: '选择订阅源，管理提取规则、预览及刷新。',
    dashboard: '全部服务总览', workspace: '创建／详细设置', usage: '用量与限额', login: '登录后管理资源', config: '身份验证或 Worker API 未配置。', loading: '加载中…', error: '无法加载管理信息。', refresh: '刷新列表', search: '搜索名称或域名', all: '全部', enabled: '已发布', paused: '已暂停', total: '资源数', active: '已发布', stopped: '已暂停', inventory: '资源列表', empty: '没有符合条件的资源。', select: '管理此资源', details: '所选资源', choose: '从列表中选择资源。', name: '名称', target: '目标地址', source: '来源地址', updated: '最后更新', checked: '最近检查', scans: '累计扫描', never: '无记录', save: '保存设置', saving: '处理中…', unchanged: '没有未保存的更改。', saved: '设置已保存。', pause: '暂停', resume: '恢复', pauseQr: '暂停二维码跳转？已印刷的二维码也将无法使用。', pauseRss: '暂停订阅发布与定时刷新？RSS 阅读器将无法获取。', pausedNotice: '已暂停。', resumedNotice: '已恢复。', public: '公开地址', copy: '复制地址', copied: '已复制', qrImage: '二维码', noQr: '暂停时不显示二维码图片。', selectors: '文章 CSS 选择器', itemSelector: '文章', titleSelector: '标题', linkSelector: '链接', contentSelector: '内容', dateSelector: '日期', selectorHint: '留空则自动提取。预览仅使用已保存的设置。', quota: '预览和手动刷新各消耗一次 RSS 检查额度。', preview: '预览已保存的设置（1 次）', refreshFeed: '立即刷新（1 次）', previewConfirm: '消耗一次 RSS 检查额度进行预览吗？', refreshConfirm: '消耗一次 RSS 检查额度进行刷新吗？', previewTitle: '提取预览', noItems: '没有提取的项目。', refreshTitle: '刷新结果', changed: '有变化', noChange: '无变化', extracted: '提取数量', inserted: '新增条目', used: '本月已用检查次数', changeFirst: '请先保存设置，再预览或刷新。', qrNote: '完整目标地址只在编辑表单中显示。请勿在 URL 中放置密钥。', rssNote: '预览仅显示文章标题。不要从来源页面提取私密内容。',
  },
} as const;
function host(value: string): string { try { return new URL(value).hostname; } catch { return '—'; } }
function date(value: string | null, locale: string, empty: string): string {
  if (!value) return empty;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US') : empty;
}
function Editor({ service, clerk }: { service: DeskService; clerk: Clerk }) {
  const { locale } = useI18n();
  const t = WORDS[locale];
  const [items, setItems] = useState<DeskResource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'paused'>('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<{ name: string; targetUrl: string; selectors: Selectors } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<FeedPreview | null>(null);
  const [refreshResult, setRefreshResult] = useState<FeedRefresh | null>(null);
  const [copied, setCopied] = useState(false);
  const version = useRef(0);
  const previousResource = useRef('');
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const token = await clerk.session?.getToken();
    if (!API || !clerk.isSignedIn || !token) throw new Error('Sign in again to manage resources.');
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, redirect: 'error', cache: 'no-store' });
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return payload;
  }, [clerk]);
  const reload = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setError('');
    try {
      const result = parseDeskResources(await request(resourcePaths(service).list), service);
      if (current !== version.current) return;
      setItems(result);
      setSelectedId(old => result.some(item => item.id === old) ? old : result[0]?.id || '');
    } catch (reason) {
      if (current === version.current) { setItems([]); setSelectedId(''); setError(reason instanceof Error ? reason.message : t.error); }
    } finally { if (current === version.current) setLoading(false); }
  }, [request, service, t.error]);
  useEffect(() => { void reload(); return () => { version.current++; }; }, [reload]);
  const selected = items.find(item => item.id === selectedId) || null;
  useEffect(() => {
    const changedResource = previousResource.current !== (selected?.id || '');
    previousResource.current = selected?.id || '';
    setDraft(selected ? { name: selected.name, targetUrl: selected.targetUrl, selectors: { ...selected.selectors } } : null);
    // A refreshed feed changes updatedAt: retain the result of the refresh that caused it.
    if (changedResource) { setPreview(null); setRefreshResult(null); setCopied(false); setNotice(''); }
  }, [selected?.id, selected?.updatedAt]);
  const visible = filterDeskResources(items, query, filter);
  const dirty = Boolean(selected && draft && (draft.name !== selected.name || draft.targetUrl !== selected.targetUrl || JSON.stringify(draft.selectors) !== JSON.stringify(selected.selectors)));
  const publicUrl = selected ? resourcePublicUrl(service, API, selected.publicId) : '';
  const active = items.filter(item => item.enabled).length;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !draft || !dirty || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = patchDeskResource(service, draft.name, draft.targetUrl, draft.selectors);
      await request(resourcePaths(service, selected.id).item!, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await reload(); setPreview(null); setRefreshResult(null); setNotice(t.saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function toggle() {
    if (!selected || busy || (selected.enabled && !window.confirm(service === 'qr' ? t.pauseQr : t.pauseRss))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(resourcePaths(service, selected.id).item!, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !selected.enabled }) });
      await reload(); setNotice(selected.enabled ? t.pausedNotice : t.resumedNotice);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function feedAction(kind: 'preview' | 'refresh') {
    if (!selected || service !== 'rss' || busy || dirty) { if (dirty) setError(t.changeFirst); return; }
    if (!window.confirm(kind === 'preview' ? t.previewConfirm : t.refreshConfirm)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const path = resourcePaths(service, selected.id)[kind];
      if (!path) throw new Error('Feed action unavailable.');
      const payload = await request(path, { method: 'POST' });
      if (kind === 'preview') { setPreview(parseFeedPreview(payload)); setRefreshResult(null); }
      else { setRefreshResult(parseFeedRefresh(payload)); setPreview(null); await reload(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
    finally { setBusy(false); }
  }
  async function copyPublicUrl() {
    if (!selected) return;
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.error); }
  }
  return <div className="shell resourceDeskBody">
    {error && <p className="fleetError" role="alert">{error}</p>}{notice && <p className="fleetNotice" role="status">{notice}</p>}
    <section className="fleetSummary" aria-label={t.inventory}><div><small>{t.total}</small><strong>{items.length}</strong></div><div><small>{t.active}</small><strong>{active}</strong></div><div><small>{t.stopped}</small><strong>{items.length - active}</strong></div></section>
    <div className="resourceDeskGrid"><section className="fleetPanel resourceDeskInventory" aria-label={t.inventory}>
      <div className="resourceDeskHeading"><h2>{t.inventory}</h2><button type="button" disabled={loading || busy} onClick={() => { void reload(); }}>{loading ? t.loading : t.refresh}</button></div>
      <input aria-label={t.search} placeholder={t.search} value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />
      <div className="resourceDeskFilters" role="group" aria-label={t.inventory}>{(['all', 'enabled', 'paused'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t[value]}</button>)}</div>
      {!visible.length ? <p>{loading ? t.loading : t.empty}</p> : <ul className="resourceDeskList">{visible.map(item => <li key={item.id}><button type="button" className={item.id === selectedId ? 'resourceDeskSelected' : ''} aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><small>{host(item.targetUrl)} · {item.enabled ? t.enabled : t.paused}</small><span>{service === 'qr' ? `${t.scans}: ${item.scans.toLocaleString(locale)}` : `${t.checked}: ${date(item.checkedAt, locale, t.never)}`}</span><em>{t.select} →</em></button></li>)}</ul>}
    </section><section className="fleetPanel resourceDeskDetail" aria-label={t.details}>
      <h2>{t.details}</h2>{!selected || !draft ? <p>{t.choose}</p> : <>
        <div className="resourceDeskMeta"><strong>{selected.name}</strong><span>{selected.enabled ? t.enabled : t.paused}</span><small>{t.updated}: {date(selected.updatedAt, locale, t.never)}</small>{service === 'qr' ? <small>{t.scans}: {selected.scans.toLocaleString(locale)}</small> : <small>{t.checked}: {date(selected.checkedAt, locale, t.never)}</small>}</div>
        <div className="resourceDeskPublic"><strong>{t.public}</strong><code>{publicUrl}</code><button type="button" disabled={busy} onClick={() => { void copyPublicUrl(); }}>{copied ? t.copied : t.copy}</button></div>
        {service === 'qr' && (selected.enabled ? <div className="resourceDeskQr"><img src={resourcePublicUrl('qr', API, selected.publicId, true)} width="180" height="180" alt={t.qrImage}/><span>{t.qrImage}</span></div> : <p>{t.noQr}</p>)}
        <form className="resourceDeskForm" onSubmit={event => { void save(event); }}><label>{t.name}<input required maxLength={80} value={draft.name} onChange={event => setDraft(old => old ? { ...old, name: event.target.value } : old)} /></label><label>{service === 'qr' ? t.target : t.source}<input type="url" required maxLength={4096} value={draft.targetUrl} onChange={event => setDraft(old => old ? { ...old, targetUrl: event.target.value } : old)} /></label>
          {service === 'rss' && <fieldset><legend>{t.selectors}</legend><p>{t.selectorHint}</p>{FIELDS.map(key => <label key={key}>{t[key]}<input maxLength={300} placeholder="CSS selector" value={draft.selectors[key]} onChange={event => setDraft(old => old ? { ...old, selectors: { ...old.selectors, [key]: event.target.value } } : old)} /></label>)}</fieldset>}
          <div className="resourceDeskActions"><button type="submit" disabled={busy || !dirty}>{busy ? t.saving : t.save}</button><button type="button" disabled={busy || dirty} onClick={() => { void toggle(); }}>{selected.enabled ? t.pause : t.resume}</button></div>{!dirty && <small>{t.unchanged}</small>}
        </form>
        {service === 'rss' && <section className="resourceDeskFeedOps"><h3>{t.previewTitle}</h3><p>{t.quota}</p><div className="resourceDeskActions"><button type="button" disabled={busy || dirty} onClick={() => { void feedAction('preview'); }}>{busy ? t.saving : t.preview}</button><button type="button" disabled={busy || dirty} onClick={() => { void feedAction('refresh'); }}>{busy ? t.saving : t.refreshFeed}</button></div>{dirty && <p role="status">{t.changeFirst}</p>}
          {preview && <div className="resourceDeskResults" role="status"><h4>{t.previewTitle} · {preview.mode}</h4>{preview.used !== null && <small>{t.used}: {preview.used}</small>}{!preview.items.length ? <p>{t.noItems}</p> : <ul>{preview.items.map((item, index) => <li key={index}><strong>{item.title}</strong><small>{item.hostname}</small></li>)}</ul>}</div>}
          {refreshResult && <div className="resourceDeskResults" role="status"><h4>{t.refreshTitle}: {refreshResult.changed ? t.changed : t.noChange}</h4><p>{t.extracted}: {refreshResult.extracted} · {t.inserted}: {refreshResult.inserted}</p>{refreshResult.used !== null && <small>{t.used}: {refreshResult.used}</small>}</div>}
        </section>}
        <p className="resourceDeskSafety">{service === 'qr' ? t.qrNote : t.rssNote}</p>
      </>}
    </section></div>
  </div>;
}
export default function ServiceResourceDesk({ service }: { service: DeskService }) {
  const { locale, localizedHref, messages } = useI18n();
  const t = WORDS[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [ready, setReady] = useState(!KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [revision, setRevision] = useState(0);
  const accountNode = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!KEY) return;
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(KEY); await instance.load({ ui });
      if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      unsubscribe = instance.addListener(() => { if (mounted) { setSignedIn(Boolean(instance.isSignedIn)); setRevision(old => old + 1); } });
    }).catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !accountNode.current) return;
    const node = accountNode.current; clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn, revision]);
  return <main className="fleetConsole resourceDesk"><nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a><div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={localizedHref(`/${service}/app/`)}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher />{signedIn ? <div ref={accountNode} /> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <header className="shell fleetHero"><span>PICOSVC / {service.toUpperCase()} / RESOURCE MANAGEMENT</span><h1>{service === 'qr' ? t.qrTitle : t.rssTitle}</h1><p>{service === 'qr' ? t.qrIntro : t.rssIntro}</p></header>
    {!API || !KEY ? <p className="shell fleetError" role="alert">{t.config}</p> : !ready ? <p className="shell" role="status">{t.loading}</p> : !signedIn || !clerk ? <section className="shell fleetPanel"><p>{t.login}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <Editor key={revision} service={service} clerk={clerk} />}
  </main>;
}
