'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import {
  operationsFilter, operationsPaths, parseFunctionRevisions, parseMonitorOptions,
  parseOperationsEvents, parseOperationsItems, publicFunctionEndpoint, validateOperationsEdit,
  type FunctionRevision, type MonitorOptions, type OperationsEvent, type OperationsItem, type OperationsService,
} from './service-operations-desk-model';
import './service-fleet-console.css';
import './service-resource-desk.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const WORDS = {
  ja: { functions: 'Functions 個別管理', monitor: 'Monitor 個別管理', functionsIntro: '関数の公開状態・実行履歴・リビジョンを管理します。', monitorIntro: '監視対象の設定・変更履歴と抽出設定を管理します。', dashboard: '全体ダッシュボード', workspace: '作成・詳細設定', usage: '利用量・上限', login: 'ログインして管理する', config: '認証またはWorker APIが未設定です。', loading: '読み込み中…', error: 'データの取得または変更に失敗しました。', refresh: '一覧を更新', search: '名前で検索', all: 'すべて', enabled: '稼働中', paused: '停止中', total: '登録数', inventory: '管理対象', empty: '該当するリソースはありません。', select: '個別に管理', details: '選択したリソース', choose: '左の一覧から選択してください。', name: '名前', interval: '確認間隔（分）', checked: '最終確認', updated: '最終更新', never: '記録なし', save: '設定を保存', saved: '設定を保存しました。', busy: '処理中…', pause: '停止する', resume: '再開する', pauseFunctions: 'この関数を停止しますか？公開URLから呼び出せなくなります。', pauseMonitor: 'この監視を停止しますか？定期確認が行われなくなります。', pausedNotice: '停止しました。', resumedNotice: '再開しました。', endpoint: '関数の公開URL', copy: 'URLをコピー', copied: 'コピーしました', history: '直近の履歴（最大40件）', noHistory: '履歴はありません。', http: 'HTTP', duration: '実行時間', revision: 'リビジョン', versions: 'コードのリビジョン履歴', rollback: 'この版へ戻す', current: '現在', rollbackConfirm: '選択した旧版のコードに戻しますか？公開関数の動作が変わり、新しいリビジョンが作られます。', rolledBack: '以前の版に戻しました。', sourceNote: 'この画面はソースコード・秘密変数・実行エラー本文を表示しません。コード編集とシークレット管理は既存の詳細設定画面で行ってください。', advanced: '本文抽出の詳細設定', contentSelector: '本文のCSSセレクター', ignoreSelector: '除外するCSSセレクター', stripPattern: '除去パターン（安全な正規表現）', enableAdvanced: '詳細監視を有効化', saveAdvanced: '抽出設定を保存', advancedConfirm: '抽出ルールを保存すると比較の基準がリセットされ、初回は変更として通知されません。実行しますか？', advancedSaved: '抽出設定を保存しました。比較の基準はリセットされました。', quota: '手動プレビューは監視確認枠を1回消費します。本文はこの管理画面に表示しません。', preview: '抽出を試す（確認枠を1回消費）', previewConfirm: '監視確認枠を1回消費して抽出を試しますか？', previewSuccess: '抽出に成功しました（内容のSHA-256先頭12文字）', changeFirst: '設定を保存してから操作してください。', eventChange: '変更検知', eventError: '取得失敗', webhook: '通知先HTTP', monitorNote: '取得先URL・Webhook URL・差分の本文・取得エラー全文はこの画面に表示しません。' },
  en: { functions: 'Functions management', monitor: 'Monitor management', functionsIntro: 'Manage function availability, invocation history and revisions.', monitorIntro: 'Manage page monitoring settings, changes and extraction options.', dashboard: 'All-service dashboard', workspace: 'Create / detailed settings', usage: 'Usage & limits', login: 'Sign in to manage', config: 'Authentication or Worker API is not configured.', loading: 'Loading…', error: 'Could not load or update data.', refresh: 'Refresh list', search: 'Search names', all: 'All', enabled: 'Running', paused: 'Paused', total: 'Resources', inventory: 'Resources', empty: 'No matching resources.', select: 'Manage resource', details: 'Selected resource', choose: 'Choose a resource from the list.', name: 'Name', interval: 'Check interval (minutes)', checked: 'Last checked', updated: 'Last updated', never: 'No record', save: 'Save settings', saved: 'Settings saved.', busy: 'Working…', pause: 'Pause', resume: 'Resume', pauseFunctions: 'Pause this function? Its public endpoint will become unavailable.', pauseMonitor: 'Pause monitoring? Scheduled checks will stop.', pausedNotice: 'Paused.', resumedNotice: 'Resumed.', endpoint: 'Public function endpoint', copy: 'Copy URL', copied: 'Copied', history: 'Recent history (up to 40)', noHistory: 'No events yet.', http: 'HTTP', duration: 'Duration', revision: 'Revision', versions: 'Code revisions', rollback: 'Restore revision', current: 'Current', rollbackConfirm: 'Restore this earlier code revision? It changes public behavior and creates a new revision.', rolledBack: 'Earlier revision restored.', sourceNote: 'Source code, secret values and raw runtime errors are not shown here. Use the existing detailed editor to change code or secrets.', advanced: 'Content extraction settings', contentSelector: 'Content CSS selector', ignoreSelector: 'Ignore CSS selector', stripPattern: 'Strip pattern (safe regular expression)', enableAdvanced: 'Enable advanced tracking', saveAdvanced: 'Save extraction settings', advancedConfirm: 'Saving extraction rules resets the comparison baseline. The first check will not notify a change. Continue?', advancedSaved: 'Extraction settings saved. Comparison baseline reset.', quota: 'Manual preview consumes one monitor check. The extracted text is not displayed here.', preview: 'Test extraction (uses 1 check)', previewConfirm: 'Spend one monitor check to test extraction?', previewSuccess: 'Extraction succeeded (first 12 characters of SHA-256)', changeFirst: 'Save settings before running this action.', eventChange: 'Change detected', eventError: 'Fetch failed', webhook: 'Webhook HTTP', monitorNote: 'Target URL, webhook URL, raw diff text and fetch errors are not displayed in this console.' },
  'zh-CN': { functions: 'Functions 单项管理', monitor: 'Monitor 单项管理', functionsIntro: '管理函数的可用性、调用记录和代码版本。', monitorIntro: '管理网页监控设置、变更记录及提取选项。', dashboard: '全部服务总览', workspace: '创建／详细设置', usage: '用量与限额', login: '登录后管理', config: '身份验证或 Worker API 未配置。', loading: '加载中…', error: '无法获取或更新数据。', refresh: '刷新列表', search: '按名称搜索', all: '全部', enabled: '运行中', paused: '已暂停', total: '资源数', inventory: '资源列表', empty: '没有符合条件的资源。', select: '管理资源', details: '所选资源', choose: '从左侧列表中选择资源。', name: '名称', interval: '检查间隔（分钟）', checked: '上次检查', updated: '最近更新', never: '无记录', save: '保存设置', saved: '设置已保存。', busy: '处理中…', pause: '暂停', resume: '恢复', pauseFunctions: '暂停此函数？公开地址将无法访问。', pauseMonitor: '暂停监控？定期检查将停止。', pausedNotice: '已暂停。', resumedNotice: '已恢复。', endpoint: '函数公开地址', copy: '复制地址', copied: '已复制', history: '近期记录（最多40条）', noHistory: '暂无记录。', http: 'HTTP', duration: '耗时', revision: '版本', versions: '代码版本记录', rollback: '恢复此版本', current: '当前', rollbackConfirm: '恢复旧代码版本？这会改变公开函数的行为并创建新版本。', rolledBack: '已恢复旧版本。', sourceNote: '此处不显示源代码、密钥和原始执行错误。请在现有详细编辑器中修改代码与密钥。', advanced: '内容提取设置', contentSelector: '内容 CSS 选择器', ignoreSelector: '忽略 CSS 选择器', stripPattern: '移除模式（安全正则表达式）', enableAdvanced: '启用高级监控', saveAdvanced: '保存提取设置', advancedConfirm: '保存提取规则会重置比较基准；首次检查不会触发变更通知。是否继续？', advancedSaved: '提取设置已保存，比较基准已重置。', quota: '手动预览消耗一次监控检查额度；提取正文不在此显示。', preview: '测试提取（消耗1次）', previewConfirm: '消耗一次监控额度测试提取吗？', previewSuccess: '提取成功（SHA-256 前12位）', changeFirst: '请先保存设置。', eventChange: '检测到变化', eventError: '抓取失败', webhook: 'Webhook HTTP', monitorNote: '此控制台不显示目标地址、Webhook 地址、原始差异与抓取错误。' },
} as const;
function displayDate(value: string | null, locale: string, empty: string) {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US') : empty;
}
function Editor({ service, clerk }: { service: OperationsService; clerk: Clerk }) {
  const { locale } = useI18n(); const t = WORDS[locale];
  const [items, setItems] = useState<OperationsItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'paused'>('all');
  const [events, setEvents] = useState<OperationsEvent[] | null>(null);
  const [revisions, setRevisions] = useState<FunctionRevision[]>([]);
  const [currentRevision, setCurrentRevision] = useState<number | null>(null);
  const [options, setOptions] = useState<MonitorOptions | null>(null);
  const [draftOptions, setDraftOptions] = useState<MonitorOptions | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftInterval, setDraftInterval] = useState('');
  const [previewHash, setPreviewHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const inventorySeq = useRef(0); const detailSeq = useRef(0);
  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const token = await clerk.session?.getToken();
    if (!API || !clerk.isSignedIn || !token) throw new Error('Authentication required');
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.status === 204 ? null : await response.json();
  }, [clerk]);
  const reload = useCallback(async () => {
    const seq = ++inventorySeq.current;
    setLoading(true); setError('');
    try {
      const data = parseOperationsItems(await request(operationsPaths(service).list), service);
      if (inventorySeq.current !== seq) return;
      setItems(data); setSelectedId(old => data.some(row => row.id === old) ? old : data[0]?.id || '');
    } catch { if (inventorySeq.current === seq) { setItems([]); setSelectedId(''); setError(t.error); } }
    finally { if (inventorySeq.current === seq) setLoading(false); }
  }, [request, service, t.error]);
  useEffect(() => { void reload(); return () => { inventorySeq.current++; detailSeq.current++; }; }, [reload]);
  const selected = items.find(item => item.id === selectedId) || null;
  useEffect(() => {
    const seq = ++detailSeq.current;
    setEvents(null); setRevisions([]); setCurrentRevision(null); setOptions(null); setDraftOptions(null); setPreviewHash(''); setCopied(false);
    setDraftName(selected?.name || ''); setDraftInterval(selected?.intervalMinutes === null || selected?.intervalMinutes === undefined ? '' : String(selected.intervalMinutes));
    if (!selected) { setDetailLoading(false); return; }
    const paths = operationsPaths(service, selected.id);
    setDetailLoading(true);
    const details = service === 'functions' ? Promise.all([request(paths.events), request(paths.revisions)]) : Promise.all([request(paths.events), request(paths.options)]);
    void details.then(([rawEvents, secondary]) => {
      const history = parseOperationsEvents(rawEvents, service);
      if (detailSeq.current !== seq) return;
      setEvents(history);
      if (service === 'functions') { const parsed = parseFunctionRevisions(secondary); setRevisions(parsed.revisions); setCurrentRevision(parsed.current); }
      else { const parsed = parseMonitorOptions(secondary); setOptions(parsed); setDraftOptions({ ...parsed }); }
    }).catch(() => { if (detailSeq.current === seq) setError(t.error); })
      .finally(() => { if (detailSeq.current === seq) setDetailLoading(false); });
    return () => { detailSeq.current++; };
  }, [request, service, selected?.id, selected?.updatedAt, t.error]);
  const dirty = Boolean(selected && (draftName !== selected.name || service === 'monitor' && draftInterval !== String(selected.intervalMinutes ?? '')));
  const advancedDirty = Boolean(options && draftOptions && (JSON.stringify(options) !== JSON.stringify(draftOptions) || !options.advanced));
  const visible = operationsFilter(items, query, filter);
  const endpoint = service === 'functions' && selected ? publicFunctionEndpoint(API, selected) : null;
  const mutation = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success); }
    catch { setError(t.error); }
    finally { setBusy(false); }
  };
  const jsonInit = (body: unknown, method: 'PATCH' | 'PUT' | 'POST'): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !dirty || busy) return;
    void mutation(async () => {
      const data = validateOperationsEdit(draftName, service === 'monitor' ? Number(draftInterval) : undefined);
      await request(operationsPaths(service, selected.id).item, jsonInit(data, 'PATCH'));
      await reload();
    }, t.saved);
  }
  function toggle() {
    if (!selected || busy || dirty || (selected.enabled && !window.confirm(service === 'functions' ? t.pauseFunctions : t.pauseMonitor))) return;
    void mutation(async () => {
      await request(operationsPaths(service, selected.id).item, jsonInit({ enabled: !selected.enabled }, 'PATCH'));
      await reload();
    }, selected.enabled ? t.pausedNotice : t.resumedNotice);
  }
  function rollback(revision: number) {
    if (!selected || service !== 'functions' || busy || !window.confirm(t.rollbackConfirm)) return;
    void mutation(async () => {
      await request(operationsPaths(service, selected.id).rollback, jsonInit({ revision }, 'POST'));
      await reload();
      // A rollback does not change the visible inventory in all deployed Worker versions.
      setSelectedId(selected.id);
    }, t.rolledBack);
  }
  function saveOptions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || service !== 'monitor' || !draftOptions || !advancedDirty || busy || dirty || !window.confirm(t.advancedConfirm)) return;
    void mutation(async () => {
      if (draftOptions.contentSelector.length > 200 || draftOptions.ignoreSelector.length > 200 || draftOptions.stripPattern.length > 128) throw new Error('Invalid selector');
      await request(operationsPaths(service, selected.id).options, jsonInit({ contentSelector: draftOptions.contentSelector, ignoreSelector: draftOptions.ignoreSelector, stripPattern: draftOptions.stripPattern, enabled: selected.enabled }, 'PUT'));
      await reload();
    }, t.advancedSaved);
  }
  function preview() {
    if (!selected || service !== 'monitor' || busy || dirty || advancedDirty) { if (dirty || advancedDirty) setError(t.changeFirst); return; }
    if (!window.confirm(t.previewConfirm)) return;
    void mutation(async () => {
      const raw = await request(operationsPaths(service, selected.id).preview, { method: 'POST' });
      const result = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
      if (!result || typeof result.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(result.hash)) throw new Error('Invalid preview');
      setPreviewHash(result.hash.slice(0, 12));
      // Deliberately discard the response text: it may contain source-page secrets.
    }, t.previewSuccess);
  }
  async function copyEndpoint() {
    if (!endpoint) return;
    try { await navigator.clipboard.writeText(endpoint); setCopied(true); } catch { setError(t.error); }
  }
  return <div className="shell resourceDeskBody">
    {error && <p className="fleetError" role="alert">{error}</p>}{notice && <p className="fleetNotice" role="status">{notice}</p>}
    <section className="fleetSummary"><div><small>{t.total}</small><strong>{items.length}</strong></div><div><small>{t.enabled}</small><strong>{items.filter(item => item.enabled).length}</strong></div><div><small>{t.paused}</small><strong>{items.filter(item => !item.enabled).length}</strong></div></section>
    <div className="resourceDeskGrid"><section className="fleetPanel resourceDeskInventory" aria-label={t.inventory}>
      <div className="resourceDeskHeading"><h2>{t.inventory}</h2><button type="button" disabled={loading || busy} onClick={() => { void reload(); }}>{loading ? t.loading : t.refresh}</button></div>
      <input aria-label={t.search} placeholder={t.search} maxLength={100} value={query} onChange={event => setQuery(event.target.value)} />
      <div className="resourceDeskFilters" role="group" aria-label={t.inventory}>{(['all', 'enabled', 'paused'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{t[value]}</button>)}</div>
      {!visible.length ? <p>{loading ? t.loading : t.empty}</p> : <ul className="resourceDeskList">{visible.map(item => <li key={item.id}><button type="button" disabled={busy} className={selectedId === item.id ? 'resourceDeskSelected' : ''} aria-pressed={selectedId === item.id} onClick={() => { setNotice(''); setError(''); setSelectedId(item.id); }}><strong>{item.name}</strong><small>{item.enabled ? t.enabled : t.paused}</small><span>{service === 'monitor' ? `${t.checked}: ${displayDate(item.lastCheckedAt, locale, t.never)}` : `${t.updated}: ${displayDate(item.updatedAt, locale, t.never)}`}</span><em>{t.select} →</em></button></li>)}</ul>}
    </section><section className="fleetPanel resourceDeskDetail" aria-label={t.details}><h2>{t.details}</h2>
      {!selected ? <p>{t.choose}</p> : <><div className="resourceDeskMeta"><strong>{selected.name}</strong><span>{selected.enabled ? t.enabled : t.paused}</span><small>{t.updated}: {displayDate(selected.updatedAt, locale, t.never)}</small></div>
        {endpoint && <div className="resourceDeskPublic"><strong>{t.endpoint}</strong><code>{endpoint}</code><button type="button" onClick={() => { void copyEndpoint(); }}>{copied ? t.copied : t.copy}</button></div>}
        <form className="resourceDeskForm" onSubmit={save}><label>{t.name}<input required maxLength={80} disabled={busy} value={draftName} onChange={event => setDraftName(event.target.value)} /></label>
          {service === 'monitor' && <label>{t.interval}<input type="number" min={5} max={10080} step={1} disabled={busy} value={draftInterval} onChange={event => setDraftInterval(event.target.value)} /></label>}
          <div className="resourceDeskActions"><button type="submit" disabled={busy || !dirty}>{busy ? t.busy : t.save}</button><button type="button" disabled={busy || dirty} onClick={toggle}>{selected.enabled ? t.pause : t.resume}</button></div></form>
        <section className="resourceDeskFeedOps"><h3>{t.history}</h3>{detailLoading ? <p role="status">{t.loading}</p> : !events?.length ? <p>{t.noHistory}</p> : <ul className="operationsDeskHistory">{events.map(event => <li key={event.id}><strong>{service === 'monitor' ? event.kind === 'change' ? t.eventChange : t.eventError : event.kind}</strong><small>{displayDate(event.at, locale, t.never)}</small><small>{event.status !== null ? `${service === 'monitor' ? t.webhook : t.http}: ${event.status}` : '—'}{event.durationMs !== null ? ` · ${t.duration}: ${event.durationMs} ms` : ''}{event.revision !== null ? ` · ${t.revision}: ${event.revision}` : ''}</small></li>)}</ul>}</section>
        {service === 'functions' && <section className="resourceDeskFeedOps"><h3>{t.versions}</h3>{detailLoading ? <p>{t.loading}</p> : !revisions.length ? <p>{t.noHistory}</p> : <ul className="operationsDeskHistory">{revisions.map(revision => <li key={revision.revision}><strong>{t.revision} {revision.revision}</strong><small>{displayDate(revision.at, locale, t.never)}</small>{revision.revision === currentRevision ? <small>{t.current}</small> : <button type="button" disabled={busy} onClick={() => rollback(revision.revision)}>{t.rollback}</button>}</li>)}</ul>}<p className="resourceDeskSafety">{t.sourceNote}</p></section>}
        {service === 'monitor' && <section className="resourceDeskFeedOps"><h3>{t.advanced}</h3>{detailLoading || !draftOptions ? <p>{t.loading}</p> : <form className="resourceDeskForm" onSubmit={saveOptions}><fieldset><legend>{t.advanced}</legend><label>{t.contentSelector}<input maxLength={200} value={draftOptions.contentSelector} onChange={event => setDraftOptions(old => old ? { ...old, contentSelector: event.target.value } : old)} /></label><label>{t.ignoreSelector}<input maxLength={200} value={draftOptions.ignoreSelector} onChange={event => setDraftOptions(old => old ? { ...old, ignoreSelector: event.target.value } : old)} /></label><label>{t.stripPattern}<input maxLength={128} value={draftOptions.stripPattern} onChange={event => setDraftOptions(old => old ? { ...old, stripPattern: event.target.value } : old)} /></label></fieldset><div className="resourceDeskActions"><button type="submit" disabled={busy || dirty || !advancedDirty}>{busy ? t.busy : draftOptions.advanced ? t.saveAdvanced : t.enableAdvanced}</button></div></form>}
          <p className="resourceDeskSafety">{t.quota}</p><div className="resourceDeskActions"><button type="button" disabled={busy || dirty || advancedDirty || detailLoading} onClick={preview}>{t.preview}</button></div>{previewHash && <p role="status">{t.previewSuccess}: <code>{previewHash}</code></p>}<p className="resourceDeskSafety">{t.monitorNote}</p></section>}
      </>}
    </section></div>
  </div>;
}
export default function ServiceOperationsDesk({ service }: { service: OperationsService }) {
  const { localizedHref, messages, locale } = useI18n(); const t = WORDS[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null); const [ready, setReady] = useState(!KEY); const [signedIn, setSignedIn] = useState(false); const [revision, setRevision] = useState(0);
  const accountNode = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!KEY) return;
    let mounted = true; let stop: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(KEY); await instance.load({ ui });
      if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      stop = instance.addListener(() => { if (mounted) { setSignedIn(Boolean(instance.isSignedIn)); setRevision(value => value + 1); } });
    }).catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; stop?.(); };
  }, []);
  useEffect(() => { if (!clerk || !signedIn || !accountNode.current) return; const node = accountNode.current; clerk.mountUserButton(node); return () => clerk.unmountUserButton(node); }, [clerk, signedIn, revision]);
  return <main className="fleetConsole resourceDesk operationsDesk"><nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a><div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={localizedHref(`/${service}/app/`)}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher />{signedIn ? <div ref={accountNode} /> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <header className="shell fleetHero"><span>PICOSVC / {service.toUpperCase()} / RESOURCE MANAGEMENT</span><h1>{t[service]}</h1><p>{service === 'functions' ? t.functionsIntro : t.monitorIntro}</p></header>
    {!API || !KEY ? <p className="shell fleetError" role="alert">{t.config}</p> : !ready ? <p className="shell" role="status">{t.loading}</p> : !signedIn || !clerk ? <section className="shell fleetPanel"><p>{t.login}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <Editor key={revision} service={service} clerk={clerk} />}
  </main>;
}
