'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';
import { mailSupportSnapshot, mcpSupportSnapshot, supportJson } from './service-safe-diagnostics-data';
import './service-safe-diagnostics.css';

type Props = { service: 'mcp' | 'mail'; resource: Record<string, unknown>; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }> };
type Snapshot = ReturnType<typeof mailSupportSnapshot> | ReturnType<typeof mcpSupportSnapshot>;
const COPY = {
  ja: { title: '安全な診断レポート', intro: '障害調査に使う稼働情報を必要な時だけ取得します。機密情報は含めません。', generate: '診断情報を取得', loading: '取得中…', save: '診断JSONを保存', ready: '診断情報を取得しました。', scope: '取得対象', mcpScope: '30日間の集計と直近最大50件のイベント。全履歴ではありません。', mailScope: '直近最大100件の配信状態の集計。全履歴ではありません。', privacy: 'MCPのURL・所有者情報・エラーメッセージ、メールの本文・件名・送受信者・ID・Webhook URL・署名キーは出力しません。', sample: '対象レコード数', collected: '取得日時', retryable: '再試行の候補', error: '取得に失敗しました' },
  en: { title: 'Privacy-safe diagnostic report', intro: 'Fetch operational data on demand for troubleshooting. No secrets are exported.', generate: 'Generate diagnostics', loading: 'Loading…', save: 'Save diagnostic JSON', ready: 'Diagnostic report is ready.', scope: 'Coverage', mcpScope: '30-day metrics and at most 50 latest events; not complete history.', mailScope: 'Aggregates at most 100 latest delivery events; not complete history.', privacy: 'Excludes MCP URLs, owner information and error messages; mail bodies, subjects, addresses, IDs, webhook URLs and signing secrets.', sample: 'Records sampled', collected: 'Captured', retryable: 'Possible retries', error: 'Could not retrieve diagnostics' },
  'zh-CN': { title: '隐私安全诊断报告', intro: '按需获取运行数据以排查故障，不导出密钥。', generate: '生成诊断报告', loading: '加载中…', save: '保存诊断 JSON', ready: '诊断报告已就绪。', scope: '范围', mcpScope: '最近30天统计与最多50条最新事件，并非完整历史。', mailScope: '最多100条最新投递事件的汇总，并非完整历史。', privacy: '不含 MCP URL、所有者信息和错误详情；不含邮件正文、主题、地址、ID、Webhook URL 与签名密钥。', sample: '样本记录数', collected: '获取时间', retryable: '可能重试', error: '无法获取诊断数据' },
} as const;
const err = (value: unknown) => value instanceof Error ? value.message : String(value);
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** All calls use the existing signed-in management transport. No public metered API calls. */
export default function ServiceSafeDiagnostics({ service, resource, api }: Props) {
  const { locale } = useI18n(); const t = COPY[locale];
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const id = typeof resource.id === 'string' ? resource.id : '';
  useEffect(() => { setSnapshot(null); setError(''); return () => { sequence.current += 1; }; }, [id, service]);

  async function generate() {
    if (loading || !id) return;
    const request = ++sequence.current;
    setLoading(true); setError(''); setSnapshot(null);
    try {
      const capturedAt = new Date().toISOString();
      let next: Snapshot;
      if (service === 'mcp') {
        const base = `/api/picosvc/mcp/servers/${encodeURIComponent(id)}`;
        const [status, logs, metrics] = await Promise.all([api(base), api(`${base}/logs?limit=50`), api(`${base}/metrics?days=30`)]);
        next = mcpSupportSnapshot(status.payload, logs.payload, metrics.payload, capturedAt);
      } else {
        const response = await api(`/api/picosvc/mail/routes/${encodeURIComponent(id)}/events`);
        next = mailSupportSnapshot(response.payload, capturedAt);
      }
      if (sequence.current === request) setSnapshot(next);
    } catch (reason) { if (sequence.current === request) setError(`${t.error}: ${err(reason)}`); }
    finally { if (sequence.current === request) setLoading(false); }
  }
  function download() {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([supportJson(snapshot)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `picosvc-${service}-diagnostics.json`;
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const report = object(snapshot);
  return <section className="safeDiagnostics" aria-label={t.title}>
    <div className="safeDiagnosticsHead"><div><span>PICOSVC / {service.toUpperCase()} / DIAGNOSTICS</span><h3>{t.title}</h3><p>{t.intro}</p></div><button type="button" disabled={loading || !id} onClick={() => { void generate(); }}>{loading ? t.loading : t.generate}</button></div>
    <p className="safeDiagnosticsHint"><strong>{t.scope}:</strong> {service === 'mcp' ? t.mcpScope : t.mailScope}</p>
    <p className="safeDiagnosticsHint">{t.privacy}</p>
    {error && <p className="safeDiagnosticsError" role="alert">{error}</p>}
    {report && <div className="safeDiagnosticsResult" role="status"><strong>{t.ready}</strong><span>{t.sample}: {service === 'mcp' ? String(object(report.scope)?.sampledEvents ?? 0) : String(report.sampledEvents ?? 0)}</span><span>{t.collected}: {String(report.capturedAt ?? '—')}</span>{service === 'mail' && <span>{t.retryable}: {String(report.retryable ?? 0)}</span>}<button type="button" onClick={download}>{t.save}</button></div>}
  </section>;
}
