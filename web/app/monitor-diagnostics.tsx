'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { useI18n } from './i18n';
import './monitor-diagnostics.css';

const API = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
type Monitor = { id: string; name: string; target_url: string; last_checked_at?: string | null; last_error?: string | null; enabled?: boolean; advanced?: boolean };
type Event = { id: string; event_type: string; created_at: string; error?: string | null; diff_text?: string | null; webhook_error?: string | null; webhook_status?: number | null };
type Options = { enabled: boolean; contentSelector: string; ignoreSelector: string; stripPattern: string };
const DEFAULT_OPTIONS: Options = { enabled: true, contentSelector: '', ignoreSelector: '', stripPattern: '' };
const TEXT = {
  en: { title: 'Monitor health & diagnostics', intro: 'Inspect the last fetch error, browse change history and test selectors before trusting a monitor.', choose: 'Select a monitor', refresh: 'Refresh status', never: 'Not checked yet', last: 'Last checked', status: 'Status', working: 'Tracking', failed: 'Fetch failed', noMonitors: 'Create a monitor above to inspect it here.', noEvents: 'No change or fetch-error events yet. The first check runs on the scheduled worker.', events: 'Recent events', settings: 'Content detection', content: 'Content CSS selector (optional)', ignore: 'Ignore CSS selector (optional)', strip: 'Text exclusion pattern (optional)', save: 'Save detection settings', saving: 'Saving…', reset: 'Saving detection settings resets the comparison baseline.', preview: 'Test extraction (uses one check)', ready: 'Extraction preview', result: 'Result', error: 'Could not load monitor diagnostics', saved: 'Settings saved; the next check will establish a new baseline.', disabled: 'Paused' },
  ja: { title: 'Monitor の稼働状況・診断', intro: '取得失敗の理由や変更履歴を確認し、監視対象のCSSセレクターをテストできます。', choose: '監視対象を選択', refresh: '状態を更新', never: '未確認', last: '最終確認', status: '状態', working: '監視中', failed: '取得失敗', noMonitors: '上の画面でMonitorを作成すると、ここで診断できます。', noEvents: '変更・取得失敗の履歴はまだありません。初回確認は定期実行時に行われます。', events: '最近のイベント', settings: '検出条件', content: '監視するCSSセレクター（任意）', ignore: '除外するCSSセレクター（任意）', strip: 'テキスト除外パターン（任意）', save: '検出条件を保存', saving: '保存中…', reset: '検出条件を保存すると、差分比較の基準がリセットされます。', preview: '抽出テスト（確認枠を1回使用）', ready: '抽出プレビュー', result: '結果', error: '診断情報を取得できませんでした', saved: '設定を保存しました。次回の確認で比較基準を作成します。', disabled: '停止中' },
  'zh-CN': { title: '监控状态与诊断', intro: '查看抓取失败原因、变更历史，并在正式使用前测试 CSS 选择器。', choose: '选择监控', refresh: '刷新状态', never: '尚未检查', last: '最近检查', status: '状态', working: '监控中', failed: '抓取失败', noMonitors: '先在上方创建监控，即可在这里查看诊断。', noEvents: '尚无变更或抓取失败记录。首次检查将在定时任务运行时执行。', events: '最近的事件', settings: '内容检测', content: '内容 CSS 选择器（可选）', ignore: '忽略 CSS 选择器（可选）', strip: '文本排除模式（可选）', save: '保存检测设置', saving: '正在保存…', reset: '保存检测设置将重置内容比较基线。', preview: '测试提取（消耗一次检查额度）', ready: '提取预览', result: '结果', error: '无法获取监控诊断', saved: '设置已保存；下次检查将建立新基线。', disabled: '已暂停' },
} as const;

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as { error?: string | { message?: string }; detail?: string; requestId?: string };
    const reason = typeof record.error === 'string' ? record.error : record.error?.message;
    if (reason) return `${reason}${record.detail ? ` — ${record.detail}` : ''}${record.requestId ? ` (request ${record.requestId})` : ''}`;
  }
  return `HTTP ${status}`;
}

export default function MonitorDiagnostics() {
  const { locale } = useI18n();
  const t = TEXT[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [id, setId] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const current = monitors.find(item => item.id === id);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk: ClerkClass }) => {
      const instance = new ClerkClass(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      unsubscribe = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const token = await clerk?.session?.getToken();
    if (!API || !token) throw new Error('Sign in to view monitor diagnostics.');
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...init, headers });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${errorMessage(body, response.status)}${response.headers.get('x-request-id') ? ` [${response.headers.get('x-request-id')}]` : ''}`);
    return body;
  }, [clerk]);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const payload = await request('/api/picosvc/monitor') as { monitors?: Monitor[] };
      const found = Array.isArray(payload.monitors) ? payload.monitors : [];
      setMonitors(found);
      setId(old => found.some(monitor => monitor.id === old) ? old : found[0]?.id || '');
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [request, signedIn]);
  useEffect(() => { if (signedIn) void refresh(); else { setMonitors([]); setId(''); setEvents([]); setPreview(null); } }, [signedIn, refresh]);
  useEffect(() => {
    if (!id || !signedIn) { setEvents([]); return; }
    let active = true;
    setEvents([]); setPreview(null);
    Promise.all([
      request(`/api/picosvc/monitor/${encodeURIComponent(id)}/events`),
      request(`/api/picosvc/monitor/${encodeURIComponent(id)}/options`),
    ]).then(([history, settings]) => {
      if (!active) return;
      const records = history as { events?: Event[] };
      const config = settings as { enabled?: boolean; contentSelector?: string | null; ignoreSelector?: string | null; stripPattern?: string | null };
      setEvents(Array.isArray(records.events) ? records.events : []);
      setOptions({ enabled: config.enabled !== false, contentSelector: config.contentSelector || '', ignoreSelector: config.ignoreSelector || '', stripPattern: config.stripPattern || '' });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [id, request, signedIn]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!id || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/picosvc/monitor/${encodeURIComponent(id)}/options`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(options) });
      setNotice(t.saved); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function testExtraction() {
    if (!id || busy) return;
    setBusy(true); setError(''); setPreview(null);
    try {
      const result = await request(`/api/picosvc/monitor/${encodeURIComponent(id)}/preview`, { method: 'POST' });
      setPreview(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (!signedIn || !API || !CLERK_KEY) return null;
  return <section className="shell monitorDiagnostics" aria-label={t.title}>
    <div className="deployCard monitorDiagnosticsCard">
      <div className="sectionHead"><div><span className="kicker">PICOSVC / MONITOR</span><h2>{t.title}</h2><p>{t.intro}</p></div><button className="ghost" type="button" disabled={busy} onClick={() => { void refresh(); }}>{t.refresh}</button></div>
      {error && <div className="error" role="alert"><strong>{t.error}</strong><p>{error}</p></div>}
      {notice && <div className="success" role="status">{notice}</div>}
      {!monitors.length ? <p className="empty">{t.noMonitors}</p> : <>
        <label className="serviceField"><span>{t.choose}</span><select value={id} onChange={event => setId(event.target.value)}>{monitors.map(monitor => <option key={monitor.id} value={monitor.id}>{monitor.name} — {monitor.target_url}</option>)}</select></label>
        {current && <div className="monitorStatusGrid"><div><small>{t.status}</small><strong>{current.last_error ? t.failed : current.enabled === false ? t.disabled : t.working}</strong>{current.last_error && <p className="monitorFailure" role="alert">{current.last_error}</p>}</div><div><small>{t.last}</small><strong>{current.last_checked_at ? new Date(current.last_checked_at).toLocaleString(locale) : t.never}</strong></div></div>}
        <div className="monitorDiagnosticsGrid">
          <form className="serviceInnerForm" onSubmit={event => { void save(event); }}><h3>{t.settings}</h3><label className="serviceField"><span>{t.content}</span><input maxLength={200} value={options.contentSelector} placeholder="main, article, #content" onChange={event => setOptions(old => ({ ...old, contentSelector: event.target.value }))} /></label><label className="serviceField"><span>{t.ignore}</span><input maxLength={200} value={options.ignoreSelector} placeholder=".ads, .timestamp" onChange={event => setOptions(old => ({ ...old, ignoreSelector: event.target.value }))} /></label><label className="serviceField"><span>{t.strip}</span><input maxLength={200} value={options.stripPattern} onChange={event => setOptions(old => ({ ...old, stripPattern: event.target.value }))} /></label><p className="serviceMuted">{t.reset}</p><div className="serviceButtons"><button className="primary" type="submit" disabled={busy}>{busy ? t.saving : t.save}</button><button className="secondary" type="button" disabled={busy} onClick={() => { void testExtraction(); }}>{t.preview}</button></div>{preview !== null && <div className="monitorPreview" role="status"><h4>{t.ready}</h4><pre>{JSON.stringify(preview, null, 2)}</pre></div>}</form>
          <div className="monitorHistory"><h3>{t.events}</h3>{!events.length ? <p className="serviceMuted">{t.noEvents}</p> : <ul>{events.map(item => <li key={item.id}><div><strong>{item.event_type === 'fetch_error' ? t.failed : item.event_type}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(locale)}</time></div>{item.error && <p className="monitorFailure">{item.error}</p>}{item.diff_text && <pre>{item.diff_text}</pre>}{item.webhook_error && <p className="monitorFailure">Webhook: {item.webhook_error}</p>}{item.webhook_status && <small>Webhook HTTP {item.webhook_status}</small>}</li>)}</ul>}</div>
        </div>
      </>}
    </div>
  </section>;
}
