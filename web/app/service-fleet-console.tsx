'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { workspaceApiError } from './workspace-helpers';
import {
  filterFleet, fleetPaths, readFleetEvents, readFleetItems,
  type FleetEvent, type FleetFilter, type FleetItem, type FleetService,
} from './service-fleet-model';
import './service-fleet-console.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const WORDS = {
  ja: {
    cronTitle: 'Cron ジョブ管理室', mailTitle: 'Mail 配送管理室', cronIntro: 'ジョブを一覧で確認し、実行履歴を調べ、スケジュールを停止・再開できます。', mailIntro: '受信ルートの有効状態と配送履歴を確認し、転送の停止・再開ができます。',
    dashboard: '全体ダッシュボード', workspace: '作成・詳細設定へ', usage: '利用量・上限', refresh: '一覧を更新', loading: '読み込み中…', login: 'ログインして管理画面を開く', config: '認証またはWorker APIが未設定です。', failure: '情報を取得できませんでした。',
    all: '全件', enabled: '有効', paused: '停止中', search: '名前・設定で検索', total: '登録件数', activeCount: '稼働中', pausedCount: '停止中', resources: '管理対象', noResources: '該当するリソースはありません。', select: '履歴を表示', details: '選択中のリソース', noHistory: '履歴はまだありません。', history: '直近の実行・配送履歴（最大30件）', recent: '最後の実行／更新', never: '記録なし',
    pause: '停止する', resume: '再開する', save: '変更中…', confirmCron: 'このジョブの定期実行を停止しますか？', confirmMail: 'このルートの受信を停止しますか？停止中のメールは配送されない場合があります。', pausedNotice: '停止しました。', resumedNotice: '再開しました。', copy: '受信アドレスをコピー', copied: 'コピーしました',
    ok: '成功', failed: '失敗', pending: '処理中／保留', delivered: '配送完了', retry: '再試行待ち', sending: '送信中', quota_reached: '利用上限', policy: '履歴は選択した1件のみ取得します。メール本文・件名・送信者、Cronのヘッダー・本文はこの画面に表示しません。', http: 'HTTP', duration: '所要時間', attempts: '試行回数',
  },
  en: {
    cronTitle: 'Cron job control room', mailTitle: 'Mail delivery control room', cronIntro: 'Inspect jobs and recent runs, pause or resume scheduled delivery.', mailIntro: 'Inspect receiving routes and delivery outcomes, pause or resume forwarding.',
    dashboard: 'All-service dashboard', workspace: 'Create / detailed settings', usage: 'Usage & limits', refresh: 'Refresh list', loading: 'Loading…', login: 'Sign in to manage services', config: 'Authentication or Worker API is not configured.', failure: 'Could not load management data.',
    all: 'All', enabled: 'Enabled', paused: 'Paused', search: 'Search names or settings', total: 'Resources', activeCount: 'Enabled', pausedCount: 'Paused', resources: 'Resources', noResources: 'No matching resources.', select: 'View history', details: 'Selected resource', noHistory: 'No history recorded yet.', history: 'Recent runs / deliveries (up to 30)', recent: 'Last run / update', never: 'No record',
    pause: 'Pause', resume: 'Resume', save: 'Saving…', confirmCron: 'Pause scheduled execution of this job?', confirmMail: 'Pause this receiving route? Incoming mail may not be delivered while paused.', pausedNotice: 'Paused.', resumedNotice: 'Resumed.', copy: 'Copy receiving address', copied: 'Copied',
    ok: 'Succeeded', failed: 'Failed', pending: 'Pending', delivered: 'Delivered', retry: 'Retry scheduled', sending: 'Sending', quota_reached: 'Quota reached', policy: 'History is fetched for the selected resource only. Mail content/senders and Cron headers/bodies are not displayed here.', http: 'HTTP', duration: 'Duration', attempts: 'Attempts',
  },
  'zh-CN': {
    cronTitle: 'Cron 任务管理', mailTitle: 'Mail 投递管理', cronIntro: '查看任务及执行历史，并暂停或恢复调度。', mailIntro: '查看收件路由与投递结果，并暂停或恢复转发。',
    dashboard: '全部服务总览', workspace: '创建／详细设置', usage: '用量与限额', refresh: '刷新列表', loading: '加载中…', login: '登录后管理服务', config: '身份验证或 Worker API 未配置。', failure: '无法加载管理数据。',
    all: '全部', enabled: '已启用', paused: '已暂停', search: '搜索名称或设置', total: '资源数', activeCount: '启用中', pausedCount: '已暂停', resources: '资源列表', noResources: '没有符合条件的资源。', select: '查看记录', details: '已选资源', noHistory: '尚无历史记录。', history: '最近执行／投递记录（最多30条）', recent: '最近执行／更新', never: '无记录',
    pause: '暂停', resume: '恢复', save: '保存中…', confirmCron: '确定暂停此任务的定时执行吗？', confirmMail: '确定暂停此收件路由吗？暂停期间可能无法投递邮件。', pausedNotice: '已暂停。', resumedNotice: '已恢复。', copy: '复制收件地址', copied: '已复制',
    ok: '成功', failed: '失败', pending: '待处理', delivered: '已投递', retry: '等待重试', sending: '发送中', quota_reached: '达到限额', policy: '仅拉取所选资源的历史记录；不显示邮件正文／发件人或 Cron 请求头／正文。', http: 'HTTP', duration: '耗时', attempts: '尝试次数',
  },
} as const;

function dateText(value: string | null, locale: string, blank: string): string {
  if (!value) return blank;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US') : blank;
}

export default function ServiceFleetConsole({ service }: { service: FleetService }) {
  const { locale, localizedHref, messages } = useI18n();
  const t = WORDS[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [ready, setReady] = useState(!KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const [items, setItems] = useState<FleetItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<FleetEvent[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const requestVersion = useRef(0);
  const accountNode = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!KEY) return;
    let mounted = true;
    let stop: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(KEY);
      await instance.load({ ui });
      if (!mounted) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); setReady(true);
      stop = instance.addListener(() => {
        if (!mounted) return;
        setSignedIn(Boolean(instance.isSignedIn));
        setAuthRevision(old => old + 1);
      });
    }).catch(() => { if (mounted) { setReady(true); setError(t.failure); } });
    return () => { mounted = false; stop?.(); };
  }, [t.failure]);

  useEffect(() => {
    if (!clerk || !signedIn || !accountNode.current) return;
    const node = accountNode.current;
    clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn]);

  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    if (!clerk?.isSignedIn || !API) throw new Error('Authentication or API is not configured.');
    const token = await clerk.session?.getToken();
    if (!token) throw new Error('Session expired. Sign in again.');
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, redirect: 'error', cache: 'no-store' });
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return payload;
  }, [clerk]);

  const refresh = useCallback(async () => {
    if (!signedIn || !clerk) return;
    const version = ++requestVersion.current;
    setLoading(true); setError(''); setNotice('');
    try {
      const rows = readFleetItems(await request(fleetPaths(service).list), service);
      if (version === requestVersion.current) {
        setItems(rows);
        setSelectedId(old => rows.some(item => item.id === old) ? old : rows[0]?.id || '');
      }
    } catch (reason) {
      if (version === requestVersion.current) {
        setItems([]); setSelectedId('');
        setError(reason instanceof Error ? reason.message : t.failure);
      }
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [clerk, request, service, signedIn, t.failure]);

  useEffect(() => {
    if (signedIn && clerk) void refresh();
    else {
      requestVersion.current++;
      setItems([]); setSelectedId(''); setHistory(null); setError(''); setHistoryError(''); setNotice(''); setLoading(false);
    }
    return () => { requestVersion.current++; };
  }, [clerk, signedIn, authRevision, refresh]);

  const visible = filterFleet(items, query, filter);
  const selected = visible.find(item => item.id === selectedId) || visible[0] || null;
  const selectedResourceId = selected?.id || '';
  useEffect(() => {
    if (!signedIn || !selectedResourceId) { setHistory(null); setHistoryLoading(false); return; }
    let active = true;
    setHistory(null); setHistoryError(''); setHistoryLoading(true); setCopied(false);
    const path = fleetPaths(service, selectedResourceId).detail;
    if (!path) return;
    request(path).then(payload => {
      const events = readFleetEvents(payload, service);
      if (active) setHistory(events);
    }).catch(reason => { if (active) setHistoryError(reason instanceof Error ? reason.message : t.failure); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [request, service, selectedResourceId, signedIn, historyRevision, t.failure]);

  async function toggle(item: FleetItem) {
    if (changing) return;
    if (item.enabled && !window.confirm(service === 'cron' ? t.confirmCron : t.confirmMail)) return;
    setChanging(true); setError(''); setNotice('');
    try {
      const path = fleetPaths(service, item.id).toggle;
      if (!path) throw new Error('Missing resource route.');
      await request(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !item.enabled }) });
      // Refresh from the server: do not assume that the management PATCH succeeded locally.
      await refresh();
      setHistoryRevision(value => value + 1);
      setNotice(item.enabled ? t.pausedNotice : t.resumedNotice);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.failure); }
    finally { setChanging(false); }
  }
  async function copyAddress(address: string) {
    if (address === '—') return;
    try { await navigator.clipboard.writeText(address); setCopied(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.failure); }
  }

  const active = items.filter(item => item.enabled).length;
  const workspace = localizedHref(`/${service}/app/`);
  return <main className="fleetConsole">
    <nav className="customerNav shell" aria-label="PicoSvc">
      <a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a>
      <div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={workspace}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher />{signedIn ? <div ref={accountNode} /> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div>
    </nav>
    <div className="shell fleetBody"><header className="fleetHero"><span>PICOSVC / {service.toUpperCase()} / OPERATIONS</span><h1>{service === 'cron' ? t.cronTitle : t.mailTitle}</h1><p>{service === 'cron' ? t.cronIntro : t.mailIntro}</p></header>
      {!API || !KEY ? <p className="fleetError" role="alert">{t.config}</p> : !ready ? <p role="status">{t.loading}</p> : !signedIn ? <section className="fleetPanel"><p>{t.login}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <>
        {error && <p role="alert" className="fleetError">{error}</p>}{notice && <p role="status" className="fleetNotice">{notice}</p>}
        <section className="fleetSummary" aria-label={t.resources}><div><small>{t.total}</small><strong>{items.length}</strong></div><div><small>{t.activeCount}</small><strong>{active}</strong></div><div><small>{t.pausedCount}</small><strong>{items.length - active}</strong></div></section>
        <div className="fleetLayout"><section className="fleetPanel fleetInventory" aria-label={t.resources}><div className="fleetSectionHead"><h2>{t.resources}</h2><button type="button" onClick={() => void refresh()} disabled={loading || changing}>{loading ? t.loading : t.refresh}</button></div>
          <label className="fleetSearch">{t.search}<input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label>
          <div className="fleetFilters" role="group" aria-label={t.resources}>{(['all','enabled','paused'] as const).map(value => <button type="button" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{t[value]}</button>)}</div>
          {loading && <p role="status">{t.loading}</p>}
          {!loading && !visible.length && <p>{t.noResources}</p>}
          <ul className="fleetList">{visible.map(item => <li key={item.id}><button type="button" className="fleetItem" aria-pressed={selectedResourceId === item.id} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span className={item.enabled ? 'fleetActive' : 'fleetPaused'}>{item.enabled ? t.enabled : t.paused}</span><small>{item.description}</small><small>{item.secondary}</small><span className="fleetSelect">{t.select} →</span></button></li>)}</ul>
        </section><section className="fleetPanel fleetDetail" aria-label={t.details}>
          <div className="fleetSectionHead"><h2>{t.details}</h2><a href={workspace}>{t.workspace} →</a></div>
          {!selected ? <p>{t.noResources}</p> : <><h3>{selected.name}</h3><p className="fleetMeta">{selected.description}</p><p className="fleetMeta">{selected.secondary}</p><p className="fleetMeta">{t.recent}: {dateText(selected.lastActivity, locale, t.never)}</p>
            <div className="fleetActions"><button type="button" disabled={changing || loading} onClick={() => void toggle(selected)}>{changing ? t.save : selected.enabled ? t.pause : t.resume}</button>{service === 'mail' && <button type="button" disabled={selected.description === '—'} onClick={() => void copyAddress(selected.description)}>{copied ? t.copied : t.copy}</button>}</div>
            <div className="fleetHistory"><h3>{t.history}</h3>{historyLoading && <p role="status">{t.loading}</p>}{historyError && <p role="alert" className="fleetError">{historyError}</p>}{history && !history.length && <p>{t.noHistory}</p>}{history && history.length > 0 && <ol>{history.map(event => <li key={event.id}><div className="fleetEventHeading"><strong className={`fleetEvent-${event.status}`}>{service === 'mail' ? (t[event.label as 'delivered' | 'failed' | 'retry' | 'pending' | 'sending' | 'quota_reached'] || event.label) : t[event.status]}</strong><time dateTime={event.occurredAt || undefined}>{dateText(event.occurredAt, locale, t.never)}</time></div><p>{event.responseStatus !== null && `${t.http} ${event.responseStatus} · `}{event.attempts !== null && `${t.attempts}: ${event.attempts} · `}{event.durationMs !== null && `${t.duration}: ${event.durationMs}ms`}</p></li>)}</ol>}</div>
            <p className="fleetHint">{t.policy}</p>
          </>}
        </section></div>
      </>}
    </div>
  </main>;
}
