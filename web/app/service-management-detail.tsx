'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import './service-management-detail.css';

type Data = Record<string, unknown>;
type Api = (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
export type ManagementProps = { resource: Data; api: Api; onClose: () => void; onChanged: () => void; copyValue: (value: string) => Promise<void> };
type Lang = 'en' | 'ja' | 'zh-CN';
const object = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const str = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const errorText = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason);
const prop = (item: Data, camel: string, snake: string): string => str(item[camel] ?? item[snake]);
function safeUrl(value: string): string | null {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
function localDate(value: unknown, locale: Lang): string {
  const date = new Date(str(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}
const SELECTORS = ['item', 'title', 'link', 'content', 'date'] as const;
type RssDraft = { name: string; sourceUrl: string; enabled: boolean; selectors: Record<string, string> };
function rssDraft(item: Data): RssDraft {
  const embedded = object(item.selectors) || {};
  return { name: str(item.name), sourceUrl: prop(item, 'sourceUrl', 'source_url'), enabled: item.enabled !== false && item.enabled !== 0,
    selectors: Object.fromEntries(SELECTORS.map(part => { const key = `${part}Selector`; return [key, str(item[key] ?? embedded[key] ?? item[`${part}_selector`])]; })) };
}
const RSS = {
  ja: { title: '記事の抽出と公開', source: '取得元ページ', feed: '公開フィード', open: 'フィードを開く', copy: 'URLをコピー', copied: 'コピーしました', preview: '抽出プレビュー', previewHelp: '現在の設定で抽出した記事を確認します。プレビューは利用枠を消費します。', refresh: '今すぐ更新', refreshHelp: '記事を取り込んで公開フィードを更新します。利用枠を消費します。', settings: 'フィード設定', name: 'フィード名', sourceLabel: '取得元URL', enabled: 'フィードを有効にする', advanced: 'CSSセレクターを調整する', advancedHelp: '自動抽出で記事が見つからない場合に指定。空欄は自動抽出です。', save: '設定を保存', saved: '設定を保存しました。', results: '抽出された記事', empty: '記事を抽出できませんでした。セレクターをご確認ください。', changed: '元ページに変更あり', unchanged: '元ページに変更なし', extracted: '抽出記事数', inserted: '新しく取り込んだ記事', mode: '抽出モード', quota: '今月のチェック使用数', loading: '通信中…', delete: 'フィードを削除', confirm: 'フィードと取り込んだ記事を完全に削除しますか？', close: '閉じる', article: '記事', item: '記事全体', titleField: 'タイトル', linkField: 'リンク', contentField: '本文', dateField: '日時', urlError: 'HTTP(S)の有効な取得元URLを指定してください。' },
  en: { title: 'Extract and publish articles', source: 'Source page', feed: 'Published feed', open: 'Open feed', copy: 'Copy URL', copied: 'Copied', preview: 'Preview extraction', previewHelp: 'Inspect the extracted articles. Previews consume a check quota.', refresh: 'Refresh now', refreshHelp: 'Import articles and update the public feed. Refreshes consume a check quota.', settings: 'Feed settings', name: 'Feed name', sourceLabel: 'Source URL', enabled: 'Feed enabled', advanced: 'Adjust CSS selectors', advancedHelp: 'Use only if automatic extraction misses articles. Blank fields use auto-detection.', save: 'Save settings', saved: 'Settings saved.', results: 'Extracted articles', empty: 'No articles were extracted. Check your selectors.', changed: 'Source page changed', unchanged: 'No source page changes', extracted: 'Articles extracted', inserted: 'New articles imported', mode: 'Extraction mode', quota: 'Monthly checks used', loading: 'Working…', delete: 'Delete feed', confirm: 'Permanently delete this feed and its imported articles?', close: 'Close', article: 'Article', item: 'Article container', titleField: 'Title', linkField: 'Link', contentField: 'Content', dateField: 'Date', urlError: 'Enter a valid HTTP(S) source URL.' },
  'zh-CN': { title: '提取并发布文章', source: '来源网页', feed: '已发布订阅源', open: '打开订阅源', copy: '复制链接', copied: '已复制', preview: '预览提取结果', previewHelp: '检查提取的文章。预览会消耗检查配额。', refresh: '立即刷新', refreshHelp: '导入文章并更新订阅源，消耗检查配额。', settings: '订阅源设置', name: '名称', sourceLabel: '来源 URL', enabled: '启用订阅源', advanced: '调整 CSS 选择器', advancedHelp: '仅在自动提取不准确时使用；留空表示自动检测。', save: '保存设置', saved: '设置已保存。', results: '已提取文章', empty: '未提取到文章，请检查选择器。', changed: '网页有变化', unchanged: '网页无变化', extracted: '提取文章数', inserted: '新增文章', mode: '提取模式', quota: '本月检查次数', loading: '处理中…', delete: '删除订阅源', confirm: '永久删除订阅源及其文章？', close: '关闭', article: '文章', item: '文章容器', titleField: '标题', linkField: '链接', contentField: '正文', dateField: '日期', urlError: '请输入有效的 HTTP(S) 来源 URL。' },
} as const;

export function RssManagementDetail({ resource, api, onClose, onChanged, copyValue }: ManagementProps) {
  const { locale } = useI18n(); const t = RSS[locale];
  const base = `/api/picosvc/rss/feeds/${encodeURIComponent(str(resource.id))}`;
  const [draft, setDraft] = useState<RssDraft>(() => rssDraft(resource));
  const [preview, setPreview] = useState<Data | null>(null);
  const [refreshResult, setRefreshResult] = useState<Data | null>(null);
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [copied, setCopied] = useState(false);
  const feedUrl = safeUrl(prop(resource, 'feedUrl', 'feed_url'));
  async function run(kind: string, action: () => Promise<void>) {
    if (busy) return; setBusy(kind); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); await run('save', async () => {
      if (!safeUrl(draft.sourceUrl)) throw new Error(t.urlError);
      if (SELECTORS.some(part => draft.selectors[`${part}Selector`].length > 300)) throw new Error('CSS selectors must be at most 300 characters.');
      await api(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: draft.name, sourceUrl: draft.sourceUrl, enabled: draft.enabled, ...draft.selectors }) });
      setPreview(null); setRefreshResult(null); setNotice(t.saved); onChanged();
    });
  }
  async function extract() {
    await run('preview', async () => {
      setPreview(null);
      const result = object((await api(`${base}/preview`, { method: 'POST' })).payload);
      if (!result || !Array.isArray(result.items)) throw new Error('Invalid RSS preview response.');
      setPreview(result);
    });
  }
  async function refreshFeed() {
    await run('refresh', async () => {
      const result = object((await api(`${base}/refresh`, { method: 'POST' })).payload);
      if (!result) throw new Error('Invalid RSS refresh response.');
      setRefreshResult(result); onChanged();
    });
  }
  async function remove() {
    if (!window.confirm(t.confirm)) return;
    await run('delete', async () => { await api(base, { method: 'DELETE' }); onChanged(); onClose(); });
  }
  const items: Data[] = Array.isArray(preview?.items) ? preview.items.filter((entry): entry is Data => object(entry) !== null) : [];
  return <section className="workflowDetail workflowRss" aria-label="RSS feed management">
    <div className="workflowHeading"><div><span className="workflowEyebrow">PICOSVC / RSS</span><h2>{t.title}</h2><p>{draft.name}</p></div><button type="button" className="workflowGhost" onClick={onClose}>{t.close} ×</button></div>
    {error && <p className="workflowError" role="alert">{error}</p>}{notice && <p className="workflowSuccess" role="status">{notice}</p>}
    <div className="workflowSource"><div><span>{t.source}</span><strong>{draft.sourceUrl}</strong></div><div><span>{t.feed}</span>{feedUrl ? <><a href={feedUrl} target="_blank" rel="noopener noreferrer">{t.open} ↗</a><button type="button" className="workflowGhost" onClick={() => { void copyValue(feedUrl).then(() => setCopied(true)); }}>{copied ? t.copied : t.copy}</button></> : <strong>—</strong>}</div></div>
    <div className="workflowRssColumns"><section className="workflowPanel"><h3>{t.preview}</h3><p>{t.previewHelp}</p><button type="button" className="workflowPrimary" disabled={Boolean(busy)} onClick={() => { void extract(); }}>{busy === 'preview' ? t.loading : t.preview}</button><div className="workflowSeparator"/><h3>{t.refresh}</h3><p>{t.refreshHelp}</p><button type="button" className="workflowGhost" disabled={Boolean(busy)} onClick={() => { void refreshFeed(); }}>{busy === 'refresh' ? t.loading : t.refresh}</button>{refreshResult && <div className="workflowResult" role="status"><strong>{refreshResult.changed ? t.changed : t.unchanged}</strong><span>{t.extracted}: {str(refreshResult.extracted)}</span><span>{t.inserted}: {str(refreshResult.inserted)}</span><span>{t.mode}: {str(refreshResult.mode)}</span>{refreshResult.monthlyChecksUsed !== undefined && <span>{t.quota}: {str(refreshResult.monthlyChecksUsed)}</span>}</div>}</section>
      <form className="workflowPanel workflowSettings" onSubmit={event => { void save(event); }}><h3>{t.settings}</h3><label>{t.name}<input required maxLength={200} value={draft.name} onChange={event => setDraft(old => ({ ...old, name: event.target.value }))}/></label><label>{t.sourceLabel}<input required type="url" value={draft.sourceUrl} onChange={event => setDraft(old => ({ ...old, sourceUrl: event.target.value }))}/></label><label className="workflowToggle"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(old => ({ ...old, enabled: event.target.checked }))}/>{t.enabled}</label><details className="workflowDisclosure"><summary>{t.advanced}</summary><p>{t.advancedHelp}</p>{SELECTORS.map(part => { const key = `${part}Selector`; const label = part === 'item' ? t.item : part === 'title' ? t.titleField : part === 'link' ? t.linkField : part === 'content' ? t.contentField : t.dateField; return <label key={key}>{label}<input maxLength={300} spellCheck={false} value={draft.selectors[key]} onChange={event => setDraft(old => ({ ...old, selectors: { ...old.selectors, [key]: event.target.value } }))}/></label>; })}</details><button className="workflowPrimary" type="submit" disabled={Boolean(busy)}>{busy === 'save' ? t.loading : t.save}</button><button className="workflowDanger" type="button" disabled={Boolean(busy)} onClick={() => { void remove(); }}>{t.delete}</button></form>
    </div>
    {preview && <section className="workflowPanel workflowPreview" aria-live="polite"><div className="workflowPreviewHead"><h3>{t.results} <small>{items.length}</small></h3><span>{t.mode}: {str(preview.mode)}</span>{preview.monthlyChecksUsed !== undefined && <span>{t.quota}: {str(preview.monthlyChecksUsed)}</span>}</div>{!items.length ? <p>{t.empty}</p> : <div className="workflowArticles">{items.map((item, i) => { const link = safeUrl(str(item.link)); return <article key={`${str(item.guid)}:${i}`}><span>{t.article} {i + 1} · {localDate(item.publishedAt, locale)}</span><h4>{link ? <a href={link} target="_blank" rel="noopener noreferrer">{str(item.title) || link} ↗</a> : str(item.title) || t.article}</h4><p>{str(item.description)}</p></article>; })}</div>}</section>}
  </section>;
}

type CronDraft = { name: string; cron: string; method: string; targetUrl: string; timezone: string; expectedStatus: string; maxRetries: string; notificationUrl: string; enabled: boolean };
function cronDraft(item: Data): CronDraft {
  return { name: str(item.name), cron: prop(item, 'cron', 'cron_expression'), method: str(item.method || 'GET'), targetUrl: prop(item, 'targetUrl', 'target_url'), timezone: str(item.timezone || 'UTC'), expectedStatus: str(item.expectedStatus ?? item.expected_status), maxRetries: str(item.maxRetries ?? item.max_retries ?? 0), notificationUrl: prop(item, 'notificationUrl', 'notification_url'), enabled: item.enabled !== false && item.enabled !== 0 };
}
const CRON = {
  ja: { title: 'スケジュールと実行結果', settings: '実行設定', name: 'ジョブ名', expression: 'Cron式（5フィールド）', timezone: 'タイムゾーン（IANA）', method: 'HTTPメソッド', target: '送信先URL', expected: '成功とみなすHTTPステータス（任意）', retries: '失敗時の再試行回数', notification: '失敗通知Webhook（任意）', enabled: 'ジョブを有効にする', preserve: '既存のリクエストヘッダーと本文は変更せず維持します。', save: '設定を保存', saved: '設定を保存しました。', history: '実行履歴', reload: '履歴を更新', empty: 'まだ実行履歴はありません。', attempts: '試行', alerts: '失敗通知', success: '成功', failure: '失敗', status: 'HTTPステータス', duration: '所要時間', last: '最終実行', count: '表示件数', loading: '通信中…', delete: 'ジョブを削除', confirm: 'このジョブと実行履歴を完全に削除しますか？', close: '閉じる', hint: 'Cron式は指定したタイムゾーンで解釈されます。', invalid: 'Cron式は5フィールドで入力してください。' },
  en: { title: 'Schedule and run results', settings: 'Execution settings', name: 'Job name', expression: 'Cron expression (5 fields)', timezone: 'Time zone (IANA)', method: 'HTTP method', target: 'Destination URL', expected: 'Expected HTTP status (optional)', retries: 'Retries after failure', notification: 'Failure webhook (optional)', enabled: 'Job enabled', preserve: 'Existing request headers and body are preserved.', save: 'Save settings', saved: 'Settings saved.', history: 'Run history', reload: 'Refresh history', empty: 'No runs recorded yet.', attempts: 'Attempts', alerts: 'Failure notifications', success: 'Success', failure: 'Failed', status: 'HTTP status', duration: 'Duration', last: 'Last run', count: 'Shown', loading: 'Working…', delete: 'Delete job', confirm: 'Permanently delete this job and its run history?', close: 'Close', hint: 'Cron times use the selected time zone.', invalid: 'Enter a five-field Cron expression.' },
  'zh-CN': { title: '计划与运行结果', settings: '执行设置', name: '任务名称', expression: 'Cron 表达式（5 段）', timezone: '时区（IANA）', method: 'HTTP 方法', target: '目标 URL', expected: '预期 HTTP 状态码（可选）', retries: '失败重试次数', notification: '失败通知 Webhook（可选）', enabled: '启用任务', preserve: '现有请求头和正文保持不变。', save: '保存设置', saved: '设置已保存。', history: '运行历史', reload: '刷新历史', empty: '暂无运行记录。', attempts: '尝试', alerts: '失败通知', success: '成功', failure: '失败', status: 'HTTP 状态', duration: '耗时', last: '上次运行', count: '显示', loading: '处理中…', delete: '删除任务', confirm: '永久删除任务及其运行历史？', close: '关闭', hint: 'Cron 时间按所选时区解释。', invalid: '请输入五段 Cron 表达式。' },
} as const;

export function CronManagementDetail({ resource, api, onClose, onChanged }: ManagementProps) {
  const { locale } = useI18n(); const t = CRON[locale];
  const base = `/api/picosvc/cron/jobs/${encodeURIComponent(str(resource.id))}`;
  const [draft, setDraft] = useState<CronDraft>(() => cronDraft(resource));
  const [current, setCurrent] = useState<Data>(resource);
  const [runs, setRuns] = useState<Data[]>([]); const [attempts, setAttempts] = useState<Data[]>([]); const [notifications, setNotifications] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [details, history] = await Promise.all([api(base), api(`${base}/runs`)]);
      const job = object(details.payload); const report = object(history.payload);
      if (!job || !report || !Array.isArray(report.runs)) throw new Error('Invalid Cron management response.');
      setCurrent(job); setDraft(cronDraft(job));
      setRuns(report.runs.filter((entry): entry is Data => object(entry) !== null));
      setAttempts(Array.isArray(report.attempts) ? report.attempts.filter((entry): entry is Data => object(entry) !== null) : []);
      setNotifications(Array.isArray(report.notifications) ? report.notifications.filter((entry): entry is Data => object(entry) !== null) : []);
    } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); }
  }, [api, base]);
  useEffect(() => { void reload(); }, [reload]);
  async function run(kind: string, action: () => Promise<void>) {
    if (busy) return; setBusy(kind); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(''); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); await run('save', async () => {
      if (draft.cron.trim().split(/\s+/).length !== 5) throw new Error(t.invalid);
      if (!safeUrl(draft.targetUrl) || (draft.notificationUrl && !safeUrl(draft.notificationUrl))) throw new Error('Valid HTTP(S) URL required.');
      const status = draft.expectedStatus.trim() ? Number(draft.expectedStatus) : null;
      const retries = Number(draft.maxRetries);
      if (status !== null && (!Number.isSafeInteger(status) || status < 100 || status > 599)) throw new Error('Expected HTTP status must be 100–599.');
      if (!Number.isSafeInteger(retries) || retries < 0 || retries > 3) throw new Error('Retries must be 0–3.');
      const body = { name: draft.name, cron: draft.cron.trim(), method: draft.method, targetUrl: draft.targetUrl, timezone: draft.timezone, expectedStatus: status, maxRetries: retries, notificationUrl: draft.notificationUrl || null, enabled: draft.enabled };
      const updated = object((await api(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).payload);
      setCurrent(old => ({ ...old, ...body, ...updated })); setNotice(t.saved); onChanged();
    });
  }
  async function remove() {
    if (!window.confirm(t.confirm)) return;
    await run('delete', async () => { await api(base, { method: 'DELETE' }); onChanged(); onClose(); });
  }
  // The backend's expectedStatus may deliberately treat 4xx/5xx as success: rely on recorded errors, not 2xx alone.
  const successful = runs.filter(entry => !entry.error && entry.response_status !== null && entry.response_status !== undefined).length;
  const latest = runs[0]; const target = safeUrl(draft.targetUrl);
  return <section className="workflowDetail workflowCron" aria-label="Cron job management">
    <div className="workflowHeading"><div><span className="workflowEyebrow">PICOSVC / CRON</span><h2>{t.title}</h2><p>{draft.name}</p></div><button type="button" className="workflowGhost" onClick={onClose}>{t.close} ×</button></div>
    {error && <p className="workflowError" role="alert">{error}</p>}{notice && <p className="workflowSuccess" role="status">{notice}</p>}
    <div className="workflowCronStats"><div><span>{t.last}</span><strong>{latest ? localDate(latest.ran_at, locale) : localDate(current.lastRunAt ?? current.last_run_at, locale)}</strong></div><div><span>{t.success}</span><strong>{successful} / {runs.length}</strong></div><div><span>{t.count}</span><strong>{runs.length} / 100</strong></div></div>
    <div className="workflowCronColumns"><form className="workflowPanel workflowSettings" onSubmit={event => { void save(event); }}><h3>{t.settings}</h3><label>{t.name}<input required maxLength={200} value={draft.name} onChange={event => setDraft(old => ({ ...old, name: event.target.value }))}/></label><label>{t.expression}<input required spellCheck={false} value={draft.cron} onChange={event => setDraft(old => ({ ...old, cron: event.target.value }))}/></label><p className="workflowHint">{t.hint}</p><label>{t.timezone}<input required list="picosvc-cron-timezones" spellCheck={false} value={draft.timezone} onChange={event => setDraft(old => ({ ...old, timezone: event.target.value }))}/><datalist id="picosvc-cron-timezones"><option value="UTC"/><option value="Asia/Tokyo"/><option value="America/New_York"/><option value="Europe/London"/></datalist></label><div className="workflowPair"><label>{t.method}<select value={draft.method} onChange={event => setDraft(old => ({ ...old, method: event.target.value }))}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(method => <option key={method}>{method}</option>)}</select></label><label>{t.expected}<input type="number" min={100} max={599} step={1} placeholder="200" value={draft.expectedStatus} onChange={event => setDraft(old => ({ ...old, expectedStatus: event.target.value }))}/></label></div><label>{t.target}<input required type="url" value={draft.targetUrl} onChange={event => setDraft(old => ({ ...old, targetUrl: event.target.value }))}/>{target && <a href={target} target="_blank" rel="noopener noreferrer">{target} ↗</a>}</label><div className="workflowPair"><label>{t.retries}<select value={draft.maxRetries} onChange={event => setDraft(old => ({ ...old, maxRetries: event.target.value }))}>{['0', '1', '2', '3'].map(count => <option key={count} value={count}>{count}</option>)}</select></label><label>{t.notification}<input type="url" value={draft.notificationUrl} placeholder="https://example.com/alerts" onChange={event => setDraft(old => ({ ...old, notificationUrl: event.target.value }))}/></label></div><label className="workflowToggle"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(old => ({ ...old, enabled: event.target.checked }))}/>{t.enabled}</label><p className="workflowHint">{t.preserve}</p><button type="submit" className="workflowPrimary" disabled={Boolean(busy) || loading}>{busy === 'save' ? t.loading : t.save}</button><button type="button" className="workflowDanger" disabled={Boolean(busy) || loading} onClick={() => { void remove(); }}>{t.delete}</button></form>
      <section className="workflowPanel workflowHistory"><div className="workflowHistoryHead"><h3>{t.history}</h3><button type="button" className="workflowGhost" disabled={Boolean(busy) || loading} onClick={() => { void reload(); }}>{loading ? t.loading : t.reload}</button></div>{!runs.length ? <p>{loading ? t.loading : t.empty}</p> : <div className="workflowRuns">{runs.map((entry, i) => { const status = entry.response_status; const failed = Boolean(entry.error) || status === null || status === undefined; const relatedAttempts = attempts.filter(attempt => attempt.run_id === entry.id); const relatedNotices = notifications.filter(note => note.run_id === entry.id); return <details key={str(entry.id || i)} className="workflowRun"><summary><span className={failed ? 'workflowRunFailure' : 'workflowRunSuccess'}>{failed ? t.failure : t.success}</span><span><strong>{localDate(entry.ran_at, locale)}</strong><small>{t.status}: {status === null || status === undefined ? '—' : str(status)} · {t.duration}: {str(entry.duration_ms ?? 0)} ms</small></span><span aria-hidden="true">⌄</span></summary><div className="workflowRunBody">{Boolean(entry.error) && <p className="workflowRunError">{str(entry.error)}</p>}{relatedAttempts.length > 0 && <><h4>{t.attempts} ({relatedAttempts.length})</h4>{relatedAttempts.map((attempt, index) => <p key={str(attempt.id || index)}>{str(attempt.attempt)}. HTTP {str(attempt.response_status ?? '—')} · {str(attempt.duration_ms)} ms {attempt.error ? `· ${str(attempt.error)}` : ''}</p>)}</>}{relatedNotices.length > 0 && <><h4>{t.alerts}</h4>{relatedNotices.map((note, index) => <p key={str(note.id || index)}>{str(note.status)} · HTTP {str(note.response_status ?? '—')} {note.error ? `· ${str(note.error)}` : ''}</p>)}</>}</div></details>; })}</div>}</section>
    </div>
  </section>;
}
