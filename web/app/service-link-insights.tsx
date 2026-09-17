'use client';

import { useEffect, useState } from 'react';
import { useI18n } from './i18n';
import { qrAnalyticsCsv, readQrAnalytics, rssSettingsSnapshot, type QrAnalytics, type QrRange } from './service-link-insights-data';
import './service-link-insights.css';

type Props = { resource: Record<string, unknown>; api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }> };
type Locale = 'en' | 'ja' | 'zh-CN';
const WORDS: Record<Locale, Record<string, string>> = {
  ja: { title: 'QRスキャン分析', range: '集計期間', refresh: '再取得', busy: '読み込み中…', empty: 'この期間にはスキャン記録がありません。', scans: '期間内のスキャン', from: '集計開始日', daily: '日別スキャン', chartHint: '直近最大45日を表示。CSVには取得した全期間の集計を収録します。', countries: '国・地域', devices: '端末', referrers: '参照元ドメイン', category: '分類', count: 'スキャン', csv: '集計CSVを保存', image: 'QR画像を書き出す', format: '形式', size: '幅', level: '誤り訂正', png: 'PNGを保存', svg: 'SVGを保存', downloadBusy: '画像を取得中…', downloaded: '画像を保存しました。', csvDone: '集計CSVを保存しました。', error: '集計を取得できませんでした。', noData: 'まず集計を取得してください。', analyticsScope: '集計値のみ。訪問者単位の記録ではありません。', rssTitle: 'RSSフィード設定の控え', rssHelp: 'フィード名・有効状態・CSSセレクターをJSONに保存します。自動復元・取り込み機能ではありません。', source: '取得元URLも含める', sourceWarning: 'URLのクエリ文字列に認証情報が含まれる場合があります。共有前に確認してください。', rssDownload: '設定JSONを保存', rssDone: '設定を保存しました。' },
  en: { title: 'QR scan analytics', range: 'Reporting period', refresh: 'Refresh', busy: 'Loading…', empty: 'No scan records in this period.', scans: 'Scans in period', from: 'Since', daily: 'Daily scans', chartHint: 'Showing at most the last 45 days; the CSV includes the full retrieved range.', countries: 'Countries', devices: 'Devices', referrers: 'Referrer domains', category: 'Category', count: 'Scans', csv: 'Download analytics CSV', image: 'Export QR image', format: 'Format', size: 'Width', level: 'Error correction', png: 'Download PNG', svg: 'Download SVG', downloadBusy: 'Fetching image…', downloaded: 'Image download started.', csvDone: 'Analytics CSV download started.', error: 'Could not load analytics.', noData: 'Load analytics first.', analyticsScope: 'Aggregated counts only, not individual visitor records.', rssTitle: 'RSS feed settings snapshot', rssHelp: 'Save the name, enabled state and CSS selectors as JSON. This is not an automatic restore/import feature.', source: 'Include source URL', sourceWarning: 'The URL query may contain credentials. Review before sharing the file.', rssDownload: 'Download settings JSON', rssDone: 'Settings download started.' },
  'zh-CN': { title: '二维码扫码分析', range: '统计时段', refresh: '刷新', busy: '加载中…', empty: '此时段没有扫码记录。', scans: '时段内扫码量', from: '统计起始日期', daily: '每日扫码', chartHint: '最多显示最近45天；CSV包含所取得时段的全部统计。', countries: '国家和地区', devices: '设备', referrers: '来源域名', category: '类别', count: '扫码量', csv: '下载统计CSV', image: '导出二维码图片', format: '格式', size: '宽度', level: '纠错等级', png: '下载PNG', svg: '下载SVG', downloadBusy: '获取图片中…', downloaded: '已开始下载图片。', csvDone: '已开始下载统计CSV。', error: '无法获取统计数据。', noData: '请先加载统计数据。', analyticsScope: '仅汇总数量，不包含单个访客记录。', rssTitle: 'RSS订阅源设置快照', rssHelp: '以JSON保存名称、启用状态及CSS选择器；不提供自动恢复或导入。', source: '包含来源URL', sourceWarning: 'URL查询参数可能包含凭据，分享文件前请检查。', rssDownload: '下载设置JSON', rssDone: '已开始下载设置文件。' },
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1_000); }
}
function filenameId(id: string): string { return id.replace(/[^a-z0-9_-]/gi, '').slice(0, 48) || 'resource'; }
function errorText(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback; }

export function QrInsights({ resource, api }: Props) {
  const { locale } = useI18n(); const t = WORDS[locale];
  const id = typeof resource.id === 'string' ? resource.id : '';
  const [days, setDays] = useState<QrRange>(30);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [data, setData] = useState<QrAnalytics | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [width, setWidth] = useState('512'); const [level, setLevel] = useState('M');

  useEffect(() => {
    if (!id) { setData(null); return; }
    let alive = true;
    setBusy(true); setError(''); setNotice(''); setData(null);
    void api(`/api/picosvc/qr/links/${encodeURIComponent(id)}/analytics?days=${days}`)
      .then(response => { if (alive) setData(readQrAnalytics(response.payload, id, days)); })
      .catch(reason => { if (alive) setError(errorText(reason, t.error)); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
    // api is a render-local authenticated callback; only the resource, period or refresh action initiates a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, days, refreshIndex]);

  function exportCsv() {
    if (!data || busy) { setError(t.noData); return; }
    try {
      downloadBlob(new Blob([qrAnalyticsCsv(data)], { type: 'text/csv;charset=utf-8' }), `qr-${filenameId(id)}-${days}d-analytics.csv`);
      setError(''); setNotice(t.csvDone);
    } catch (reason) { setError(errorText(reason, t.error)); }
  }
  async function exportCode(format: 'png' | 'svg') {
    if (!id || downloadBusy) return;
    setDownloadBusy(true); setError(''); setNotice('');
    try {
      const response = await api(`/api/picosvc/qr/links/${encodeURIComponent(id)}/code?format=${format}&width=${width}&level=${level}`);
      if (!(response.blob instanceof Blob) || response.blob.size === 0) throw new Error('Invalid QR image response.');
      downloadBlob(response.blob, `qr-${filenameId(id)}.${format}`);
      setNotice(t.downloaded);
    } catch (reason) { setError(errorText(reason, t.error)); }
    finally { setDownloadBusy(false); }
  }
  const chart = data?.daily.slice(-45) || [];
  const maximum = Math.max(1, ...chart.map(row => row.scans));
  const dimensions: Array<{ key: 'countries' | 'devices' | 'referrers'; title: string }> = [
    { key: 'countries', title: t.countries }, { key: 'devices', title: t.devices }, { key: 'referrers', title: t.referrers },
  ];
  return <section className="linkInsights" aria-label={t.title}>
    <div className="linkInsightsHeading"><div><span className="linkInsightsEyebrow">PICOSVC / QR / ANALYTICS</span><h3>{t.title}</h3><p>{t.analyticsScope}</p></div><div className="linkInsightsControls"><label>{t.range}<select value={days} onChange={event => setDays(Number(event.target.value) as QrRange)}>{[7, 30, 90, 365].map(value => <option key={value} value={value}>{value} days</option>)}</select></label><button type="button" className="secondary" disabled={busy || !id} onClick={() => setRefreshIndex(value => value + 1)}>{busy ? t.busy : t.refresh}</button></div></div>
    {error && <p className="linkInsightsError" role="alert">{error}</p>}{notice && <p className="linkInsightsNotice" role="status">{notice}</p>}
    {busy && <p role="status">{t.busy}</p>}
    {!busy && data && <><div className="linkInsightsSummary"><div><span>{t.scans}</span><strong>{new Intl.NumberFormat(locale).format(data.total)}</strong></div><div><span>{t.from}</span><strong>{data.since}</strong></div></div>
      <section className="linkInsightsPanel"><h4>{t.daily}</h4>{!chart.length ? <p>{t.empty}</p> : <div className="linkInsightsChart" role="img" aria-label={`${t.daily}: ${chart.map(row => `${row.value} ${row.scans}`).join(', ')}`}>{chart.map(row => <div className="linkInsightsBar" key={row.value} title={`${row.value}: ${row.scans}`} style={{ height: `${Math.max(2, row.scans / maximum * 100)}%` }} />)}</div>}<small>{t.chartHint}</small></section>
      <div className="linkInsightsDimensions">{dimensions.map(group => <section className="linkInsightsPanel" key={group.key}><h4>{group.title}</h4>{data[group.key].length ? <div className="linkInsightsTable"><table><thead><tr><th scope="col">{t.category}</th><th scope="col">{t.count}</th></tr></thead><tbody>{data[group.key].slice(0, 8).map(row => <tr key={row.value}><td>{row.value}</td><td>{new Intl.NumberFormat(locale).format(row.scans)}</td></tr>)}</tbody></table></div> : <p>{t.empty}</p>}</section>)}</div>
      <button type="button" className="secondary" disabled={busy} onClick={exportCsv}>{t.csv}</button>
    </>}
    <section className="linkInsightsPanel linkInsightsImage"><h4>{t.image}</h4><label>{t.size}<select value={width} onChange={event => setWidth(event.target.value)}><option value="256">256 px</option><option value="512">512 px</option><option value="1024">1024 px</option></select></label><label>{t.level}<select value={level} onChange={event => setLevel(event.target.value)}>{['L', 'M', 'Q', 'H'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><div className="linkInsightsControls"><button className="secondary" type="button" disabled={downloadBusy || !id} onClick={() => { void exportCode('png'); }}>{downloadBusy ? t.downloadBusy : t.png}</button><button className="secondary" type="button" disabled={downloadBusy || !id} onClick={() => { void exportCode('svg'); }}>{downloadBusy ? t.downloadBusy : t.svg}</button></div></section>
  </section>;
}

export function RssSettingsExport({ resource }: Pick<Props, 'resource'>) {
  const { locale } = useI18n(); const t = WORDS[locale];
  const [includeSource, setIncludeSource] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const id = typeof resource.id === 'string' ? resource.id : '';
  function exportSettings() {
    setError(''); setNotice('');
    try {
      downloadBlob(new Blob([rssSettingsSnapshot(resource, includeSource)], { type: 'application/json;charset=utf-8' }), `rss-${filenameId(id)}-settings.json`);
      setNotice(t.rssDone);
    } catch (reason) { setError(errorText(reason, t.error)); }
  }
  return <section className="linkInsights" aria-label={t.rssTitle}><div className="linkInsightsHeading"><div><span className="linkInsightsEyebrow">PICOSVC / RSS / SETTINGS</span><h3>{t.rssTitle}</h3><p>{t.rssHelp}</p></div></div><label className="linkInsightsCheckbox"><input type="checkbox" checked={includeSource} onChange={event => setIncludeSource(event.target.checked)} />{t.source}</label>{includeSource && <p className="linkInsightsWarning">{t.sourceWarning}</p>}<button type="button" className="secondary" disabled={!id} onClick={exportSettings}>{t.rssDownload}</button>{error && <p className="linkInsightsError" role="alert">{error}</p>}{notice && <p className="linkInsightsNotice" role="status">{notice}</p>}</section>;
}
