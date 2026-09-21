'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { workspaceApiError } from './workspace-helpers';
import { filterMcpFleet, mcpPaths, parseMcpEvents, parseMcpFleet, parseMcpMetrics, type McpFleetEvent, type McpFleetFilter, type McpFleetItem, type McpFleetMetrics } from './mcp-fleet-model';
import './service-fleet-console.css';
import './mcp-fleet-console.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const WORDS = {
  ja: { title: 'MCP デプロイ運用室', intro: 'デプロイ全体の状態を確認し、選択したサーバーの直近30日間の統計・実行履歴を調べられます。', dashboard: '全体ダッシュボード', workspace: 'デプロイ・詳細設定', usage: '利用量・上限', login: 'ログインしてMCPを管理', config: '認証またはWorker APIが未設定です。', error: 'MCPの情報を取得できませんでした。', refresh: '全件更新', loading: '読み込み中…', total: 'デプロイ数', ready: '稼働中', attentionCount: '要確認', pausedCount: '停止中', resources: 'MCP一覧', search: '名前・状態・実行方式で検索', all: 'すべて', running: '稼働中', attention: '要確認', paused: '停止中', empty: '条件に一致するデプロイはありません。', select: '統計を見る', detail: '選択中のデプロイ', status: 'デプロイ状態', runtime: '実行方式', branch: 'ブランチ', updated: '最終更新', unknown: '記録なし', pause: '停止', resume: '再開', confirm: 'このMCPへの接続を停止しますか？利用中のクライアントが接続できなくなる可能性があります。', pausedNotice: 'MCPを停止しました。', resumedNotice: 'MCPを再開しました。', saving: '変更中…', metrics: '直近30日間の統計', requests: 'リクエスト', errors: 'エラー', rate: 'エラー率', latency: '平均応答時間', logs: '実行・ビルド履歴（最大30件）', noLogs: '履歴はありません。', http: 'HTTP', duration: '所要時間', hint: '履歴と統計は選択したMCPについてのみ取得します。シークレット・接続トークン・生のエラーメッセージは表示しません。再デプロイや詳細設定は既存のサービス画面で行えます。' },
  en: { title: 'MCP deployment control room', intro: 'Inspect your deployment fleet, then drill into the selected server’s 30-day statistics and runtime history.', dashboard: 'All-service dashboard', workspace: 'Deploy / detailed settings', usage: 'Usage & limits', login: 'Sign in to manage MCPs', config: 'Authentication or Worker API is not configured.', error: 'Could not load MCP data.', refresh: 'Refresh fleet', loading: 'Loading…', total: 'Deployments', ready: 'Running', attentionCount: 'Needs attention', pausedCount: 'Paused', resources: 'MCP deployments', search: 'Search name, status or runtime', all: 'All', running: 'Running', attention: 'Needs attention', paused: 'Paused', empty: 'No matching deployments.', select: 'View metrics', detail: 'Selected deployment', status: 'Deployment status', runtime: 'Runtime', branch: 'Branch', updated: 'Last updated', unknown: 'No record', pause: 'Pause', resume: 'Resume', confirm: 'Pause this MCP endpoint? Connected clients may lose access.', pausedNotice: 'MCP paused.', resumedNotice: 'MCP resumed.', saving: 'Saving…', metrics: 'Last 30 days', requests: 'Requests', errors: 'Errors', rate: 'Error rate', latency: 'Average latency', logs: 'Runtime / build history (up to 30)', noLogs: 'No events yet.', http: 'HTTP', duration: 'Duration', hint: 'Metrics and logs are loaded only for the selected MCP. Secrets, connection tokens and raw error messages are never shown. Use the existing workspace for redeployment and advanced settings.' },
  'zh-CN': { title: 'MCP 部署管理室', intro: '查看所有部署的状态，深入了解所选服务器最近30天的指标与运行记录。', dashboard: '全部服务总览', workspace: '部署／详细设置', usage: '用量与限额', login: '登录后管理 MCP', config: '身份验证或 Worker API 未配置。', error: '无法获取 MCP 数据。', refresh: '刷新列表', loading: '加载中…', total: '部署数', ready: '运行中', attentionCount: '需关注', pausedCount: '已暂停', resources: 'MCP 部署', search: '搜索名称／状态／运行方式', all: '全部', running: '运行中', attention: '需关注', paused: '已暂停', empty: '没有符合条件的部署。', select: '查看指标', detail: '所选部署', status: '部署状态', runtime: '运行方式', branch: '分支', updated: '最近更新', unknown: '无记录', pause: '暂停', resume: '恢复', confirm: '暂停该 MCP 端点吗？已连接客户端可能无法访问。', pausedNotice: '已暂停 MCP。', resumedNotice: '已恢复 MCP。', saving: '保存中…', metrics: '最近30天', requests: '请求数', errors: '错误数', rate: '错误率', latency: '平均延迟', logs: '运行／构建记录（最多30条）', noLogs: '尚无记录。', http: 'HTTP', duration: '耗时', hint: '仅加载所选 MCP 的统计和日志；不显示密钥、连接令牌或原始错误信息。重新部署及高级设置请使用现有工作台。' },
} as const;

const dateText = (value: string | null, locale: string, empty: string) => {
  if (!value) return empty;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toLocaleString(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US') : empty;
};
const numberText = (value: number, locale: string) => new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US').format(value);

export default function McpFleetConsole() {
  const { locale, localizedHref, messages } = useI18n();
  const t = WORDS[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [ready, setReady] = useState(!KEY);
  const [signedIn, setSignedIn] = useState(false);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<McpFleetItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<McpFleetFilter>('all');
  const [metrics, setMetrics] = useState<McpFleetMetrics | null>(null);
  const [events, setEvents] = useState<McpFleetEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [detailRevision, setDetailRevision] = useState(0);
  const scope = useRef(0);
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
        // Organization changes can retain signed-in state; invalidate previous owner's data immediately.
        scope.current++; setItems([]); setSelectedId(''); setMetrics(null); setEvents(null);
        setError(''); setDetailError(''); setNotice(''); setChanging(false);
        setSignedIn(Boolean(instance.isSignedIn)); setRevision(value => value + 1);
      });
    }).catch(() => { if (mounted) { setError(t.error); setReady(true); } });
    return () => { mounted = false; stop?.(); };
  }, [t.error]);

  useEffect(() => {
    if (!clerk || !signedIn || !accountNode.current) return;
    const node = accountNode.current;
    clerk.mountUserButton(node);
    return () => clerk.unmountUserButton(node);
  }, [clerk, signedIn]);

  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    if (!clerk?.isSignedIn || !API) throw new Error('Authentication required.');
    const token = await clerk.session?.getToken();
    if (!token) throw new Error('Session expired.');
    const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers, redirect: 'error', cache: 'no-store' });
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(workspaceApiError(payload, response.status, response.headers.get('x-request-id')));
    return payload;
  }, [clerk]);

  const refresh = useCallback(async () => {
    if (!signedIn || !clerk) return;
    const version = ++scope.current;
    setLoading(true); setError(''); setNotice('');
    try {
      const rows = parseMcpFleet(await request(mcpPaths().list));
      if (version === scope.current) { setItems(rows); setSelectedId(old => rows.some(item => item.id === old) ? old : rows[0]?.id || ''); }
    } catch (reason) {
      if (version === scope.current) { setItems([]); setSelectedId(''); setError(reason instanceof Error ? reason.message : t.error); }
    } finally { if (version === scope.current) setLoading(false); }
  }, [clerk, request, signedIn, t.error]);

  useEffect(() => {
    if (signedIn && clerk) void refresh();
    else { scope.current++; setItems([]); setSelectedId(''); setMetrics(null); setEvents(null); setLoading(false); setError(''); }
    return () => { scope.current++; };
  }, [clerk, signedIn, revision, refresh]);

  const visible = filterMcpFleet(items, query, filter);
  const selected = visible.find(item => item.id === selectedId) || visible[0] || null;
  const selectedResourceId = selected?.id || '';
  useEffect(() => {
    if (!signedIn || !selectedResourceId) { setMetrics(null); setEvents(null); setDetailLoading(false); return; }
    let active = true;
    setMetrics(null); setEvents(null); setDetailError(''); setDetailLoading(true);
    const endpoints = mcpPaths(selectedResourceId);
    if (!endpoints.metrics || !endpoints.logs) return;
    Promise.all([request(endpoints.metrics), request(endpoints.logs)]).then(([metricsPayload, eventsPayload]) => {
      const parsedMetrics = parseMcpMetrics(metricsPayload);
      const parsedEvents = parseMcpEvents(eventsPayload);
      if (active) { setMetrics(parsedMetrics); setEvents(parsedEvents); }
    }).catch(reason => { if (active) setDetailError(reason instanceof Error ? reason.message : t.error); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [request, selectedResourceId, signedIn, revision, detailRevision, t.error]);

  async function toggle(item: McpFleetItem) {
    if (changing || loading) return;
    if (item.enabled && !window.confirm(t.confirm)) return;
    const version = scope.current;
    setChanging(true); setError(''); setNotice('');
    try {
      const path = mcpPaths(item.id).toggle;
      if (!path) throw new Error('Missing MCP route.');
      await request(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !item.enabled }) });
      if (version !== scope.current) return;
      await refresh();
      setDetailRevision(old => old + 1);
      setNotice(item.enabled ? t.pausedNotice : t.resumedNotice);
    } catch (reason) { if (version === scope.current) setError(reason instanceof Error ? reason.message : t.error); }
    finally { setChanging(false); }
  }

  const running = items.filter(item => item.enabled && item.status === 'ready').length;
  const paused = items.filter(item => !item.enabled).length;
  const workspace = localizedHref('/mcp/app/');
  return <main className="fleetConsole mcpFleetConsole">
    <nav className="customerNav shell" aria-label="PicoSvc"><a className="customerBrand" href={localizedHref('/dashboard/')}><img src="/icons/picosvc.svg" width="34" height="34" alt=""/>PicoSvc</a><div className="customerNavLinks"><a href={localizedHref('/dashboard/')}>{t.dashboard}</a><a href={workspace}>{t.workspace}</a><a href={localizedHref('/usage/')}>{t.usage}</a><LanguageSwitcher />{signedIn ? <div ref={accountNode} /> : <button type="button" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button>}</div></nav>
    <div className="shell fleetBody"><header className="fleetHero"><span>PICOSVC / MCP / OPERATIONS</span><h1>{t.title}</h1><p>{t.intro}</p></header>
      {!API || !KEY ? <p className="fleetError" role="alert">{t.config}</p> : !ready ? <p role="status">{t.loading}</p> : !signedIn ? <section className="fleetPanel"><p>{t.login}</p><button type="button" onClick={() => clerk?.openSignIn()}>{messages.common.signIn}</button></section> : <>
        {error && <p className="fleetError" role="alert">{error}</p>}{notice && <p className="fleetNotice" role="status">{notice}</p>}
        <section className="fleetSummary" aria-label={t.resources}><div><small>{t.total}</small><strong>{items.length}</strong></div><div><small>{t.ready}</small><strong>{running}</strong></div><div><small>{t.attentionCount}</small><strong>{items.length - running - paused}</strong></div></section>
        <div className="fleetLayout"><section className="fleetPanel fleetInventory" aria-label={t.resources}><div className="fleetSectionHead"><h2>{t.resources}</h2><button type="button" onClick={() => void refresh()} disabled={loading || changing}>{loading ? t.loading : t.refresh}</button></div>
          <label className="fleetSearch">{t.search}<input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)}/></label><div className="fleetFilters" role="group" aria-label={t.resources}>{(['all','running','attention','paused'] as const).map(value => <button type="button" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{t[value]}</button>)}</div>
          {loading && <p role="status">{t.loading}</p>}{!loading && !visible.length && <p>{t.empty}</p>}
          <ul className="fleetList">{visible.map(item => <li key={item.id}><button className="fleetItem" type="button" aria-pressed={selectedResourceId === item.id} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span className={item.enabled && item.status === 'ready' ? 'fleetActive' : 'fleetPaused'}>{item.enabled ? item.status : t.paused}</span><small>{item.runtime} · {item.branch}</small><span className="fleetSelect">{t.select} →</span></button></li>)}</ul>
        </section><section className="fleetPanel fleetDetail" aria-label={t.detail}><div className="fleetSectionHead"><h2>{t.detail}</h2><a href={workspace}>{t.workspace} →</a></div>
          {!selected ? <p>{t.empty}</p> : <><h3>{selected.name}</h3><div className="mcpFleetFacts"><p>{t.status}: <strong>{selected.status}</strong></p><p>{t.runtime}: <strong>{selected.runtime}</strong></p><p>{t.branch}: <strong>{selected.branch}</strong></p><p>{t.updated}: <strong>{dateText(selected.updatedAt, locale, t.unknown)}</strong></p></div>
            <div className="fleetActions"><button type="button" disabled={changing || loading} onClick={() => void toggle(selected)}>{changing ? t.saving : selected.enabled ? t.pause : t.resume}</button></div>
            <h3>{t.metrics}</h3>{detailLoading && <p role="status">{t.loading}</p>}{detailError && <p role="alert" className="fleetError">{detailError}</p>}{metrics && <div className="mcpFleetMetrics"><div><small>{t.requests}</small><strong>{numberText(metrics.requests, locale)}</strong></div><div><small>{t.errors}</small><strong>{numberText(metrics.errors, locale)}</strong></div><div><small>{t.rate}</small><strong>{(metrics.errorRate * 100).toFixed(1)}%</strong></div><div><small>{t.latency}</small><strong>{metrics.averageDurationMs.toFixed(0)} ms</strong></div></div>}
            <div className="fleetHistory"><h3>{t.logs}</h3>{events && !events.length && <p>{t.noLogs}</p>}{events && events.length > 0 && <ol>{events.map((event, index) => <li key={`${event.createdAt || 'none'}:${index}`}><div className="fleetEventHeading"><strong className={event.status === 'ok' || event.status === 'ready' ? 'fleetEvent-ok' : 'fleetEvent-pending'}>{event.kind} · {event.status}</strong><time dateTime={event.createdAt || undefined}>{dateText(event.createdAt, locale, t.unknown)}</time></div><p>{event.httpStatus !== null && `${t.http} ${event.httpStatus} · `}{event.durationMs !== null && `${t.duration}: ${event.durationMs} ms`}</p></li>)}</ol>}</div><p className="fleetHint">{t.hint}</p>
          </>}
        </section></div>
      </>}
    </div>
  </main>;
}
