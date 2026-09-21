'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { filterUsage, usageCsv, type UsageFilter, type UsageReport } from './usage-model';
import './usage-console.css';

const COPY = {
  ja: { title: 'サービス別の利用状況', search: 'サービス名・利用項目で検索', all: 'すべて', attention: '70%以上', exhausted: '上限到達', export: '表示中の項目をCSV出力', alerts: '上限が近い項目', clear: '絞り込みを解除', empty: '該当する利用項目はありません。', noAlerts: '70%以上の項目はありません。', open: '専用管理画面へ', policy: 'プランの設定値', used: '使用済み', remaining: '残り', period: '月間使用量は毎月リセットされます。保有数・保存容量は現在値です。', safe: 'CSVには利用量・プラン・項目名だけを含みます。URLや認証情報は含みません。' },
  en: { title: 'Service usage management', search: 'Search services or metrics', all: 'All', attention: '70% or more', exhausted: 'At the limit', export: 'Export visible metrics as CSV', alerts: 'Quotas needing attention', clear: 'Clear filters', empty: 'No matching usage dimensions.', noAlerts: 'No metrics are at or above 70%.', open: 'Open service workspace', policy: 'Plan setting', used: 'used', remaining: 'remaining', period: 'Monthly usage resets each month. Resource counts and storage are current values.', safe: 'CSV contains only usage metadata and tiers, never resource URLs or credentials.' },
  'zh-CN': { title: '服务用量管理', search: '搜索服务或指标', all: '全部', attention: '达到 70%', exhausted: '已达上限', export: '导出当前指标 CSV', alerts: '接近上限的指标', clear: '清除筛选', empty: '没有匹配的用量指标。', noAlerts: '没有达到 70% 的指标。', open: '进入专用管理界面', policy: '套餐设置', used: '已用', remaining: '剩余', period: '月度用量每月重置；资源数和存储量为当前值。', safe: 'CSV 仅包含用量、套餐和指标名称，不含资源 URL 或凭据。' },
} as const;
const TIER = { free: 'Free', tiny: 'Pico', pro: 'PicoPlus' } as const;
const format = (n: number, locale: string) => new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US').format(n);

export default function UsageConsole({ report }: { report: UsageReport }) {
  const { locale, localizedHref } = useI18n();
  const t = COPY[locale];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UsageFilter>('all');
  const visible = useMemo(() => filterUsage(report, query, filter), [report, query, filter]);
  const alerts = useMemo(() => report.products.flatMap(product => product.dimensions.filter(d => d.threshold !== null).map(d => ({ product, dimension: d }))).sort((a, b) => (b.dimension.threshold ?? 0) - (a.dimension.threshold ?? 0)), [report]);
  function exportCsv() {
    const blob = new Blob([usageCsv(report, visible)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `picosvc-usage-${report.month}.csv`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return <div className="usageConsole">
    <section className="usageConsoleAlerts" aria-label={t.alerts}><h2>{t.alerts} <small>{alerts.length}</small></h2>
      {alerts.length === 0 ? <p>{t.noAlerts}</p> : <div className="usageConsoleAlertList">{alerts.map(({ product, dimension }) => <a key={`${product.slug}:${dimension.metric}`} href={localizedHref(`/${product.slug}/app`)} className="usageConsoleAlert"><span><strong>{product.name}</strong> · {dimension.metric}</span><b className={`usageConsoleBadge level${dimension.threshold}`}>{dimension.threshold}%</b><span>{format(dimension.used ?? 0, locale)} / {format(dimension.limit, locale)} →</span></a>)}</div>}
    </section>
    <section className="usageConsoleInventory" aria-label={t.title}><div className="usageConsoleHead"><h2>{t.title}</h2><button type="button" onClick={exportCsv} disabled={!visible.length}>{t.export}</button></div>
      <div className="usageConsoleTools"><label>{t.search}<input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder={t.search} /></label><div role="group" aria-label={t.title}>{(['all','attention','exhausted'] as const).map(mode => <button type="button" key={mode} aria-pressed={filter === mode} onClick={() => setFilter(mode)}>{t[mode]}</button>)}</div></div>
      <p className="usageConsoleHint">{t.period} {t.safe}</p>
      {visible.length === 0 ? <div className="usageConsoleEmpty"><p>{t.empty}</p><button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>{t.clear}</button></div> : <div className="usageConsoleGrid">{visible.map(product => <article className="usageConsoleProduct" key={product.slug}><header><div><strong>{product.name}</strong><span>{TIER[product.tier]}</span></div><a href={localizedHref(`/${product.slug}/app`)}>{t.open} →</a></header><div className="usageConsoleDimensions">{product.dimensions.map(d => <div className="usageConsoleDimension" key={d.metric}><div className="usageConsoleMetric"><strong>{d.metric}</strong>{d.kind === 'policy' ? <span>{t.policy}: {format(d.limit, locale)}</span> : <span>{format(d.used ?? 0, locale)} / {format(d.limit, locale)}</span>}</div>{d.kind !== 'policy' && <><progress value={Math.min(d.used ?? 0, d.limit)} max={Math.max(1, d.limit)} aria-label={`${product.name}: ${d.metric}`} /><p>{d.percent?.toFixed(1)}% {t.used} · {format(d.remaining ?? 0, locale)} {t.remaining}{d.threshold !== null && <b className={`usageConsoleBadge level${d.threshold}`}>{d.threshold}%</b>}</p></>}</div>)}</div></article>)}</div>}
    </section>
  </div>;
}
