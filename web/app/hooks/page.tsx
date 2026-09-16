'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from '../i18n';
import { PICOSVC_PRICING, tierLabel, type BillingTierId } from '../pricing-data';

type Inbox = {
  id: string;
  name: string;
  enabled: boolean;
  endpoint: string;
  eventCount: number;
  latestEventAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type HookEvent = {
  id: string;
  inboxId: string;
  method: string;
  path: string;
  query: Array<[string, string]>;
  headers: Record<string, string>;
  contentType: string | null;
  bodyPreview: string;
  bodyBase64?: string;
  sizeBytes: number;
  receivedAt: string;
};

type InboxList = {
  tier: BillingTierId;
  monthlyEventLimit: number | null;
  monthlyEventsUsed: number;
  inboxes: Inbox[];
};

type EventList = { inbox: Inbox; events: HookEvent[]; nextBefore: string | null };
type ReplayResult = { ok: boolean; status: number; statusText: string; location: string | null; target: string };

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

const COPY = {
  en: {
    title1: 'Catch webhooks.', title2: 'Inspect. Replay.', lede: `Create a public webhook inbox, inspect incoming requests, and replay events. Free includes 500 events/month, Pico is $${PICOSVC_PRICING.standalone.pico}/month for 10,000, and PicoPlus is $${PICOSVC_PRICING.standalone.picoPlus}/month for 100,000. Larger usage is available by contact.`,
    signInTitle: 'Sign in to create a webhook inbox', signInBody: 'Your PicoSvc login is shared across products, while Hooks keeps its own plan and usage quota.', signIn: 'Sign in to PicoSvc',
    plan: 'HOOKS PLAN', usage: 'events this month', newInbox: 'New inbox', name: 'Name', create: 'Create inbox', creating: 'Creating…', inboxes: 'Webhook inboxes', noInboxes: 'No webhook inboxes yet.', copyUrl: 'Copy URL', open: 'Open events', pause: 'Pause', resume: 'Resume',
    events: 'Events', noEvents: 'No events received yet.', selectInbox: 'Select an inbox to inspect its events.', received: 'Received', bytes: 'bytes', detail: 'Event detail', headers: 'Headers', query: 'Query', body: 'Body preview', replay: 'Replay event', replayUrl: 'Destination URL', replayButton: 'Replay', replaying: 'Replaying…', replayResult: 'Replay result', deleteEvent: 'Delete event', loadMore: 'Load more',
  },
  ja: {
    title1: 'Webhookを受信。', title2: '確認して、Replay。', lede: `公開Webhook Inboxを作成し、受信requestを確認してReplayできます。Freeは月500 events、Picoは月$${PICOSVC_PRICING.standalone.pico}で10,000 events、PicoPlusは月$${PICOSVC_PRICING.standalone.picoPlus}で100,000 events。それ以上はお問い合わせください。`,
    signInTitle: 'Webhook Inboxを作るにはログイン', signInBody: 'PicoSvcのログインは共通ですが、Hooksのプランと利用量は他製品とは独立です。', signIn: 'PicoSvcにログイン',
    plan: 'HOOKSプラン', usage: '今月のevents', newInbox: '新しいInbox', name: '名前', create: 'Inboxを作成', creating: '作成中…', inboxes: 'Webhook Inboxes', noInboxes: 'Webhook Inboxはまだありません。', copyUrl: 'URLをコピー', open: 'Eventsを見る', pause: '停止', resume: '再開',
    events: 'Events', noEvents: 'まだイベントを受信していません。', selectInbox: 'Inboxを選ぶと受信イベントを確認できます。', received: '受信', bytes: 'bytes', detail: 'Event詳細', headers: 'Headers', query: 'Query', body: 'Body preview', replay: 'EventをReplay', replayUrl: '送信先URL', replayButton: 'Replay', replaying: '送信中…', replayResult: 'Replay結果', deleteEvent: 'Eventを削除', loadMore: 'さらに読み込む',
  },
  'zh-CN': {
    title1: '接收 Webhook。', title2: '查看并 Replay。', lede: `创建公开 Webhook Inbox，查看收到的请求并 Replay。Free 每月 500 events，Pico 每月 $${PICOSVC_PRICING.standalone.pico} 包含 10,000，PicoPlus 每月 $${PICOSVC_PRICING.standalone.picoPlus} 包含 100,000；更高用量请联系我们。`,
    signInTitle: '登录后创建 Webhook Inbox', signInBody: 'PicoSvc 登录账号在产品间共用，但 Hooks 的套餐和使用量独立计算。', signIn: '登录 PicoSvc',
    plan: 'HOOKS 套餐', usage: '本月 events', newInbox: '新 Inbox', name: '名称', create: '创建 Inbox', creating: '创建中…', inboxes: 'Webhook Inboxes', noInboxes: '还没有 Webhook Inbox。', copyUrl: '复制 URL', open: '查看 Events', pause: '暂停', resume: '恢复',
    events: 'Events', noEvents: '尚未收到事件。', selectInbox: '选择一个 Inbox 查看收到的事件。', received: '收到', bytes: 'bytes', detail: 'Event 详情', headers: 'Headers', query: 'Query', body: 'Body preview', replay: 'Replay Event', replayUrl: '目标 URL', replayButton: 'Replay', replaying: '发送中…', replayResult: 'Replay 结果', deleteEvent: '删除 Event', loadMore: '加载更多',
  },
} as const;

function decodeBody(event: HookEvent | null): string {
  if (!event?.bodyBase64) return event?.bodyPreview || '';
  try {
    const binary = atob(event.bodyBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return event.bodyPreview || '';
  }
}

function when(value: string | null): string {
  if (!value) return '—';
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

export default function HooksPage() {
  const { locale, messages, localizedHref } = useI18n();
  const t = COPY[locale]; const c = messages.common;
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<InboxList>({ tier: 'free', monthlyEventLimit: 500, monthlyEventsUsed: 0, inboxes: [] });
  const [name, setName] = useState('Development webhook');
  const [activeInbox, setActiveInbox] = useState<Inbox | null>(null);
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<HookEvent | null>(null);
  const [replayUrl, setReplayUrl] = useState('https://example.com/webhook');
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const userButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true; let removeListener: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY); await instance.load({ ui }); if (!active) return;
      setClerk(instance); setSignedIn(Boolean(instance.isSignedIn));
      removeListener = instance.addListener(() => setSignedIn(Boolean(instance.isSignedIn)));
    }).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    return () => { active = false; removeListener?.(); };
  }, []);

  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    clerk.mountUserButton(userButtonRef.current);
    return () => { if (userButtonRef.current) clerk.unmountUserButton(userButtonRef.current); };
  }, [clerk, signedIn]);

  async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
    if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    const token = await clerk?.session?.getToken(); if (!token) throw new Error(c.signIn);
    const response = await fetch(`${API_URL}${route}`, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload as T;
  }

  async function refresh() {
    if (!signedIn) return;
    try {
      const next = await api<InboxList>('/api/picosvc/hooks/inboxes');
      setData(next); setMessage('');
      if (activeInbox) setActiveInbox(next.inboxes.find((item) => item.id === activeInbox.id) || null);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  useEffect(() => { if (signedIn) void refresh(); }, [signedIn, clerk]);

  async function createInbox() {
    setBusy(true); setMessage('');
    try {
      const created = await api<Inbox>('/api/picosvc/hooks/inboxes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      await refresh(); await openInbox(created); setName('Development webhook');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function openInbox(inbox: Inbox, before?: string, append = false) {
    try {
      const suffix = before ? `?before=${encodeURIComponent(before)}` : '';
      const result = await api<EventList>(`/api/picosvc/hooks/inboxes/${inbox.id}/events${suffix}`);
      setActiveInbox(result.inbox); setEvents((current) => append ? [...current, ...result.events] : result.events); setNextBefore(result.nextBefore);
      if (!append) { setSelectedEvent(null); setReplayResult(null); }
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function toggleInbox(inbox: Inbox) {
    setBusy(true);
    try { await api(`/api/picosvc/hooks/inboxes/${inbox.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !inbox.enabled }) }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function deleteInbox(inbox: Inbox) {
    setBusy(true);
    try {
      await api(`/api/picosvc/hooks/inboxes/${inbox.id}`, { method: 'DELETE' });
      if (activeInbox?.id === inbox.id) { setActiveInbox(null); setEvents([]); setSelectedEvent(null); }
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function inspectEvent(event: HookEvent) {
    try { setSelectedEvent(await api<HookEvent>(`/api/picosvc/hooks/events/${event.id}`)); setReplayResult(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function deleteEvent(event: HookEvent) {
    setBusy(true);
    try {
      await api(`/api/picosvc/hooks/events/${event.id}`, { method: 'DELETE' });
      if (selectedEvent?.id === event.id) setSelectedEvent(null);
      if (activeInbox) await openInbox(activeInbox);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function replay() {
    if (!selectedEvent) return;
    setBusy(true); setReplayResult(null); setMessage('');
    try {
      setReplayResult(await api<ReplayResult>(`/api/picosvc/hooks/events/${selectedEvent.id}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: replayUrl }) }));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a>
        <div className="navRight"><a href={localizedHref('/')}>{c.products}</a><a href={localizedHref('/pricing')}>Pricing</a><a href={localizedHref('/mock')}>{c.mock}</a><a href={localizedHref('/contact')}>{c.contact}</a><LanguageSwitcher />{signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" onClick={() => clerk?.openSignIn()}>{c.signIn}</button>}</div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> PicoSvc Hooks</div><h1>{t.title1}<br />{t.title2}</h1><p className="lede">{t.lede}</p>
        {!signedIn ? <div className="deployCard signinState"><div><strong>{t.signInTitle}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signIn}</button></div> : (
          <div className="deployCard">
            <div className="sectionHead"><div><span className="kicker">{tierLabel(data.tier)} {t.plan}</span><h2>{t.newInbox}</h2></div><span>{data.monthlyEventsUsed} / {data.monthlyEventLimit ?? '∞'} {t.usage}</span></div>
            <div className="repoRow"><div className="repoInput"><span>↗</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.name} /></div><button className="primary" disabled={busy || !name.trim()} onClick={createInbox}>{busy ? t.creating : t.create}</button></div>
            {message && <div className="error">{message}</div>}
          </div>
        )}
      </section>

      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">PICOSVC HOOKS</span><h2>{t.inboxes}</h2></div>{signedIn && <button className="ghost" onClick={() => void refresh()}>{c.refresh}</button>}</div>
        {!signedIn ? <div className="empty">{t.signInTitle}</div> : data.inboxes.length === 0 ? <div className="empty">{t.noInboxes}</div> : (
          <div className="deploymentGrid">{data.inboxes.map((inbox) => <article className="deployment" key={inbox.id}>
            <div className="deploymentTop"><div><strong>{inbox.name}</strong><p>{inbox.eventCount} events · {when(inbox.latestEventAt)}</p></div><span className={`status ${inbox.enabled ? 'ready' : ''}`}>{inbox.enabled ? c.active : c.disabled}</span></div>
            <div className="success"><code style={{ overflowWrap: 'anywhere' }}>{inbox.endpoint}</code></div>
            <div className="deploymentBottom"><button className="ghost" onClick={() => navigator.clipboard.writeText(inbox.endpoint)}>{t.copyUrl}</button><button className="ghost" onClick={() => void openInbox(inbox)}>{t.open}</button><button className="ghost" disabled={busy} onClick={() => void toggleInbox(inbox)}>{inbox.enabled ? t.pause : t.resume}</button><button className="ghost" disabled={busy} onClick={() => void deleteInbox(inbox)}>{c.delete}</button></div>
          </article>)}</div>
        )}
      </section>

      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">{activeInbox?.name || 'INBOX'}</span><h2>{t.events}</h2></div>{activeInbox && <span>{activeInbox.endpoint}</span>}</div>
        {!activeInbox ? <div className="empty">{t.selectInbox}</div> : events.length === 0 ? <div className="empty">{t.noEvents}</div> : <>
          <div className="deploymentGrid">{events.map((event) => <article className="deployment" key={event.id} onClick={() => void inspectEvent(event)} style={{ cursor: 'pointer' }}>
            <div className="deploymentTop"><div><strong>{event.method} {event.path || '/'}</strong><p>{when(event.receivedAt)}</p></div><span className="status ready">{event.sizeBytes} {t.bytes}</span></div>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 120, overflow: 'hidden' }}>{event.bodyPreview || '∅'}</pre>
          </article>)}</div>
          {nextBefore && <div style={{ marginTop: 16 }}><button className="ghost" onClick={() => activeInbox && void openInbox(activeInbox, nextBefore, true)}>{t.loadMore}</button></div>}
        </>}
      </section>

      {selectedEvent && <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">{t.received} {when(selectedEvent.receivedAt)}</span><h2>{t.detail}</h2></div><button className="ghost" disabled={busy} onClick={() => void deleteEvent(selectedEvent)}>{t.deleteEvent}</button></div>
        <div className="deployCard">
          <h3>{selectedEvent.method} {selectedEvent.path || '/'}</h3>
          <p><strong>{t.query}</strong></p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(selectedEvent.query, null, 2)}</pre>
          <p><strong>{t.headers}</strong></p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(selectedEvent.headers, null, 2)}</pre>
          <p><strong>{t.body}</strong></p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto' }}>{decodeBody(selectedEvent) || '∅'}</pre>
          <h3>{t.replay}</h3><div className="repoRow"><div className="repoInput"><span>↗</span><input value={replayUrl} onChange={(event) => setReplayUrl(event.target.value)} placeholder={t.replayUrl} /></div><button className="primary" disabled={busy || !replayUrl.trim()} onClick={replay}>{busy ? t.replaying : t.replayButton}</button></div>
          {replayResult && <div className="success"><strong>{t.replayResult}: HTTP {replayResult.status} {replayResult.statusText}</strong><code>{replayResult.target}</code>{replayResult.location && <p>Location: {replayResult.location}</p>}</div>}
          {message && <div className="error">{message}</div>}
        </div>
      </section>}
    </main>
  );
}
