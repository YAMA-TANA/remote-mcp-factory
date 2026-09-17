'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from './i18n';
import type { ManagementProps } from './service-management-detail';
import './service-advanced-operations.css';

type Data = Record<string, unknown>;
type Props = Pick<ManagementProps, 'resource' | 'api' | 'onChanged'> & { onOptionsChanged: () => void };
type Options = { contentSelector: string; ignoreSelector: string; stripPattern: string; enabled: boolean };
const obj = (value: unknown): Data | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const str = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const err = (value: unknown): string => value instanceof Error ? value.message : String(value);
const bool = (value: unknown): boolean => value === true || value === 1 || value === '1';
const date = (value: unknown, locale: string) => {
  const parsed = new Date(str(value));
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : '—';
};
const makeOptions = (value: Data): Options => ({ contentSelector: str(value.contentSelector), ignoreSelector: str(value.ignoreSelector), stripPattern: str(value.stripPattern), enabled: bool(value.enabled) });
const LABELS = {
  ja: { title: '変更履歴・抽出ルール', intro: '変更と取得エラーを区別して確認し、ページのどこを監視するか指定します。', reload: '履歴を更新', loading: '取得中…', events: '監視イベント', all: 'すべて', changes: '変更', failures: '取得エラー', empty: '記録はありません。', noMatch: '該当する記録はありません。', changed: '内容が変更されました', failed: 'ページ取得に失敗', difference: '変更差分', previous: '変更前の指紋', next: '変更後の指紋', error: '取得エラー', webhook: 'Webhookの結果', webhookError: '通知エラー', options: '抽出・除外ルール', content: '監視範囲のCSSセレクター（空欄ならbody）', ignore: '無視する要素のCSSセレクター', strip: '除去する文字列パターン（安全な正規表現）', enabled: 'このルールで監視を有効にする', save: '抽出ルールを保存', saved: '抽出ルールを保存しました。', reset: '変更を戻す', preview: '保存済みルールで抽出プレビュー', previewHelp: 'プレビューは月間チェック枠を1回消費します。未保存の設定はプレビューに反映されません。', previewTitle: '抽出結果', baseline: 'ルールを保存すると比較基準がリセットされ、次の成功チェックで新しい基準を作ります。変更履歴自体は削除されません。保存しますか？', invalid: 'CSSセレクターは各200文字以内で指定してください。', discard: '未保存のルール変更を破棄しますか？', status: '最後のチェック時刻だけでは成功は判断できません。以下の取得エラーも確認してください。', time: '発生日時', historical: '最新100件を表示します。', advanced: '詳細ルールが有効', basic: '標準ルール', webhookNotSent: '通知なし／送信結果なし' },
  en: { title: 'Changes & extraction rules', intro: 'Distinguish content changes from fetch failures and control which part of a page is watched.', reload: 'Refresh events', loading: 'Loading…', events: 'Monitor events', all: 'All', changes: 'Changes', failures: 'Fetch errors', empty: 'No events recorded.', noMatch: 'No matching events.', changed: 'Content changed', failed: 'Page fetch failed', difference: 'Readable diff', previous: 'Previous fingerprint', next: 'New fingerprint', error: 'Fetch error', webhook: 'Webhook response', webhookError: 'Notification error', options: 'Extraction and exclusions', content: 'Content CSS selector (blank = body)', ignore: 'Ignore CSS selector', strip: 'Text removal pattern (safe regex subset)', enabled: 'Monitor enabled with these rules', save: 'Save extraction rules', saved: 'Extraction rules saved.', reset: 'Reset changes', preview: 'Preview with saved rules', previewHelp: 'A preview consumes one monthly check. Unsaved settings do not affect the preview.', previewTitle: 'Extracted content', baseline: 'Saving rules resets the comparison baseline. The next successful check establishes a new baseline; existing event history is retained. Continue?', invalid: 'Each CSS selector must be at most 200 characters.', discard: 'Discard unsaved rule changes?', status: 'A last-checked timestamp is not proof of success. Review fetch-error events below.', time: 'Occurred', historical: 'Showing the latest 100 events.', advanced: 'Advanced rules active', basic: 'Standard rules', webhookNotSent: 'No notification result' },
  'zh-CN': { title: '变更记录和提取规则', intro: '区分页面变化与抓取失败，指定监控的页面部分。', reload: '刷新事件', loading: '加载中…', events: '监控事件', all: '全部', changes: '变更', failures: '抓取错误', empty: '暂无事件。', noMatch: '没有匹配的事件。', changed: '内容已变化', failed: '页面抓取失败', difference: '可读差异', previous: '旧内容指纹', next: '新内容指纹', error: '抓取错误', webhook: 'Webhook 响应', webhookError: '通知错误', options: '提取及排除规则', content: '内容 CSS 选择器（留空为 body）', ignore: '忽略 CSS 选择器', strip: '文本删除模式（安全正则子集）', enabled: '启用这些监控规则', save: '保存提取规则', saved: '规则已保存。', reset: '还原更改', preview: '使用已保存规则预览', previewHelp: '每次预览消耗一次月度检查额度。未保存的设置不影响预览。', previewTitle: '提取结果', baseline: '保存规则会重置比较基准。下次成功检查会建立新基准，历史事件不会删除。继续吗？', invalid: '每个 CSS 选择器不得超过200个字符。', discard: '放弃未保存的规则更改？', status: '最近检查时间不能证明抓取成功，请同时查看抓取错误事件。', time: '发生时间', historical: '最多显示最近100条事件。', advanced: '高级规则已启用', basic: '标准规则', webhookNotSent: '无通知结果' },
} as const;

export function MonitorOperations({ resource, api, onChanged, onOptionsChanged }: Props) {
  const { locale } = useI18n(); const t = LABELS[locale];
  const base = `/api/picosvc/monitor/${encodeURIComponent(str(resource.id))}`;
  const [events, setEvents] = useState<Data[]>([]);
  const [saved, setSaved] = useState<Options | null>(null);
  const [draft, setDraft] = useState<Options | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [filter, setFilter] = useState<'all' | 'change' | 'fetch_error'>('all');
  const [preview, setPreview] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = Boolean(saved && draft && Object.keys(saved).some(key => saved[key as keyof Options] !== draft[key as keyof Options]));
  const load = useCallback(async (resetDraft: boolean) => {
    setLoading(true); setError('');
    try {
      const [config, history] = await Promise.all([api(`${base}/options`), api(`${base}/events`)]);
      const options = obj(config.payload);
      const items = obj(history.payload)?.events;
      if (!options || !Array.isArray(items)) throw new Error('Invalid monitor options/events API response.');
      const next = makeOptions(options);
      setEvents(items.filter((item): item is Data => obj(item) !== null));
      setAdvanced(bool(options.advanced));
      if (resetDraft) { setDraft(next); setSaved(next); }
    } catch (reason) { setError(err(reason)); }
    finally { setLoading(false); }
  }, [api, base]);
  useEffect(() => { void load(true); }, [load]);
  async function refresh() {
    if (busy || loading) return;
    if (dirty && !window.confirm(t.discard)) return;
    await load(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft || busy || loading || !dirty) return;
    if (draft.contentSelector.length > 200 || draft.ignoreSelector.length > 200) { setError(t.invalid); return; }
    if (!window.confirm(t.baseline)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = obj((await api(`${base}/options`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...draft, contentSelector: draft.contentSelector.trim() || null, ignoreSelector: draft.ignoreSelector.trim() || null, stripPattern: draft.stripPattern.trim() || null }) })).payload);
      if (!response) throw new Error('Invalid monitor options update response.');
      const next = makeOptions(response);
      setDraft(next); setSaved(next); setAdvanced(true); setPreview(null); setNotice(t.saved);
      onOptionsChanged(); onChanged();
    } catch (reason) { setError(err(reason)); }
    finally { setBusy(false); }
  }
  async function runPreview() {
    if (busy || loading || dirty) return;
    setBusy(true); setError(''); setPreview(null);
    try {
      const result = obj((await api(`${base}/preview`, { method: 'POST' })).payload);
      if (!result || typeof result.text !== 'string') throw new Error('Invalid monitor preview API response.');
      setPreview(result);
    } catch (reason) { setError(err(reason)); }
    finally { setBusy(false); }
  }
  const filtered = events.filter(item => filter === 'all' || item.event_type === filter);
  return <section className="advancedOperations" aria-label={t.title}>
    <header className="advancedOperationsHead"><div><span className="advancedEyebrow">PICOSVC / MONITOR / DIAGNOSTICS</span><h2>{t.title}</h2><p>{t.intro}</p></div><button type="button" onClick={() => { void refresh(); }} disabled={busy || loading}>{loading ? t.loading : t.reload}</button></header>
    {error && <p className="advancedError" role="alert">{error}</p>}{notice && <p className="advancedSuccess" role="status">{notice}</p>}
    <div className="advancedOperationsColumns">
      <section className="advancedPanel"><h3>{t.options} <span className="advancedPill">{advanced ? t.advanced : t.basic}</span></h3>{draft ? <form className="advancedOptionsForm" onSubmit={event => { void save(event); }}><fieldset disabled={busy || loading}><label>{t.content}<input maxLength={200} value={draft.contentSelector} onChange={event => setDraft({ ...draft, contentSelector: event.target.value })} placeholder="main" /></label><label>{t.ignore}<input maxLength={200} value={draft.ignoreSelector} onChange={event => setDraft({ ...draft, ignoreSelector: event.target.value })} placeholder=".ads, .banner" /></label><label>{t.strip}<input value={draft.stripPattern} onChange={event => setDraft({ ...draft, stripPattern: event.target.value })} placeholder="\\s+" /></label><label className="advancedToggle"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/>{t.enabled}</label><div className="advancedActions"><button type="submit" disabled={!dirty}>{t.save}</button><button type="button" disabled={!dirty} onClick={() => { setDraft(saved); }}>{t.reset}</button></div></fieldset></form> : <p role="status">{t.loading}</p>}
        <div className="advancedPreview"><p className="advancedHint">{t.previewHelp}</p><button type="button" disabled={busy || loading || dirty} onClick={() => { void runPreview(); }}>{busy ? t.loading : t.preview}</button>{preview && <div><h4>{t.previewTitle}</h4><pre>{str(preview.text) || '—'}</pre><code>{str(preview.hash)}</code></div>}</div></section>
      <section className="advancedPanel"><h3>{t.events}</h3><p className="advancedHint">{t.status} {t.historical}</p><div className="advancedFilters" role="group" aria-label={t.events}>{(['all', 'change', 'fetch_error'] as const).map(key => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === 'all' ? t.all : key === 'change' ? t.changes : t.failures} ({key === 'all' ? events.length : events.filter(item => item.event_type === key).length})</button>)}</div>
        {loading ? <p role="status">{t.loading}</p> : events.length === 0 ? <p className="advancedEmpty">{t.empty}</p> : filtered.length === 0 ? <p className="advancedEmpty">{t.noMatch}</p> : <div className="advancedScroll">{filtered.map((item, index) => <details className="advancedEvent" key={str(item.id) || index}><summary><strong>{item.event_type === 'change' ? t.changed : t.failed}</strong><time>{date(item.created_at, locale)}</time></summary><div className="advancedEventBody">{item.event_type === 'change' ? <><p>{t.previous}: <code>{str(item.old_hash) || '—'}</code></p><p>{t.next}: <code>{str(item.new_hash) || '—'}</code></p>{item.diff_text != null && <><h4>{t.difference}</h4><pre>{str(item.diff_text)}</pre></>}</> : <p className="advancedError">{t.error}: {str(item.error) || '—'}</p>}{item.webhook_status != null ? <p>{t.webhook}: HTTP {str(item.webhook_status)}</p> : <p>{t.webhookNotSent}</p>}{item.webhook_error != null && <p className="advancedError">{t.webhookError}: {str(item.webhook_error)}</p>}</div></details>)}</div>}</section>
    </div>
  </section>;
}
