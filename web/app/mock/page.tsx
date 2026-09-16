'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from '../i18n';
import { PICOSVC_PRICING, tierLabel, type BillingTierId } from '../pricing-data';

type MockEndpoint = { id: string; name: string; method: string; path: string; statusCode: number; contentType: string; headers: Record<string, string>; body: string; enabled: boolean; endpoint: string; createdAt: string; updatedAt: string };
type EndpointList = { tier: BillingTierId; limit: number | null; endpoints: MockEndpoint[] };

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

const PLAN_COPY = {
  en: `Create a stable public endpoint with the HTTP method, status and response body you need. Free includes 1 endpoint, Pico is $${PICOSVC_PRICING.standalone.pico}/month for 10 endpoints, and PicoPlus is $${PICOSVC_PRICING.standalone.picoPlus}/month for 100. Larger usage is available by contact.`,
  ja: `必要なHTTPメソッド、ステータス、レスポンス本文を持つ安定した公開エンドポイントを作成できます。Freeは1 endpoint、Picoは月$${PICOSVC_PRICING.standalone.pico}で10 endpoints、PicoPlusは月$${PICOSVC_PRICING.standalone.picoPlus}で100 endpoints。それ以上はお問い合わせください。`,
  'zh-CN': `创建稳定的公开 Mock API endpoint。Free 包含 1 个 endpoint，Pico 每月 $${PICOSVC_PRICING.standalone.pico} 包含 10 个，PicoPlus 每月 $${PICOSVC_PRICING.standalone.picoPlus} 包含 100 个；更高用量请联系我们。`,
} as const;

export default function MockPage() {
  const { locale, messages, localizedHref } = useI18n(); const t = messages.mock; const c = messages.common;
  const [clerk, setClerk] = useState<Clerk | null>(null); const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<EndpointList>({ tier: 'free', limit: 1, endpoints: [] });
  const [name, setName] = useState('Hello API'); const [method, setMethod] = useState('GET'); const [path, setPath] = useState('hello'); const [statusCode, setStatusCode] = useState('200'); const [body, setBody] = useState('{\n  "hello": "world"\n}');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const userButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!CLERK_KEY) return; let active = true; let removeListener: (() => void) | undefined; import('@clerk/clerk-js').then(async ({ Clerk }) => { const instance = new Clerk(CLERK_KEY); await instance.load({ ui }); if (!active) return; setClerk(instance); setSignedIn(Boolean(instance.isSignedIn)); removeListener = instance.addListener(() => setSignedIn(Boolean(instance.isSignedIn))); }).catch((error) => setMessage(error instanceof Error ? error.message : String(error))); return () => { active = false; removeListener?.(); }; }, []);
  useEffect(() => { if (!clerk || !signedIn || !userButtonRef.current) return; clerk.mountUserButton(userButtonRef.current); return () => { if (userButtonRef.current) clerk.unmountUserButton(userButtonRef.current); }; }, [clerk, signedIn]);

  async function api<T>(route: string, init: RequestInit = {}): Promise<T> { if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.'); const token = await clerk?.session?.getToken(); if (!token) throw new Error(c.signIn); const response = await fetch(`${API_URL}${route}`, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Authorization: `Bearer ${token}` } }); const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })); if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`); return payload as T; }
  async function refresh() { if (!signedIn) return; try { setData(await api<EndpointList>('/api/picosvc/mock/endpoints')); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } }
  useEffect(() => { void refresh(); }, [signedIn, clerk]);
  async function createEndpoint() { setBusy(true); setMessage(''); try { await api('/api/picosvc/mock/endpoints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, method, path, statusCode: Number(statusCode), body }) }); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }
  async function removeEndpoint(id: string) { setBusy(true); try { await api(`/api/picosvc/mock/endpoints/${id}`, { method: 'DELETE' }); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }

  return (
    <main>
      <nav className="nav shell"><a className="brand" href={localizedHref('/')}><span className="brandMark">P</span><span>PicoSvc</span></a><div className="navRight"><a href={localizedHref('/')}>{c.products}</a><a href={localizedHref('/pricing')}>Pricing</a><a href={localizedHref('/contact')}>{c.contact}</a><a href={localizedHref('/terms')}>{c.terms}</a><a href={localizedHref('/privacy')}>{c.privacy}</a><LanguageSwitcher />{signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" onClick={() => clerk?.openSignIn()}>{c.signIn}</button>}</div></nav>
      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> PicoSvc Mock</div><h1>{t.title1}<br />{t.title2}</h1><p className="lede">{PLAN_COPY[locale]}</p>
        {!signedIn ? <div className="deployCard signinState"><div><strong>{t.signInTitle}</strong><p>{t.signInBody}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signInPico}</button></div> : (
          <div className="deployCard"><div className="sectionHead"><div><span className="kicker">{tierLabel(data.tier)} {t.plan}</span><h2>{t.newEndpoint}</h2></div><span>{data.endpoints.length} / {data.limit ?? '∞'}</span></div>
            <div className="options"><label>{t.name} <input value={name} onChange={(event) => setName(event.target.value)} /></label><label>{t.method} <select value={method} onChange={(event) => setMethod(event.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label><label>{t.path} <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="hello" /></label><label>{t.status} <input value={statusCode} onChange={(event) => setStatusCode(event.target.value)} inputMode="numeric" /></label></div>
            <label>{t.responseBody}</label><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} style={{ width: '100%', marginTop: 8, padding: 14, borderRadius: 10, fontFamily: 'monospace' }} /><div style={{ marginTop: 14 }}><button className="primary" disabled={busy || !name.trim()} onClick={createEndpoint}>{busy ? t.saving : t.createEndpoint}</button></div>{message && <div className="error">{message}</div>}
          </div>
        )}
      </section>
      <section className="shell deploymentsSection"><div className="sectionHead"><div><span className="kicker">{t.yourMocks}</span><h2>{t.endpoints}</h2></div>{signedIn && <button className="ghost" onClick={() => void refresh()}>{c.refresh}</button>}</div>
        {!signedIn ? <div className="empty">{t.signInToView}</div> : data.endpoints.length === 0 ? <div className="empty">{t.noEndpoints}</div> : <div className="deploymentGrid">{data.endpoints.map((endpoint) => <article className="deployment" key={endpoint.id}><div className="deploymentTop"><div><strong>{endpoint.name}</strong><p>{endpoint.method} · {endpoint.statusCode}</p></div><span className={`status ${endpoint.enabled ? 'ready' : ''}`}>{endpoint.enabled ? c.active : c.disabled}</span></div><div className="success"><code style={{ overflowWrap: 'anywhere' }}>{endpoint.endpoint}</code></div><div className="deploymentBottom"><button className="ghost" disabled={busy} onClick={() => navigator.clipboard.writeText(endpoint.endpoint)}>{t.copyUrl}</button><button className="ghost" disabled={busy} onClick={() => void removeEndpoint(endpoint.id)}>{c.delete}</button></div></article>)}</div>}
      </section>
    </main>
  );
}
