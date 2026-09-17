'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from '../i18n';
import { PICOSVC_PRICING, tierLabel, type BillingTierId } from '../pricing-data';
import { downloadManagementCsv, filterHookInventory, hookInventoryCsv, validReplayDestination } from '../service-standalone-management';
import '../service-standalone-management.css';

type Inbox = { id: string; name: string; enabled: boolean; endpoint: string; eventCount: number; latestEventAt: string | null; createdAt: string; updatedAt: string };
type HookEvent = { id: string; inboxId: string; method: string; path: string; query: Array<[string, string]>; headers: Record<string, string>; contentType: string | null; bodyPreview: string; bodyBase64?: string; sizeBytes: number; receivedAt: string };
type InboxList = { tier: BillingTierId; monthlyEventLimit: number | null; monthlyEventsUsed: number; inboxes: Inbox[] };
type EventList = { inbox: Inbox; events: HookEvent[]; nextBefore: string | null };
type ReplayResult = { ok: boolean; status: number; statusText: string; location: string | null; target: string };
const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const MAX_LOADED_EVENTS = 500;
const COPY = {
  en: {
    title1: 'Catch webhooks.', title2: 'Inspect. Replay.', lede: `Create a public webhook inbox, inspect incoming requests, and replay events. Free includes 500 events/month, Pico is $${PICOSVC_PRICING.standalone.pico}/month for 10,000, and PicoPlus is $${PICOSVC_PRICING.standalone.picoPlus}/month for 100,000. Larger usage is available by contact.`,
    signInTitle: 'Sign in to create a webhook inbox', signInBody: 'Your PicoSvc login is shared across products, while Hooks keeps its own plan and usage quota.', signIn: 'Sign in to PicoSvc', plan: 'HOOKS PLAN', usage: 'events this month', newInbox: 'New inbox', name: 'Name', create: 'Create inbox', creating: 'Creating…', inboxes: 'Webhook inboxes', noInboxes: 'No webhook inboxes yet.', copyUrl: 'Copy URL', open: 'Open events', pause: 'Pause', resume: 'Resume', events: 'Events', noEvents: 'No events received yet.', selectInbox: 'Select an inbox to inspect its events.', received: 'Received', bytes: 'bytes', detail: 'Event detail', headers: 'Headers', query: 'Query', body: 'Body preview', replay: 'Replay event', replayUrl: 'Destination URL', replayButton: 'Replay', replaying: 'Replaying…', replayResult: 'Replay result', deleteEvent: 'Delete event', loadMore: 'Load more',
    deleteInboxConfirm: 'Permanently delete this inbox and all its captured events? This cannot be undone.', deleteEventConfirm: 'Permanently delete this captured event?', replayConfirm: 'Send this event to the destination again? The receiver might process it twice.', invalidReplay: 'Enter a valid HTTP(S) destination without credentials or fragments.', find: 'Search loaded events by path or content type', methodFilter: 'HTTP method', allMethods: 'All methods', export: 'Download filtered metadata CSV', exportHint: 'Only the loaded event metadata is exported. Headers, query values, bodies and replay destinations are excluded.', matches: 'matching loaded events', partial: 'Older events remain on the server; this is not a complete history.', capped: 'Loaded-event limit reached (500).', noMatches: 'No loaded events match these filters.', loadError: 'Could not load events.', copyFailed: 'Could not copy inbox URL.'
  },
  ja: {
    title1: 'Webhookを受信。', title2: '確認して、Replay。', lede: `公開Webhook Inboxを作成し、受信requestを確認してReplayできます。Freeは月500 events、Picoは月$${PICOSVC_PRICING.standalone.pico}で10,000 events、PicoPlusは月$${PICOSVC_PRICING.standalone.picoPlus}で100,000 events。それ以上はお問い合わせください。`,
    signInTitle: 'Webhook Inboxを作るにはログイン', signInBody: 'PicoSvcのログインは共通ですが、Hooksのプランと利用量は他製品とは独立です。', signIn: 'PicoSvcにログイン', plan: 'HOOKSプラン', usage: '今月のevents', newInbox: '新しいInbox', name: '名前', create: 'Inboxを作成', creating: '作成中…', inboxes: 'Webhook Inboxes', noInboxes: 'Webhook Inboxはまだありません。', copyUrl: 'URLをコピー', open: 'Eventsを見る', pause: '停止', resume: '再開', events: 'Events', noEvents: 'まだイベントを受信していません。', selectInbox: 'Inboxを選ぶと受信イベントを確認できます。', received: '受信', bytes: 'bytes', detail: 'Event詳細', headers: 'Headers', query: 'Query', body: 'Body preview', replay: 'EventをReplay', replayUrl: '送信先URL', replayButton: 'Replay', replaying: '送信中…', replayResult: 'Replay結果', deleteEvent: 'Eventを削除', loadMore: 'さらに読み込む',
    deleteInboxConfirm: 'Inboxと保存済みの全イベントを完全に削除しますか？元に戻せません。', deleteEventConfirm: 'この受信イベントを完全に削除しますか？', replayConfirm: 'このイベントを再送しますか？受信先で二重処理される可能性があります。', invalidReplay: '認証情報・フラグメントを含まないHTTP(S) URLを指定してください。', find: '読み込み済みイベントをパス・Content-Typeで検索', methodFilter: 'HTTPメソッド', allMethods: 'すべてのメソッド', export: '絞り込み結果のメタデータCSV', exportHint: '読み込み済みイベントのみ対象。ヘッダー・クエリ値・本文・再送先URLは出力しません。', matches: '件の一致', partial: '古いイベントはサーバーに残っています。全履歴ではありません。', capped: '読み込み上限の500件に達しました。', noMatches: '条件に一致するイベントはありません。', loadError: 'イベントを読み込めませんでした。', copyFailed: 'Inbox URLをコピーできませんでした。'
  },
  'zh-CN': {
    title1: '接收 Webhook。', title2: '查看并 Replay。', lede: `创建公开 Webhook Inbox，查看收到的请求并 Replay。Free 每月 500 events，Pico 每月 $${PICOSVC_PRICING.standalone.pico} 包含 10,000，PicoPlus 每月 $${PICOSVC_PRICING.standalone.picoPlus} 包含 100,000；更高用量请联系我们。`,
    signInTitle: '登录后创建 Webhook Inbox', signInBody: 'PicoSvc 登录账号在产品间共用，但 Hooks 的套餐和使用量独立计算。', signIn: '登录 PicoSvc', plan: 'HOOKS 套餐', usage: '本月 events', newInbox: '新 Inbox', name: '名称', create: '创建 Inbox', creating: '创建中…', inboxes: 'Webhook Inboxes', noInboxes: '还没有 Webhook Inbox。', copyUrl: '复制 URL', open: '查看 Events', pause: '暂停', resume: '恢复', events: 'Events', noEvents: '尚未收到事件。', selectInbox: '选择一个 Inbox 查看收到的事件。', received: '收到', bytes: 'bytes', detail: 'Event 详情', headers: 'Headers', query: 'Query', body: 'Body preview', replay: 'Replay Event', replayUrl: '目标 URL', replayButton: 'Replay', replaying: '发送中…', replayResult: 'Replay 结果', deleteEvent: '删除 Event', loadMore: '加载更多',
    deleteInboxConfirm: '永久删除此收件箱及所有事件？此操作无法撤销。', deleteEventConfirm: '永久删除此事件？', replayConfirm: '重新发送此事件？接收方可能重复处理。', invalidReplay: '请输入不含凭据或片段的有效 HTTP(S) URL。', find: '按路径或内容类型搜索已加载的事件', methodFilter: 'HTTP 方法', allMethods: '所有方法', export: '导出筛选后的元数据 CSV', exportHint: '仅导出已加载事件的元数据，不含请求头、查询值、正文或重放目标。', matches: '个匹配事件', partial: '服务器还有较旧事件，此列表不是完整历史。', capped: '已达到500条加载上限。', noMatches: '没有匹配的已加载事件。', loadError: '无法加载事件。', copyFailed: '无法复制收件箱 URL。'
  },
} as const;
function decodeBody(event: HookEvent | null): string {
  if (!event?.bodyBase64) return event?.bodyPreview || '';
  try { const binary = atob(event.bodyBase64); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0)); return new TextDecoder().decode(bytes); }
  catch { return event.bodyPreview || ''; }
}
function when(value: string | null): string { if (!value) return '—'; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString() : value; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export default function HooksPage() {
  const { locale, messages, localizedHref } = useI18n(); const t = COPY[locale]; const c = messages.common;
  const [clerk, setClerk] = useState<Clerk | null>(null); const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<InboxList>({ tier: 'free', monthlyEventLimit: 500, monthlyEventsUsed: 0, inboxes: [] });
  const [name, setName] = useState('Development webhook');
  const [activeInbox, setActiveInbox] = useState<Inbox | null>(null);
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<HookEvent | null>(null);
  const [replayUrl, setReplayUrl] = useState('https://example.com/webhook');
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [filterQuery, setFilterQuery] = useState(''); const [methodFilter, setMethodFilter] = useState('all');
  const [loadingEvents, setLoadingEvents] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const userButtonRef = useRef<HTMLDivElement>(null);
  const eventRequest = useRef(0); const detailRequest = useRef(0);
  const visible = filterHookInventory(events, filterQuery, methodFilter);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true; let removeListener: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY); await instance.load({ ui }); if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn));
      removeListener = instance.addListener(() => { if (active) setSignedIn(Boolean(instance.isSignedIn)); });
    }).catch(error => { if (active) setMessage(errorMessage(error)); });
    return () => { active = false; removeListener?.(); };
  }, []);
  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    const node = userButtonRef.current; clerk.mountUserButton(node);
    return () => { clerk.unmountUserButton(node); };
  }, [clerk, signedIn]);
  useEffect(() => {
    if (!signedIn) { eventRequest.current += 1; detailRequest.current += 1; setActiveInbox(null); setEvents([]); setNextBefore(null); setSelectedEvent(null); setReplayResult(null); }
  }, [signedIn]);

  async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
    if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    const token = await clerk?.session?.getToken(); if (!token) throw new Error(c.signIn);
    const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${API_URL}${route}`, { ...init, headers });
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null;
      throw new Error(typeof error === 'string' ? error : `HTTP ${response.status}`);
    }
    return payload as T;
  }
  async function refresh() {
    if (!signedIn) return;
    try {
      const next = await api<InboxList>('/api/picosvc/hooks/inboxes');
      if (!next || !Array.isArray(next.inboxes)) throw new Error('Invalid inbox response.');
      setData(next); setMessage('');
      if (activeInbox) {
        const updated = next.inboxes.find(item => item.id === activeInbox.id);
        if (updated) setActiveInbox(updated);
        else { eventRequest.current += 1; detailRequest.current += 1; setActiveInbox(null); setEvents([]); setNextBefore(null); setSelectedEvent(null); }
      }
    } catch (error) { setMessage(errorMessage(error)); }
  }
  useEffect(() => { if (signedIn && clerk) void refresh(); }, [signedIn, clerk]);
  async function createInbox() {
    if (busy || !name.trim()) return;
    setBusy(true); setMessage('');
    try {
      const created = await api<Inbox>('/api/picosvc/hooks/inboxes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      await refresh(); await openInbox(created); setName('Development webhook');
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function openInbox(inbox: Inbox, before?: string, append = false) {
    if (append && (loadingEvents || busy || events.length >= MAX_LOADED_EVENTS)) return;
    const seq = ++eventRequest.current; detailRequest.current += 1; setLoadingEvents(true); setMessage('');
    try {
      const suffix = before ? `?before=${encodeURIComponent(before)}` : '';
      const result = await api<EventList>(`/api/picosvc/hooks/inboxes/${encodeURIComponent(inbox.id)}/events${suffix}`);
      if (seq !== eventRequest.current) return;
      if (!result || result.inbox?.id !== inbox.id || !Array.isArray(result.events) || (result.nextBefore !== null && typeof result.nextBefore !== 'string')) throw new Error(t.loadError);
      setActiveInbox(result.inbox);
      setEvents(current => append ? [...current, ...result.events.filter(item => !current.some(previous => previous.id === item.id))].slice(0, MAX_LOADED_EVENTS) : result.events.slice(0, MAX_LOADED_EVENTS));
      setNextBefore(result.nextBefore);
      if (!append) { setSelectedEvent(null); setReplayResult(null); setFilterQuery(''); setMethodFilter('all'); }
    } catch (error) { if (seq === eventRequest.current) setMessage(errorMessage(error)); }
    finally { if (seq === eventRequest.current) setLoadingEvents(false); }
  }
  async function toggleInbox(inbox: Inbox) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await api(`/api/picosvc/hooks/inboxes/${encodeURIComponent(inbox.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !inbox.enabled }) }); await refresh(); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function deleteInbox(inbox: Inbox) {
    if (busy || !window.confirm(`${t.deleteInboxConfirm}\n${inbox.name}`)) return;
    setBusy(true); setMessage('');
    try {
      await api(`/api/picosvc/hooks/inboxes/${encodeURIComponent(inbox.id)}`, { method: 'DELETE' });
      if (activeInbox?.id === inbox.id) { eventRequest.current += 1; detailRequest.current += 1; setActiveInbox(null); setEvents([]); setNextBefore(null); setSelectedEvent(null); setReplayResult(null); }
      await refresh();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function inspectEvent(event: HookEvent) {
    const seq = ++detailRequest.current; setMessage('');
    try {
      const result = await api<HookEvent>(`/api/picosvc/hooks/events/${encodeURIComponent(event.id)}`);
      if (seq !== detailRequest.current) return;
      if (!result || result.id !== event.id || result.inboxId !== activeInbox?.id) throw new Error(t.loadError);
      setSelectedEvent(result); setReplayResult(null);
    } catch (error) { if (seq === detailRequest.current) setMessage(errorMessage(error)); }
  }
  async function deleteEvent(event: HookEvent) {
    if (busy || !window.confirm(t.deleteEventConfirm)) return;
    setBusy(true); setMessage('');
    try {
      await api(`/api/picosvc/hooks/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' });
      if (selectedEvent?.id === event.id) { detailRequest.current += 1; setSelectedEvent(null); setReplayResult(null); }
      if (activeInbox) await openInbox(activeInbox);
      await refresh();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function replay() {
    if (busy || !selectedEvent) return;
    if (!validReplayDestination(replayUrl)) { setMessage(t.invalidReplay); return; }
    if (!window.confirm(`${t.replayConfirm}\n${replayUrl}`)) return;
    setBusy(true); setReplayResult(null); setMessage('');
    try { setReplayResult(await api<ReplayResult>(`/api/picosvc/hooks/events/${encodeURIComponent(selectedEvent.id)}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: replayUrl }) })); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  function exportEvents() {
    if (!activeInbox || !visible.length) return;
    try { downloadManagementCsv(hookInventoryCsv(visible), `picosvc-hooks-${activeInbox.id.slice(0, 8)}-loaded.csv`); }
    catch (error) { setMessage(errorMessage(error)); }
  }
  async function copyInboxUrl(endpoint: string) {
    try { await navigator.clipboard.writeText(endpoint); }
    catch { setMessage(t.copyFailed); }
  }
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href={localizedHref('/')}>{c.products}</a><a href={localizedHref('/pricing')}>Pricing</a><a href={localizedHref('/mock')}>{c.mock}</a><a href={localizedHref('/contact')}>{c.contact}</a><LanguageSwitcher />{signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{c.signIn}</button>}</div>
      </nav>
      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> PicoSvc Hooks</div><h1>{t.title1}<br />{t.title2}</h1><p className="lede">{t.lede}</p>
        {!signedIn ? <div className="deployCard signinState"><div><strong>{t.signInTitle}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div> : (
          <div className="deployCard">
            <div className="sectionHead"><div><span className="kicker">{tierLabel(data.tier)} {t.plan}</span><h2>{t.newInbox}</h2></div><span>{data.monthlyEventsUsed} / {data.monthlyEventLimit ?? '∞'} {t.usage}</span></div>
            <div className="repoRow"><div className="repoInput"><span>↗</span><input value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder={t.name} /></div><button className="primary" disabled={busy || !name.trim()} onClick={() => { void createInbox(); }}>{busy ? t.creating : t.create}</button></div>
            {message && <div className="error" role="alert">{message}</div>}
          </div>
        )}
      </section>
      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">PICOSVC HOOKS</span><h2>{t.inboxes}</h2></div>{signedIn && <button className="ghost" disabled={busy} onClick={() => { void refresh(); }}>{c.refresh}</button>}</div>
        {!signedIn ? <div className="empty">{t.signInTitle}</div> : data.inboxes.length === 0 ? <div className="empty">{t.noInboxes}</div> : (
          <div className="deploymentGrid">{data.inboxes.map(inbox => <article className="deployment" key={inbox.id}>
            <div className="deploymentTop"><div><strong>{inbox.name}</strong><p>{inbox.eventCount} events · {when(inbox.latestEventAt)}</p></div><span className={`status ${inbox.enabled ? 'ready' : ''}`}>{inbox.enabled ? c.active : c.disabled}</span></div>
            <div className="success"><code className="standaloneEndpoint">{inbox.endpoint}</code></div>
            <div className="deploymentBottom"><button className="ghost" disabled={busy} onClick={() => { void copyInboxUrl(inbox.endpoint); }}>{t.copyUrl}</button><button className="ghost" disabled={busy || loadingEvents} onClick={() => { void openInbox(inbox); }}>{t.open}</button><button className="ghost" disabled={busy} onClick={() => { void toggleInbox(inbox); }}>{inbox.enabled ? t.pause : t.resume}</button><button className="ghost" disabled={busy} onClick={() => { void deleteInbox(inbox); }}>{c.delete}</button></div>
          </article>)}</div>
        )}
      </section>
      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">{activeInbox?.name || 'INBOX'}</span><h2>{t.events}</h2></div>{activeInbox && <span className="standaloneEndpoint">{activeInbox.endpoint}</span>}</div>
        {activeInbox && <div className="standaloneTools"><div className="standaloneToolFilters"><label>{t.find}<input type="search" value={filterQuery} maxLength={160} onChange={event => setFilterQuery(event.target.value)} /></label><label>{t.methodFilter}<select value={methodFilter} onChange={event => setMethodFilter(event.target.value)}><option value="all">{t.allMethods}</option>{['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].map(method => <option key={method} value={method}>{method}</option>)}</select></label></div><div className="standaloneToolFoot"><span role="status">{visible.length} / {events.length} {t.matches}</span><button className="secondary" disabled={busy || !visible.length} type="button" onClick={exportEvents}>{t.export}</button></div><small>{t.exportHint}</small>{nextBefore && <small>{events.length >= MAX_LOADED_EVENTS ? t.capped : t.partial}</small>}</div>}
        {!activeInbox ? <div className="empty">{t.selectInbox}</div> : loadingEvents && !events.length ? <div className="empty" role="status">{t.loadMore}…</div> : events.length === 0 ? <div className="empty">{t.noEvents}</div> : visible.length === 0 ? <div className="empty">{t.noMatches}</div> : <>
          <div className="deploymentGrid">{visible.map(event => <article className="deployment" key={event.id}>
            <button className="standaloneEventButton" type="button" onClick={() => { void inspectEvent(event); }}><div className="deploymentTop"><div><strong>{event.method} {event.path || '/'}</strong><p>{when(event.receivedAt)}</p></div><span className="status ready">{event.sizeBytes} {t.bytes}</span></div><pre>{event.bodyPreview || '∅'}</pre></button>
          </article>)}</div>
          {nextBefore && events.length < MAX_LOADED_EVENTS && <div style={{ marginTop: 16 }}><button className="ghost" disabled={loadingEvents || busy} onClick={() => { if (activeInbox) void openInbox(activeInbox, nextBefore, true); }}>{loadingEvents ? `${t.loadMore}…` : t.loadMore}</button></div>}
        </>}
      </section>
      {selectedEvent && <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">{t.received} {when(selectedEvent.receivedAt)}</span><h2>{t.detail}</h2></div><button className="ghost" disabled={busy} onClick={() => { void deleteEvent(selectedEvent); }}>{t.deleteEvent}</button></div>
        <div className="deployCard">
          <h3>{selectedEvent.method} {selectedEvent.path || '/'}</h3>
          <p><strong>{t.query}</strong></p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(selectedEvent.query, null, 2)}</pre>
          <p><strong>{t.headers}</strong></p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(selectedEvent.headers, null, 2)}</pre>
          <p><strong>{t.body}</strong></p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto' }}>{decodeBody(selectedEvent) || '∅'}</pre>
          <h3>{t.replay}</h3><div className="repoRow"><div className="repoInput"><span>↗</span><input value={replayUrl} maxLength={2048} onChange={event => setReplayUrl(event.target.value)} placeholder={t.replayUrl} /></div><button className="primary" disabled={busy || !validReplayDestination(replayUrl)} onClick={() => { void replay(); }}>{busy ? t.replaying : t.replayButton}</button></div>
          {replayResult && <div className="success"><strong>{t.replayResult}: HTTP {replayResult.status} {replayResult.statusText}</strong><code className="standaloneEndpoint">{replayResult.target}</code>{replayResult.location && <p>Location: {replayResult.location}</p>}</div>}
          {message && <div className="error" role="alert">{message}</div>}
        </div>
      </section>}
    </main>
  );
}
