'use client';

import { useEffect, useRef, useState } from 'react';
import type { Clerk } from '@clerk/clerk-js';

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
      await instance.load();
      if (!active) return;
      setClerk(instance);
      setSignedIn(Boolean(instance.isSignedIn));
      removeListener = instance.addListener(() => setSignedIn(Boolean(instance.isSignedIn)));
    }).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));

    return () => {
      active = false;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    if (!clerk || !signedIn || !userButtonRef.current) return;
    clerk.mountUserButton(userButtonRef.current);
    return () => {
      if (userButtonRef.current) clerk.unmountUserButton(userButtonRef.current);
    };
  }, [clerk, signedIn]);

  async function authHeaders(extra?: HeadersInit) {
    const token = await clerk?.session?.getToken();
    if (!token) throw new Error('Sign in first.');
    return { ...Object.fromEntries(new Headers(extra).entries()), Authorization: `Bearer ${token}` };
  }

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!API_URL) throw new Error('NEXT_PUBLIC_FACTORY_API_URL is not configured.');
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: await authHeaders(init.headers),
    });
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data as T;
  }

  async function refresh() {
    if (!signedIn) return;
    try {
      const data = await api<Deployment[]>('/api/servers');
      setDeployments(data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (!signedIn) {
      setDeployments([]);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [signedIn, clerk]);

  async function deploy() {
    setCreating(true);
    setLastCreated(null);
    setMessage('');
    try {
      const result = await api<CreateResult>('/api/servers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl: repo.trim(), branch: branch.trim() || 'main', visibility }),
      });
      setLastCreated(result);
      setRepo('');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <nav className="nav shell">
        <div className="brand"><span className="brandMark">M</span><span>Remote MCP Factory</span></div>
        <div className="navRight">
          <a href="https://github.com/YAMA-TANA/remote-mcp-factory" target="_blank" rel="noreferrer">GitHub</a>
          {signedIn ? <div ref={userButtonRef} className="userButton" /> : (
            <button className="secondary" onClick={() => clerk?.openSignIn()}>Sign in</button>
          )}
        </div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="dot" /> Edge-first MCP deployment</div>
        <h1>GitHub in.<br />Remote MCP out.</h1>
        <p className="lede">Paste a public MCP repository. We analyze it, compile compatible servers to a Cloudflare Dynamic Worker, bridge narrowly supported native calls, and fall back to Linux only when needed.</p>

        <div className="deployCard">
          {!configured && (
            <div className="notice">Set <code>NEXT_PUBLIC_FACTORY_API_URL</code> and <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in Cloudflare Pages build variables.</div>
          )}
          {!signedIn ? (
            <div className="signinState">
              <div>
                <strong>Deploy your first MCP</strong>
                <p>Sign in to create and manage endpoints.</p>
              </div>
              <button className="primary" disabled={!clerk} onClick={() => clerk?.openSignIn()}>Sign in with Clerk</button>
            </div>
          ) : (
            <>
              <label>GitHub repository</label>
              <div className="repoRow">
                <div className="repoInput"><span>↗</span><input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/owner/mcp-server" /></div>
                <button className="primary" disabled={creating || !repo.trim()} onClick={deploy}>{creating ? 'Deploying…' : 'Deploy'}</button>
              </div>
              <div className="options">
                <label>Branch <input value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
                <label>Access <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'token')}><option value="token">Protected</option><option value="public">Public</option></select></label>
              </div>
            </>
          )}
          {message && <div className="error">{message}</div>}
          {lastCreated && (
            <div className="success">
              <div><span>✓</span><strong>Deployment queued</strong></div>
              <code>{lastCreated.endpoint}</code>
              {lastCreated.bearerToken && <p><b>Bearer token — shown once:</b> <code>{lastCreated.bearerToken}</code></p>}
            </div>
          )}
        </div>

        <div className="flow">
          <span>GitHub repo</span><i>→</i><span>Analyze</span><i>→</i><span>Compile + verify</span><i>→</i><span>Edge</span><em>Bridge or Sandbox when needed</em>
        </div>
      </section>

      <section className="shell deploymentsSection">
        <div className="sectionHead"><div><span className="kicker">YOUR PROJECTS</span><h2>Deployments</h2></div>{signedIn && <button className="ghost" onClick={() => void refresh()}>Refresh</button>}</div>
        {!signedIn ? <div className="empty">Sign in to view deployments.</div> : deployments.length === 0 ? <div className="empty">No deployments yet. Paste a GitHub MCP above.</div> : (
          <div className="deploymentGrid">
            {deployments.map((item) => {
              const runtime = runtimeBadge(item);
              return (
                <article className="deployment" key={item.id}>
                  <div className="deploymentTop"><div><strong>{item.name}</strong><p>{item.repo_url.replace('https://github.com/', '')}</p></div><span className={`status ${item.status}`}>{item.status}</span></div>
                  <div className="runtime"><span className={runtime.className}>{runtime.label}</span><span>{item.edge_tool_count ? `${item.edge_tool_count} tools` : 'tools pending'}</span><span>{item.edge_status === 'ready' ? shortBytes(item.edge_size_bytes) : item.branch}</span></div>
                  {item.edge_reason && item.edge_status !== 'ready' && <p className="reason">{item.edge_reason}</p>}
                  {item.error && <p className="reason errorText">{item.error}</p>}
                  <div className="deploymentBottom"><code>{item.id}</code><span>{item.visibility === 'token' ? 'Protected' : 'Public'}</span></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="features shell">
        <article><span>01</span><h3>Automatic conversion</h3><p>SDK migration, stdio removal, Worker bundling and real protocol verification happen automatically.</p></article>
        <article><span>02</span><h3>Runtime selection</h3><p>Edge by default, a narrow Binary Bridge when verified, Sandbox for heavy workloads, and a clear rejection when the MCP is tied to a local machine.</p></article>
        <article><span>03</span><h3>Protected by default</h3><p>Bearer-protected endpoints, rate limits, usage quotas and encrypted deployment secrets.</p></article>
      </section>

      <footer className="shell"><span>Remote MCP Factory</span><span>Built on Cloudflare</span></footer>
    </main>
  );
}
