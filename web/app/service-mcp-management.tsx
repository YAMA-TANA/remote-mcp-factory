'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';
import LegacyServiceAdvancedDetail from './service-advanced-detail-legacy';
import './service-mcp-management.css';

type RecordValue = Record<string, unknown>;
type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
type Props = {
  resource: RecordValue;
  api: Api;
  onClose: () => void;
  onChanged: () => void;
  copyValue: (value: string) => Promise<void>;
};
type Event = { kind?: unknown; status?: unknown; http_status?: unknown; duration_ms?: unknown; message?: unknown; created_at?: unknown };
const object = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorMessage = (value: unknown): string => value instanceof Error ? value.message : String(value);
const numeric = (value: unknown): number => { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0; };
function safeEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
function time(value: unknown, locale: string): string {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
const COPY = {
  ja: { title: 'MCPデプロイ管理', subtitle: '稼働状態・リクエスト・ビルド履歴を確認', status: 'デプロイ状態', runtime: '実行方式', updated: '最終更新', endpoint: '接続先', copy: 'URLをコピー', copied: 'コピーしました', refresh: '最新情報を取得', loading: '読み込み中…', redeploy: '再デプロイ', deploying: 'デプロイ中…', confirm: '再デプロイにはビルド利用枠が必要で、稼働中のMCPを一時停止します。実行しますか？', ready: '稼働中', unavailable: '情報なし', error: 'ビルドエラー', metrics: '直近30日間の利用統計', requests: 'リクエスト', errors: 'エラー', errorRate: 'エラー率', latency: '平均応答時間', logs: '直近の実行・ビルド履歴', noLogs: '履歴はまだありません。', http: 'HTTP', duration: '所要時間', edge: 'Edgeビルド', tools: 'ツール数', size: 'ビルドサイズ', compiler: 'コンパイラ', settings: 'アクセス設定とシークレット', close: '閉じる', success: '再デプロイが完了しました。', failed: '再デプロイが完了しませんでした。ビルドログをご確認ください。' },
  en: { title: 'MCP deployment management', subtitle: 'Deployment status, requests and build history', status: 'Deployment status', runtime: 'Runtime', updated: 'Last updated', endpoint: 'Connection URL', copy: 'Copy URL', copied: 'Copied', refresh: 'Refresh status', loading: 'Loading…', redeploy: 'Redeploy', deploying: 'Deploying…', confirm: 'Redeploy consumes a build quota and temporarily stops the running MCP. Continue?', ready: 'Running', unavailable: 'Unavailable', error: 'Build error', metrics: 'Usage in the last 30 days', requests: 'Requests', errors: 'Errors', errorRate: 'Error rate', latency: 'Average response time', logs: 'Recent runtime and build events', noLogs: 'No events yet.', http: 'HTTP', duration: 'Duration', edge: 'Edge build', tools: 'Tools', size: 'Build size', compiler: 'Compiler', settings: 'Access settings and secrets', close: 'Close', success: 'Redeployment completed.', failed: 'Redeployment did not finish. Check the build events.' },
  'zh-CN': { title: 'MCP 部署管理', subtitle: '查看部署状态、请求与构建历史', status: '部署状态', runtime: '运行方式', updated: '最后更新', endpoint: '连接地址', copy: '复制地址', copied: '已复制', refresh: '刷新状态', loading: '加载中…', redeploy: '重新部署', deploying: '部署中…', confirm: '重新部署会消耗构建配额并暂时停止运行中的 MCP，是否继续？', ready: '运行中', unavailable: '暂无信息', error: '构建错误', metrics: '最近30天用量', requests: '请求数', errors: '错误数', errorRate: '错误率', latency: '平均响应时间', logs: '近期运行及构建记录', noLogs: '暂无记录。', http: 'HTTP', duration: '耗时', edge: 'Edge 构建', tools: '工具数', size: '构建大小', compiler: '编译器', settings: '访问设置与密钥', close: '关闭', success: '重新部署已完成。', failed: '重新部署未完成，请检查构建记录。' },
} as const;

export default function McpManagementDetail(props: Props) {
  const { resource, api, onChanged, onClose, copyValue } = props;
  const { locale } = useI18n();
  const t = COPY[locale];
  const id = text(resource.id);
  const base = `/api/picosvc/mcp/servers/${encodeURIComponent(id)}`;
  const [overview, setOverview] = useState<RecordValue | null>(null);
  const [metrics, setMetrics] = useState<RecordValue | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const [status, logs, usage] = await Promise.all([
        api(base), api(`${base}/logs?limit=50`), api(`${base}/metrics?days=30`),
      ]);
      const snapshot = object(status.payload);
      const logData = object(logs.payload);
      const metricData = object(usage.payload);
      if (!snapshot || !object(snapshot.server) || !logData || !Array.isArray(logData.events) || !metricData || !object(metricData.summary)) {
        throw new Error('Invalid MCP management API response.');
      }
      if (sequence.current !== current) return;
      setOverview(snapshot);
      setMetrics(metricData);
      setEvents(logData.events.filter((event: unknown): event is Event => object(event) !== null));
    } catch (reason) {
      if (sequence.current === current) setError(errorMessage(reason));
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, [api, base]);
  useEffect(() => { void reload(); return () => { sequence.current += 1; }; }, [reload]);
  const server = object(overview?.server);
  const edge = object(overview?.edge);
  const summary = object(metrics?.summary);
  const status = text(server?.status ?? resource.status);
  const endpoint = safeEndpoint(resource.mcpUrl ?? resource.mcp_url ?? resource.endpoint ?? resource.url);
  const requests = numeric(summary?.requests);
  const failures = numeric(summary?.errors);
  const duration = numeric(summary?.averageDurationMs);
  const errorRate = requests ? Math.min(100, (failures / requests) * 100) : 0;
  async function redeploy() {
    if (loading || deploying || !window.confirm(t.confirm)) return;
    setDeploying(true); setError(''); setNotice('');
    try {
      const result = object((await api(`${base}/redeploy`, { method: 'POST' })).payload);
      if (result?.redeployed !== true) throw new Error(t.failed);
      setNotice(t.success);
      onChanged();
      await reload();
    } catch (reason) {
      // Reloading diagnostics clears the current error; report the deployment failure afterwards.
      await reload();
      setError(errorMessage(reason));
    } finally {
      setDeploying(false);
    }
  }
  async function copyEndpoint() {
    if (!endpoint) return;
    try { await copyValue(endpoint); setCopied(true); } catch (reason) { setError(errorMessage(reason)); }
  }
  return <div className="mcpManagementStack">
    <section className="mcpManagement" aria-label={t.title}>
      <header className="mcpManagementHeading"><div><span className="mcpManagementEyebrow">PICOSVC / MCP</span><h2>{t.title}</h2><p>{t.subtitle}</p></div><button type="button" className="ghost" onClick={onClose}>{t.close} ×</button></header>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="success" role="status">{notice}</p>}
      <div className="mcpManagementActions"><button type="button" className="ghost" disabled={loading || deploying} onClick={() => { void reload(); }}>{loading ? t.loading : t.refresh}</button><button type="button" className="primary" disabled={loading || deploying} onClick={() => { void redeploy(); }}>{deploying ? t.deploying : t.redeploy}</button></div>
      <div className="mcpManagementGrid"><div className="mcpManagementPanel"><span>{t.status}</span><strong className={status === 'ready' ? 'mcpManagementReady' : ''}>{status === 'ready' ? t.ready : status || t.unavailable}</strong><small>{t.runtime}: {text(server?.detectedRuntime ?? resource.detected_runtime) || '—'}</small><small>{t.updated}: {time(server?.updatedAt ?? resource.updated_at, locale)}</small>{server?.error && <p className="mcpManagementError" role="alert">{t.error}: {text(server.error)}</p>}</div>
        <div className="mcpManagementPanel"><span>{t.endpoint}</span>{endpoint ? <><a href={endpoint} target="_blank" rel="noopener noreferrer" className="mcpManagementEndpoint">{endpoint} ↗</a><button className="ghost" type="button" onClick={() => { void copyEndpoint(); }}>{copied ? t.copied : t.copy}</button></> : <strong>{t.unavailable}</strong>}</div>
        <div className="mcpManagementPanel"><span>{t.edge}</span>{edge ? <><strong>{text(edge.status) || '—'}</strong><small>{t.tools}: {text(edge.tool_count) || '—'}</small><small>{t.size}: {edge.size_bytes !== null && edge.size_bytes !== undefined && Number.isFinite(Number(edge.size_bytes)) ? new Intl.NumberFormat(locale).format(Number(edge.size_bytes)) + ' B' : '—'}</small><small>{t.compiler}: {text(edge.compiler_version) || '—'}</small></> : <strong>{t.unavailable}</strong>}</div></div>
      <section className="mcpManagementPanel mcpManagementMetrics"><h3>{t.metrics}</h3><div className="mcpManagementMetricGrid"><div><span>{t.requests}</span><strong>{new Intl.NumberFormat(locale).format(requests)}</strong></div><div><span>{t.errors}</span><strong>{new Intl.NumberFormat(locale).format(failures)}</strong></div><div><span>{t.errorRate}</span><strong>{errorRate.toFixed(1)}%</strong></div><div><span>{t.latency}</span><strong>{duration.toFixed(0)} ms</strong></div></div></section>
      <section className="mcpManagementPanel"><h3>{t.logs}</h3>{events.length === 0 ? <p>{loading ? t.loading : t.noLogs}</p> : <div className="mcpManagementEvents">{events.map((entry, index) => <div className="mcpManagementEvent" key={`${text(entry.created_at)}:${index}`}><div><strong>{text(entry.kind) || 'runtime'} · {text(entry.status) || '—'}</strong><time>{time(entry.created_at, locale)}</time></div><small>{entry.http_status !== null && entry.http_status !== undefined ? `${t.http} ${text(entry.http_status)} · ` : ''}{t.duration}: {text(entry.duration_ms ?? 0)} ms</small>{entry.message && <p>{text(entry.message)}</p>}</div>)}</div>}</section>
    </section>
    <section aria-label={t.settings}><LegacyServiceAdvancedDetail {...props} service="mcp" /></section>
  </div>;
}
