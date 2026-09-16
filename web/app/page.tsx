'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';
import { ui } from '@clerk/ui';
import { LanguageSwitcher, useI18n } from './i18n';
import { PICOSVC_PRICING } from './pricing-data';

type Deployment = {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  status: string;
  visibility: 'public' | 'token';
  detected_runtime?: string | null;
  edge_status?: string | null;
  edge_size_bytes?: number | null;
  edge_tool_count?: number | null;
  edge_reason?: string | null;
  error?: string | null;
};

type CreateResult = {
  id: string;
  status: string;
  endpoint: string;
  visibility: 'public' | 'token';
  bearerToken?: string;
  error?: string;
};

type Product = { slug: string; name: string; status: 'active' | 'planned' };

const PRODUCTS: Product[] = [
  { slug: 'mcp', name: 'MCP', status: 'active' }, { slug: 'mock', name: 'Mock', status: 'active' },
  { slug: 'hooks', name: 'Hooks', status: 'active' }, { slug: 'rss', name: 'RSS', status: 'planned' },
  { slug: 'mail', name: 'Mail', status: 'planned' }, { slug: 'shot', name: 'Shot', status: 'planned' },
  { slug: 'fetch', name: 'Fetch', status: 'planned' }, { slug: 'qr', name: 'QR', status: 'planned' },
  { slug: 'cron', name: 'Cron', status: 'planned' }, { slug: 'functions', name: 'Functions', status: 'planned' },
  { slug: 'json', name: 'JSON', status: 'planned' }, { slug: 'files', name: 'Files', status: 'planned' },
  { slug: 'license', name: 'License', status: 'planned' }, { slug: 'flags', name: 'Flags', status: 'planned' },
  { slug: 'monitor', name: 'Monitor', status: 'planned' }, { slug: 'forms', name: 'Forms', status: 'planned' },
];

const PRICING_COPY = {
  en: {
    service: `Pico $${PICOSVC_PRICING.standalone.pico}/mo · PicoPlus $${PICOSVC_PRICING.standalone.picoPlus}/mo`,
    kicker: 'SIMPLE PRICING', title: 'Same price model across every service.',
    body: 'Use products individually or bundle the suite. Larger-than-PicoPlus usage is available by contact.',
    bundlePico: 'Bundle Pico', bundlePicoBody: 'Pico tier across the suite.',
    bundlePro: 'Bundle Pro', bundleProBody: 'PicoPlus tier across the suite.',
    custom: 'Need more? Contact us.', details: 'Full pricing →',
  },
  ja: {
    service: `Pico 月$${PICOSVC_PRICING.standalone.pico} · PicoPlus 月$${PICOSVC_PRICING.standalone.picoPlus}`,
    kicker: '料金', title: '全サービス、同じ料金体系。',
    body: '単品でもBundleでも利用できます。PicoPlusを超える利用量はお問い合わせください。',
    bundlePico: 'Bundle Pico', bundlePicoBody: '全サービスのPico枠をまとめて利用。',
    bundlePro: 'Bundle Pro', bundleProBody: '全サービスのPicoPlus枠をまとめて利用。',
    custom: 'それ以上は要相談。', details: '料金詳細 →',
  },
  'zh-CN': {
    service: `Pico 每月 $${PICOSVC_PRICING.standalone.pico} · PicoPlus 每月 $${PICOSVC_PRICING.standalone.picoPlus}`,
    kicker: '价格', title: '所有服务采用同一套价格。',
    body: '可单独订阅，也可购买 Bundle。超过 PicoPlus 的用量可联系我们定制。',
    bundlePico: 'Bundle Pico', bundlePicoBody: '整套服务获得 Pico 档。',
    bundlePro: 'Bundle Pro', bundleProBody: '整套服务获得 PicoPlus 档。',
    custom: '更高用量请联系。', details: '查看完整价格 →',
  },
} as const;

const API_URL = (process.env.NEXT_PUBLIC_FACTORY_API_URL || '').replace(/\/$/, '');
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

function shortBytes(bytes?: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function runtimeBadge(item: Deployment) {
  if (item.detected_runtime === 'local-bound') return { label: '⌁ Local-bound', className: 'fallbackPill' };
  if (item.detected_runtime === 'edge-node-bridge') return { label: '⚡ Edge + Bridge', className: 'edgePill' };
  if (item.edge_status === 'ready' || item.detected_runtime === 'edge-node') return { label: '⚡ Edge', className: 'edgePill' };
  if (item.detected_runtime?.startsWith('sandbox')) return { label: '▣ Sandbox', className: 'fallbackPill' };
  return { label: '… Detecting', className: 'fallbackPill' };
}

export default function Home() {
  const { locale, messages, localizedHref } = useI18n();
  const t = messages.home;
  const c = messages.common;
  const p = PRICING_COPY[locale];
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [visibility, setVisibility] = useState<'public' | 'token'>('token');
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [creating, setCreating] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreateResult | null>(null);
  const [message, setMessage] = useState('');
  const userButtonRef = useRef<HTMLDivElement>(null);
  const configured = Boolean(API_URL && CLERK_KEY);

  useEffect(() => {
    if (!CLERK_KEY) return;
    let active = true;
    let removeListener: (() => void) | undefined;
    import('@clerk/clerk-js').then(async ({ Clerk }) => {
      const instance = new Clerk(CLERK_KEY);
      await instance.load({ ui });
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      removeListener = instance.addListener(() => setSignedIn(Boolean(instance.isSignedIn)));
    }).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    return () => { active = false; removeListener?.(); };
  }, []);

  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    clerk.mountUserButton(userButtonRef.current);
    return () => { if (userButtonRef.current) clerk.unmountUserButton(userButtonRef.current); };
  }, [clerk, signedIn]);

  async function authHeaders(extra?: HeadersInit) {
    const token = await clerk?.session?.getToken();
    if (!token) throw new Error(c.signIn);
    return { ...Object.fromEntries(new Headers(extra).entries()), Authorization: `Bearer ${token}` };
  }

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    const response = await fetch(`${API_URL}${path}`, { ...init, headers: await authHeaders(init.headers) });
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data as T;
  }

  async function refresh() {
    if (!signedIn) return;
    try { setDeployments(await api<Deployment[]>('/api/servers')); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  useEffect(() => {
    if (!signedIn) { setDeployments([]); return; }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [signedIn, clerk]);

  async function deploy() {
    setCreating(true); setLastCreated(null); setMessage('');
    try {
      const result = await api<CreateResult>('/api/servers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl: repo.trim(), branch: branch.trim() || 'main', visibility }),
      });
      setLastCreated(result); setRepo(''); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setCreating(false); }
  }

  return (
    <main>
      <nav className="nav shell">
        <div className="brand"><span className="brandMark">P</span><span>PicoSvc</span></div>
        <div className="navRight">
          <a href="#products">{c.products}</a><a href={localizedHref('/pricing')}>Pricing</a><a href={localizedHref('/mock')}>{c.mock}</a><a href={localizedHref('/hooks')}>Hooks</a><a href={localizedHref('/contact')}>{c.contact}</a>
          <a href="https://github.com/YAMA-TANA/remote-mcp-factory" target="_blank" rel="noreferrer">{c.github}</a>
          <LanguageSwitcher />
          {signedIn ? <div ref={userButtonRef} className="userButton" /> : <button className="secondary" onClick={() => clerk?.openSignIn()}>{c.signIn}</button>}
        </div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> {t.eyebrow}</div>
        <h1>{t.title1}<br />{t.title2}</h1>
        <p className="lede">{t.lede}</p>
        <div className="flow"><span>{t.flowLogin}</span><i>→</i><span>Pico $1 / PicoPlus $5</span><i>→</i><span>Bundle $5 / $22</span><i>→</i><span>{t.flowEdge}</span><em>{t.flowLive}</em></div>
      </section>

      <section className="shell deploymentsSection" id="products">
        <div className="sectionHead"><div><span className="kicker">{t.suite}</span><h2>{t.pick}</h2></div></div>
        <div className="deploymentGrid">
          {PRODUCTS.map((product) => {
            const copy = messages.products[product.slug];
            const dashboard = product.slug === 'mock' ? localizedHref('/mock') : product.slug === 'hooks' ? localizedHref('/hooks') : null;
            return (
              <article className="deployment" key={product.slug}>
                <div className="deploymentTop"><div><strong>PicoSvc {product.name}</strong><p>{copy.role}</p></div><span className={`status ${product.status === 'active' ? 'ready' : ''}`}>{product.status === 'active' ? t.available : t.planned}</span></div>
                <div className="runtime"><span className={product.status === 'active' ? 'edgePill' : 'fallbackPill'}>{product.status === 'active' ? t.available : t.planned}</span><span>{p.service}</span><span>{t.standalone}</span><span>{t.bundleEligible}</span></div>
                <div className="deploymentBottom"><code>{product.slug}</code>{dashboard ? <a href={dashboard}>{t.openDashboard}</a> : <span>{t.sharedLoginBilling}</span>}</div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="shell deploymentsSection" id="pricing">
        <div className="sectionHead"><div><span className="kicker">{p.kicker}</span><h2>{p.title}</h2></div><a href={localizedHref('/pricing')}>{p.details}</a></div>
        <p className="lede">{p.body}</p>
        <div className="deploymentGrid">
          <article className="deployment"><div className="deploymentTop"><div><strong>Pico</strong><p>{p.service}</p></div><span className="status ready">$1/mo</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>PicoPlus</strong><p>{p.custom}</p></div><span className="status ready">$5/mo</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{p.bundlePico}</strong><p>{p.bundlePicoBody}</p></div><span className="status ready">${PICOSVC_PRICING.bundles.pico}/mo</span></div></article>
          <article className="deployment"><div className="deploymentTop"><div><strong>{p.bundlePro}</strong><p>{p.bundleProBody}</p></div><span className="status ready">${PICOSVC_PRICING.bundles.pro}/mo</span></div></article>
        </div>
      </section>

      <section className="shell deploymentsSection" id="mcp">
        <div className="sectionHead"><div><span className="kicker">{t.availableNow}</span><h2>{t.mcpAvailable}</h2></div></div>
        <p className="lede">{t.mcpDescription}</p>
        <div className="deployCard">
          {!configured && <div className="notice">Set <code>NEXT_PUBLIC_FACTORY_API_URL</code> and <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in Cloudflare Pages build variables.</div>}
          {!signedIn ? (
            <div className="signinState"><div><strong>{t.deployFirst}</strong><p>{t.deployFirstDesc}</p></div><button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>{t.signInPico}</button></div>
          ) : (
            <>
              <label>{t.githubRepo}</label>
              <div className="repoRow"><div className="repoInput"><span>↗</span><input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/owner/mcp-server" /></div><button className="primary" disabled={creating || !repo.trim()} onClick={deploy}>{creating ? t.deploying : t.deployMcp}</button></div>
              <div className="options"><label>{t.branch} <input value={branch} onChange={(e) => setBranch(e.target.value)} /></label><label>{t.access} <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'token')}><option value="token">{c.protected}</option><option value="public">{c.public}</option></select></label></div>
            </>
          )}
          {message && <div className="error">{message}</div>}
          {lastCreated && <div className="success"><div><span>✓</span><strong>{t.deploymentQueued}</strong></div><code>{lastCreated.endpoint}</code>{lastCreated.bearerToken && <p><b>{t.tokenShownOnce}</b> <code>{lastCreated.bearerToken}</code></p>}</div>}
        </div>
      </section>

      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">{t.yourProjects}</span><h2>{t.deployments}</h2></div>{signedIn && <button className="ghost" onClick={() => void refresh()}>{c.refresh}</button>}</div>
        {!signedIn ? <div className="empty">{t.signInToView}</div> : deployments.length === 0 ? <div className="empty">{t.noDeployments}</div> : (
          <div className="deploymentGrid">{deployments.map((item) => { const runtime = runtimeBadge(item); return (
            <article className="deployment" key={item.id}>
              <div className="deploymentTop"><div><strong>{item.name}</strong><p>{item.repo_url.replace('https://github.com/', '')}</p></div><span className={`status ${item.status}`}>{item.status}</span></div>
              <div className="runtime"><span className={runtime.className}>{runtime.label}</span><span>{item.edge_tool_count ? `${item.edge_tool_count} ${t.tools}` : t.toolsPending}</span><span>{item.edge_status === 'ready' ? shortBytes(item.edge_size_bytes) : item.branch}</span></div>
              {item.edge_reason && item.edge_status !== 'ready' && <p className="reason">{item.edge_reason}</p>}{item.error && <p className="reason errorText">{item.error}</p>}
              <div className="deploymentBottom"><code>{item.id}</code><span>{item.visibility === 'token' ? c.protected : c.public}</span></div>
            </article>
          ); })}</div>
        )}
      </section>

      <section className="features shell">
        <article><span>01</span><h3>{t.feature1Title}</h3><p>{t.feature1Body}</p></article>
        <article><span>02</span><h3>{t.feature2Title}</h3><p>{t.feature2Body}</p></article>
        <article><span>03</span><h3>{t.feature3Title}</h3><p>{t.feature3Body}</p></article>
      </section>
    </main>
  );
}
