import { proxyToSandbox } from '@cloudflare/sandbox';
import { Hono } from 'hono';
import { clerkConfigured, clerkIdentity } from './auth.js';
import { serveEdgeRequest } from './edge-runtime.js';
import {
  PLANS,
  deploymentCount,
  incrementUsage,
  readUsage,
  resolvePlan,
  resolvePlanForOwner,
} from './plans.js';
import { buildServer, ensureRuntime } from './runtime.js';
import type { AuthIdentity, Env, ServerRow, Visibility } from './types.js';

export { Sandbox } from '@cloudflare/sandbox';

const app = new Hono<{ Bindings: Env }>();
const VISIBILITIES = new Set<Visibility>(['public', 'token']);

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function validId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{5,40}$/.test(id);
}

function endpointFor(env: Env, requestUrl: string, id: string): string {
  const fallback = new URL(requestUrl).origin;
  if (!env.PUBLIC_MCP_ORIGIN) return `${fallback}/mcp/${id}`;
  try {
    const url = new URL(env.PUBLIC_MCP_ORIGIN);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return `${fallback}/mcp/${id}`;
    return `${url.origin}/mcp/${id}`;
  } catch {
    return `${fallback}/mcp/${id}`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

async function requireIdentity(c: any): Promise<AuthIdentity | Response> {
  const identity = await clerkIdentity(c.req.raw, c.env);
  if (!identity) {
    return c.json({
      error: 'Authentication required',
      signInUrl: c.env.CLERK_SIGN_IN_URL || null,
    }, 401);
  }
  return identity;
}

async function limitRequest(env: Env, row: ServerRow, identity: string): Promise<boolean> {
  const global = await env.MCP_SERVER_RATE_LIMITER.limit({ key: `server:${row.id}` });
  if (!global.success) return false;
  const client = await env.MCP_CLIENT_RATE_LIMITER.limit({ key: `client:${row.id}:${identity}` });
  return client.success;
}

app.get('/healthz', (c) => c.json({
  ok: true,
  service: 'remote-mcp-factory',
  auth: clerkConfigured(c.env) ? 'clerk' : 'unconfigured',
  edgeRuntime: c.env.LOADER ? 'dynamic-workers' : 'unconfigured',
}));

app.get('/api/plans', (c) => c.json(Object.values(PLANS)));

app.get('/', (c) => {
  const signIn = escapeHtml(c.env.CLERK_SIGN_IN_URL || '/dashboard');
  const pricing = escapeHtml(c.env.CLERK_PRICING_URL || '/#pricing');
  return c.html(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Remote MCP Factory</title>
<style>body{font:16px system-ui;max-width:980px;margin:56px auto;padding:0 20px;background:#0b0d10;color:#e8eaed}a{color:#9ecbff}.card{border:1px solid #292d34;border-radius:14px;padding:22px;margin:20px 0;background:#11141a}code{background:#171b22;padding:2px 6px;border-radius:6px}h1{font-size:46px;letter-spacing:-1.5px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.price{font-size:26px;font-weight:700}.muted{color:#aab0b8}.cta{display:inline-block;padding:10px 14px;border:1px solid #45505f;border-radius:10px;text-decoration:none;margin-right:8px}</style></head>
<body><h1>GitHub → Remote MCP.</h1><p>Paste a stdio MCP repository. We compile compatible Node MCPs to Cloudflare Dynamic Workers and fall back to an isolated Linux Sandbox only when the MCP really needs one.</p>
<p><a class="cta" href="${signIn}">Sign in / Dashboard</a><a class="cta" href="${pricing}">Pricing</a></p>
<div class="grid"><div class="card"><b>Edge-first</b><p class="muted">SDK migration, stdio→Web adaptation, Worker bundling, then a real MCP initialize/tools-list smoke test.</p></div><div class="card"><b>Heavy fallback</b><p class="muted">Native binaries, subprocesses and other incompatible MCPs automatically stay on Sandbox.</p></div><div class="card"><b>Protected</b><p class="muted">A generated bearer token is required. Rotate it whenever you want.</p></div></div>
<h2 id="pricing">Current plans</h2><div class="grid">
<div class="card"><b>Hobby</b><div class="price">$0</div><p>1 deployment · 5k MCP requests/month · 20 builds/month</p></div>
<div class="card"><b>Pro</b><div class="price">$20/mo</div><p>10 deployments · 250k requests/month · 200 builds/month</p></div>
<div class="card"><b>Team</b><div class="price">$20/seat/mo</div><p>50 deployments · 1M requests/month · 1,000 builds/month · Clerk Organizations</p></div>
</div><p class="muted">Edge-specific $1 pricing is not enabled yet; compatibility and runtime accounting are being proven first.</p>
</body></html>`);
});

app.get('/dashboard', (c) => c.html(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Remote MCP Factory Dashboard</title>
<style>body{font:16px system-ui;max-width:980px;margin:45px auto;padding:0 20px;background:#0b0d10;color:#e8eaed}input,select,button{font:inherit;padding:10px;margin:5px 0;border-radius:8px;border:1px solid #333;background:#15181d;color:#fff}input{width:100%;box-sizing:border-box}select{width:100%}button{cursor:pointer}.card{border:1px solid #292d34;border-radius:12px;padding:18px;margin:16px 0}code{word-break:break-all}pre{white-space:pre-wrap}</style></head>
<body><h1>Remote MCP Factory</h1><p>Deploys are analyzed automatically. If the Edge compiler passes a real MCP smoke test, requests run in a Dynamic Worker; otherwise they use the Linux fallback.</p>
<div class="card"><input id="repo" placeholder="https://github.com/owner/mcp-repo"><input id="branch" placeholder="branch (default: main)"><input id="command" placeholder="optional stdio start command override"><select id="visibility"><option value="public">Public — anyone can connect</option><option value="token" selected>Protected — bearer token required</option></select><button onclick="add()">Deploy MCP</button><pre id="out"></pre></div>
<div class="card"><button onclick="account()">Refresh account & usage</button><pre id="acct"></pre></div>
<div class="card"><button onclick="load()">Refresh deployments</button><pre id="list"></pre></div>
<script>
async function json(r){const j=await r.json().catch(()=>({error:'Invalid response'}));if(r.status===401&&j.signInUrl)j.hint='Sign in at '+j.signInUrl;return j}
async function add(){out.textContent='creating…';const r=await fetch('/api/servers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({repoUrl:repo.value,branch:branch.value||'main',command:command.value||null,visibility:visibility.value})});out.textContent=JSON.stringify(await json(r),null,2);load();account()}
async function load(){const r=await fetch('/api/servers');list.textContent=JSON.stringify(await json(r),null,2)}
async function account(){const r=await fetch('/api/account');acct.textContent=JSON.stringify(await json(r),null,2)}
load();account();
</script></body></html>`));

app.get('/api/account', async (c) => {
  const identity = await requireIdentity(c);
  if (identity instanceof Response) return identity;
  const plan = await resolvePlan(c.env, identity);
  const usage = await readUsage(c.env, identity.ownerId);
  const deployments = await deploymentCount(c.env, identity.ownerId);
  return c.json({ userId: identity.userId, orgId: identity.orgId, ownerId: identity.ownerId, plan, usage: { ...usage, deployments } });
});

app.get('/api/servers', async (c) => {
  const identity = await requireIdentity(c);
  if (identity instanceof Response) return identity;
  const result = await c.env.DB.prepare(`
    SELECT s.id,s.name,s.repo_url,s.branch,s.subdir,s.status,s.visibility,s.enabled,s.detected_runtime,s.detected_command,s.error,s.created_at,s.updated_at,
           e.status AS edge_status,e.size_bytes AS edge_size_bytes,e.tool_count AS edge_tool_count,e.reason AS edge_reason,e.compiler_version AS edge_compiler_version
    FROM servers s LEFT JOIN edge_builds e ON e.server_id=s.id
    WHERE s.owner=? ORDER BY s.created_at DESC
  `).bind(identity.ownerId).all();
  return c.json(result.results);
});

app.post('/api/servers', async (c) => {
  const identity = await requireIdentity(c);
  if (identity instanceof Response) return identity;
  const plan = await resolvePlan(c.env, identity);
  const usage = await readUsage(c.env, identity.ownerId);
  const deployments = await deploymentCount(c.env, identity.ownerId);
  if (deployments >= plan.deployments) return c.json({ error: 'Deployment limit reached', plan }, 402);
  if (usage.builds >= plan.buildsPerMonth) return c.json({ error: 'Monthly build limit reached', plan, usage }, 402);

  const body = await c.req.json<{ repoUrl: string; branch?: string; subdir?: string; command?: string | null; name?: string; visibility?: Visibility }>();
  const visibility = body.visibility ?? 'token';
  if (!VISIBILITIES.has(visibility)) return c.json({ error: 'visibility must be public or token' }, 400);

  const token = randomToken();
  const slug = `mcp-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const name = (body.name || body.repoUrl.split('/').filter(Boolean).pop() || slug).replace(/\.git$/, '').slice(0, 80);

  await c.env.DB.prepare(`INSERT INTO servers (id,owner,owner_org,name,repo_url,branch,subdir,command,token_hash,visibility,enabled,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(slug, identity.ownerId, identity.orgId, name, body.repoUrl, body.branch || 'main', body.subdir || '', body.command || null, await sha256(token), visibility, 1, 'queued', now, now).run();
  await incrementUsage(c.env, identity.ownerId, 'builds');

  const row = await c.env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(slug).first<ServerRow>();
  if (!row) return c.json({ error: 'Failed to create server' }, 500);
  c.executionCtx.waitUntil(buildServer(c.env, row).catch(() => undefined));

  return c.json({ id: slug, status: 'queued', visibility, endpoint: endpointFor(c.env, c.req.url, slug), ...(visibility === 'token' ? { bearerToken: token } : {}), plan: plan.id }, 202);
});

app.patch('/api/servers/:id', async (c) => {
  const identity = await requireIdentity(c);
  if (identity instanceof Response) return identity;
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?').bind(id, identity.ownerId).first<ServerRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<{ visibility?: Visibility; enabled?: boolean }>();
  const visibility = body.visibility ?? row.visibility;
  if (!VISIBILITIES.has(visibility)) return c.json({ error: 'visibility must be public or token' }, 400);
  const enabled = body.enabled === undefined ? row.enabled : body.enabled ? 1 : 0;
  await c.env.DB.prepare('UPDATE servers SET visibility=?, enabled=?, updated_at=? WHERE id=? AND owner=?')
    .bind(visibility, enabled, new Date().toISOString(), id, identity.ownerId).run();
  return c.json({ id, visibility, enabled: Boolean(enabled), endpoint: endpointFor(c.env, c.req.url, id) });
});

app.post('/api/servers/:id/token/rotate', async (c) => {
  const identity = await requireIdentity(c);
  if (identity instanceof Response) return identity;
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?').bind(id, identity.ownerId).first<ServerRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const token = randomToken();
  await c.env.DB.prepare('UPDATE servers SET token_hash=?, updated_at=? WHERE id=? AND owner=?')
    .bind(await sha256(token), new Date().toISOString(), id, identity.ownerId).run();
  return c.json({ id, bearerToken: token });
});

app.post('/api/servers/:id/rebuild', async (c) => {
  const identity = await requireIdentity(c);
  if (identity instanceof Response) return identity;
  const plan = await resolvePlan(c.env, identity);
  const usage = await readUsage(c.env, identity.ownerId);
  if (usage.builds >= plan.buildsPerMonth) return c.json({ error: 'Monthly build limit reached', plan, usage }, 402);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?').bind(id, identity.ownerId).first<ServerRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  await incrementUsage(c.env, identity.ownerId, 'builds');
  c.executionCtx.waitUntil(buildServer(c.env, row).catch(() => undefined));
  return c.json({ ok: true, status: 'building' }, 202);
});

app.all('/mcp/:id', async (c) => {
  const id = c.req.param('id');
  if (!validId(id)) return c.text('Not found', 404);
  const row = await c.env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(id).first<ServerRow>();
  if (!row || !row.enabled) return c.text('Not found', 404);

  let clientIdentity = c.req.header('cf-connecting-ip') || 'anonymous';
  if (row.visibility === 'token') {
    const auth = c.req.header('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const tokenHash = token ? await sha256(token) : '';
    if (!token || tokenHash !== row.token_hash) return c.text('Unauthorized', 401, { 'WWW-Authenticate': 'Bearer' });
    clientIdentity = `token:${tokenHash.slice(0, 24)}`;
  }

  if (!(await limitRequest(c.env, row, clientIdentity))) return c.text('Too Many Requests', 429, { 'Retry-After': '60' });

  const plan = await resolvePlanForOwner(c.env, row.owner, row.owner_org);
  const usage = await readUsage(c.env, row.owner);
  if (usage.requests >= plan.requestsPerMonth) return c.text('Monthly MCP request quota exceeded', 429, { 'Retry-After': '3600' });
  await incrementUsage(c.env, row.owner, 'requests');

  if (row.status === 'error') return c.text('Deployment unavailable', 503);
  if (row.status === 'queued' || row.status === 'building') return c.text('Deployment is still building', 503, { 'Retry-After': '3' });

  // Fast path: compiled MCP bundle in a Dynamic Worker. Clone the request so a loader failure can safely fall back to Linux.
  try {
    const edgeResponse = await serveEdgeRequest(c.env, row, c.req.raw.clone());
    if (edgeResponse) return edgeResponse;
  } catch (error) {
    console.error('EDGE_RUNTIME_FALLBACK', row.id, error instanceof Error ? error.stack || error.message : String(error));
  }

  // Heavy/native path, or emergency fallback if a previously valid Edge bundle stops loading.
  const tunnelBase = await ensureRuntime(c.env, row);
  const target = `${tunnelBase}/mcp`;
  const headers = new Headers(c.req.raw.headers);
  headers.delete('host');
  headers.delete('authorization');
  const init: RequestInit = { method: c.req.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(c.req.method)) init.body = c.req.raw.body;
  return fetch(target, init);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const proxied = await proxyToSandbox(request, env);
    if (proxied) return proxied;
    return app.fetch(request, env, ctx);
  },
};
