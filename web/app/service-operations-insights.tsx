'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';
import { HISTORY_DEFINITIONS, readHistoryRows, type HistoryService } from './service-history-csv';
import { summarizeRecentHistory, type OperationsSummary } from './service-operations-insights-data';
import './service-operations-insights.css';

type Props = {
  service: HistoryService;
  resource: Record<string, unknown>;
  api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
};

const WORDS = {
  ja: { title: '直近の運用状況', sample: '直近の記録', sampleUnit: '件', refresh: '集計を更新', loading: '履歴を取得中…', empty: '集計できる記録はまだありません。', error: '履歴の集計に失敗しました。', note: '取得できた直近の記録だけを集計しています。全期間の実績・稼働率ではありません。', latest: '最新の記録', average: '平均処理時間', measured: '計測対象', ms: 'ms', day: '直近7日間の記録数（UTC）', notifications: '通知失敗／試行が確認できた通知', other: 'その他・判定不能', waiting: '処理中・再試行中', cron: { positive: '成功した実行', negative: '失敗した実行' }, mail: { positive: '配信済み', negative: '配信失敗・利用枠超過' }, functions: { positive: 'HTTP 2xx・3xx', negative: 'HTTP 4xx・5xx／実行エラー' }, monitor: { positive: '変更検知', negative: '取得エラー' } },
  en: { title: 'Recent operational insights', sample: 'Recent records', sampleUnit: 'records', refresh: 'Refresh summary', loading: 'Loading history…', empty: 'No records to summarize yet.', error: 'Could not summarize the history.', note: 'Based only on the available recent records. Not an all-time result or uptime measurement.', latest: 'Latest record', average: 'Mean duration', measured: 'Measurements', ms: 'ms', day: 'Recorded events in the last 7 days (UTC)', notifications: 'Notification failures / observable attempts', other: 'Other / unknown', waiting: 'Pending / retrying', cron: { positive: 'Successful runs', negative: 'Failed runs' }, mail: { positive: 'Delivered', negative: 'Failed / quota reached' }, functions: { positive: 'HTTP 2xx / 3xx', negative: 'HTTP 4xx / 5xx or errors' }, monitor: { positive: 'Changes detected', negative: 'Fetch errors' } },
  'zh-CN': { title: '近期运行概览', sample: '近期记录', sampleUnit: '条', refresh: '刷新汇总', loading: '正在获取历史…', empty: '暂无可汇总的记录。', error: '无法汇总历史记录。', note: '仅统计已获取的近期记录，不代表全历史结果或可用率。', latest: '最近记录', average: '平均耗时', measured: '测量数量', ms: '毫秒', day: '最近7天的记录数（UTC）', notifications: '通知失败／可观察到的尝试', other: '其他／未知', waiting: '待处理／重试中', cron: { positive: '成功执行', negative: '执行失败' }, mail: { positive: '已投递', negative: '失败／额度用尽' }, functions: { positive: 'HTTP 2xx／3xx', negative: 'HTTP 4xx／5xx 或错误' }, monitor: { positive: '检测到变化', negative: '获取错误' } },
} as const;

export default function ServiceOperationsInsights({ service, resource, api }: Props) {
  const { locale } = useI18n();
  const t = WORDS[locale];
  const id = typeof resource.id === 'string' ? resource.id : '';
  const path = id ? HISTORY_DEFINITIONS[service].path(id) : '';
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const current = ++sequence.current;
    setBusy(true); setError(''); setSummary(null);
    try {
      const result = await api(path);
      const rows = readHistoryRows(service, result.payload);
      if (sequence.current === current) setSummary(summarizeRecentHistory(service, rows));
    } catch (reason) {
      if (sequence.current === current) setError(reason instanceof Error ? reason.message : t.error);
    } finally {
      if (sequence.current === current) setBusy(false);
    }
  }, [api, path, service, t.error]);
  useEffect(() => {
    void load();
    return () => { sequence.current += 1; };
  }, [load]);
  const labels = t[service];
  const maximum = Math.max(1, ...(summary?.daily.map(entry => entry.count) || []));
  const latest = summary?.latestAt ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.latestAt)) : '—';
  const cells = summary ? [
    { label: labels.positive, value: summary.positive },
    { label: labels.negative, value: summary.negative },
    ...(summary.waiting ? [{ label: t.waiting, value: summary.waiting }] : []),
    ...(summary.other ? [{ label: t.other, value: summary.other }] : []),
  ] : [];

  return <section className="serviceOperationsInsights" aria-label={t.title} aria-busy={busy}>
    <header className="serviceOperationsInsightsHead"><div><span className="serviceOperationsInsightsEyebrow">PICOSVC / {service.toUpperCase()} / INSIGHTS</span><h3>{t.title}</h3><p>{t.note} {t.sample}: {HISTORY_DEFINITIONS[service].limit} {t.sampleUnit} max.</p></div><button type="button" className="secondary" disabled={!id || busy} onClick={() => { void load(); }}>{busy ? t.loading : t.refresh}</button></header>
    {error && <p className="serviceOperationsInsightsError" role="alert">{error}</p>}
    {busy && <p role="status">{t.loading}</p>}
    {!busy && !error && summary?.total === 0 && <p role="status">{t.empty}</p>}
    {!busy && summary && summary.total > 0 && <>
      <div className="serviceOperationsInsightsMeta"><span>{t.sample}: <strong>{summary.total} / {HISTORY_DEFINITIONS[service].limit}</strong></span><span>{t.latest}: <time dateTime={summary.latestAt || undefined}>{latest}</time></span>{summary.meanDurationMs !== null && <span>{t.average}: <strong>{summary.meanDurationMs} {t.ms}</strong> ({t.measured}: {summary.measuredDurations})</span>}</div>
      <div className="serviceOperationsInsightsStats">{cells.map(cell => <div className="serviceOperationsInsightsStat" key={cell.label}><span>{cell.label}</span><strong>{cell.value}</strong></div>)}</div>
      {service === 'monitor' && <p className="serviceOperationsInsightsNotify">{t.notifications}: <strong>{summary.notificationFailures} / {summary.notificationAttempts}</strong></p>}
      <div className="serviceOperationsInsightsTrend"><h4>{t.day}</h4><ol>{summary.daily.map(entry => <li key={entry.day} aria-label={`${entry.day}: ${entry.count} ${t.sampleUnit}`}><span className="serviceOperationsInsightsBarTrack" aria-hidden="true"><span className="serviceOperationsInsightsBar" style={{ height: `${Math.round(100 * entry.count / maximum)}%` }} /></span><time dateTime={entry.day}>{entry.day.slice(5)}</time><small>{entry.count}</small></li>)}</ol></div>
    </>}
  </section>;
}
