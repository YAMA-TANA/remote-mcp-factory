import { clerkIdentity } from './auth.js';
import {
  exchangeGitHubUserCode,
  getInstallationRepository,
  githubAppConfigured,
  githubAuthorizeUrl,
  githubInstallUrl,
  listInstallationRepositories,
  listUserInstallations,
  randomUrlToken,
  sha256Url,
  verifyGitHubWebhook,
} from './github-app.js';
import { ensureGitHubSchema } from './github-schema.js';
import {
  deploymentCount,
  incrementUsage,
  readUsage,
  resolvePlan,
  resolvePlanForOwner,
} from './plans.js';
import { buildServer } from './runtime.js';
import { listDeploymentSecretNames, putDeploymentSecrets } from './secrets.js';
import type { AuthIdentity, Env, ServerRow, Visibility } from './types.js';

interface GitHubInstallationRow {
  owner: string;
  installation_id: number;
  account_login: string;
  account_type: string;
  repository_selection: string | null;
  active: number;
  linked_at: string;
  updated_at: string;
}

interface GitHubOauthStateRow {
  state_hash: string;
  owner: string;
  code_verifier: string;
  callback_url: string;
  expires_at: string;
  created_at: string;
}

interface PushPayload {
  ref?: string;
  deleted?: boolean;
  after?: string;
  installation?: { id?: number };
  repository?: { id?: number; full_name?: string };
}

interface InstallationPayload {
  action?: string;
  installation?: {
    id?: number;
    account?: { login?: string; type?: string };
    repository_selection?: string;
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function identity(request: Request, env: Env): Promise<AuthIdentity | Response> {
  const result = await clerkIdentity(request, env);
  if (!result) return json({ error: 'Authentication required', signInUrl: env.CLERK_SIGN_IN_URL || null }, 401);
  return result;
}

function callbackUrl(request: Request, env: Env): string {
  if (env.GITHUB_OAUTH_CALLBACK_URL?.trim()) return env.GITHUB_OAUTH_CALLBACK_URL.trim();
  return new URL('/api/github/callback', request.url).toString();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function endpointFor(request: Request, env: Env, id: string): string {
  const fallback = new URL(request.url).origin;
  if (!env.PUBLIC_MCP_ORIGIN) return `${fallback}/mcp/${id}`;
  try {
    const configured = new URL(env.PUBLIC_MCP_ORIGIN);
    if (configured.protocol !== 'https:' && configured.hostname !== 'localhost') return `${fallback}/mcp/${id}`;
    return `${configured.origin}/mcp/${id}`;
  } catch {
    return `${fallback}/mcp/${id}`;
  }
}

function validVisibility(value: unknown): value is Visibility {
  return value === 'public' || value === 'token';
}

function validBranch(value: string): boolean {
  return /^[A-Za-z0-9._/-]{1,200}$/.test(value) && !value.includes('..');
}

function validSecrets(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function configRoute(request: Request, env: Env): Promise<Response> {
  const auth = await identity(request, env);
  if (auth instanceof Response) return auth;
  return json({
    configured: githubAppConfigured(env),
    installUrl: githubAppConfigured(env) ? githubInstallUrl(env) : null,
    callbackUrl: callbackUrl(request, env),
  });
}

async function connectStartRoute(request: Request, env: Env): Promise<Response> {
  const auth = await identity(request, env);
  if (auth instanceof Response) return auth;
  if (!githubAppConfigured(env)) return json({ error: 'GitHub App integration is not configured' }, 503);
  await ensureGitHubSchema(env);

  const state = randomUrlToken(32);
  const verifier = randomUrlToken(32);
  const stateHash = await sha256Url(state);
  const challenge = await sha256Url(verifier);
  const redirect = callbackUrl(request, env);
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60_000).toISOString();

  await env.DB.batch([
    env.DB.prepare('DELETE FROM github_oauth_states WHERE expires_at < ?').bind(now.toISOString()),
    env.DB.prepare(`INSERT INTO github_oauth_states (state_hash,owner,code_verifier,callback_url,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(stateHash, auth.ownerId, verifier, redirect, expires, now.toISOString()),
  ]);

  return json({
    installUrl: githubInstallUrl(env),
    authorizeUrl: githubAuthorizeUrl(env, redirect, state, challenge),
    expiresAt: expires,
  });
}

async function callbackRoute(request: Request, env: Env): Promise<Response> {
  if (!githubAppConfigured(env)) return json({ error: 'GitHub App integration is not configured' }, 503);
  await ensureGitHubSchema(env);
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  if (!code || !state) return json({ error: 'GitHub OAuth callback is missing code/state' }, 400);

  const stateHash = await sha256Url(state);
  const row = await env.DB.prepare('SELECT * FROM github_oauth_states WHERE state_hash=?')
    .bind(stateHash).first<GitHubOauthStateRow>();
  if (!row || row.expires_at < new Date().toISOString()) {
    if (row) await env.DB.prepare('DELETE FROM github_oauth_states WHERE state_hash=?').bind(stateHash).run();
    return json({ error: 'GitHub OAuth state is invalid or expired' }, 400);
  }

  // Consume the state before making network requests. A failed exchange can be restarted safely.
  await env.DB.prepare('DELETE FROM github_oauth_states WHERE state_hash=?').bind(stateHash).run();

  try {
    const userToken = await exchangeGitHubUserCode(env, code, row.callback_url, row.code_verifier);
    const installations = await listUserInstallations(userToken);
    const now = new Date().toISOString();
    const statements = installations.map((installation) => env.DB.prepare(`
      INSERT INTO github_installations (owner,installation_id,account_login,account_type,repository_selection,active,linked_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(owner,installation_id) DO UPDATE SET
        account_login=excluded.account_login,
        account_type=excluded.account_type,
        repository_selection=excluded.repository_selection,
        active=1,
        updated_at=excluded.updated_at
    `).bind(
      row.owner,
      installation.id,
      installation.account.login,
      installation.account.type,
      installation.repository_selection || null,
      installation.suspended_at ? 0 : 1,
      now,
      now,
    ));
    if (statements.length) await env.DB.batch(statements);
    return Response.redirect(new URL(`/github?connected=1&installations=${installations.length}`, request.url).toString(), 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 502);
  }
}

async function installationsRoute(request: Request, env: Env): Promise<Response> {
  const auth = await identity(request, env);
  if (auth instanceof Response) return auth;
  await ensureGitHubSchema(env);
  const rows = await env.DB.prepare(`
    SELECT installation_id,account_login,account_type,repository_selection,active,linked_at,updated_at
    FROM github_installations WHERE owner=? ORDER BY account_login,installation_id
  `).bind(auth.ownerId).all<Omit<GitHubInstallationRow, 'owner'>>();
  return json(rows.results);
}

async function repositoriesRoute(request: Request, env: Env, installationId: number): Promise<Response> {
  const auth = await identity(request, env);
  if (auth instanceof Response) return auth;
  await ensureGitHubSchema(env);
  const linked = await env.DB.prepare('SELECT * FROM github_installations WHERE owner=? AND installation_id=? AND active=1')
    .bind(auth.ownerId, installationId).first<GitHubInstallationRow>();
  if (!linked) return json({ error: 'GitHub installation is not linked to this account' }, 404);
  try {
    const repositories = await listInstallationRepositories(env, installationId);
    return json(repositories.map((repo) => ({
      id: repo.id,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
    })));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function deployRoute(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const auth = await identity(request, env);
  if (auth instanceof Response) return auth;
  if (!githubAppConfigured(env)) return json({ error: 'GitHub App integration is not configured' }, 503);
  await ensureGitHubSchema(env);

  const body = await request.json().catch(() => null) as {
    installationId?: number;
    repositoryId?: number;
    branch?: string;
    subdir?: string;
    command?: string | null;
    name?: string;
    visibility?: Visibility;
    secrets?: unknown;
    autoDeploy?: boolean;
  } | null;
  if (!body || !Number.isSafeInteger(body.installationId) || !Number.isSafeInteger(body.repositoryId)) {
    return json({ error: 'installationId and repositoryId are required integers' }, 400);
  }
  const installationId = Number(body.installationId);
  const repositoryId = Number(body.repositoryId);
  const linked = await env.DB.prepare('SELECT * FROM github_installations WHERE owner=? AND installation_id=? AND active=1')
    .bind(auth.ownerId, installationId).first<GitHubInstallationRow>();
  if (!linked) return json({ error: 'GitHub installation is not linked to this account' }, 404);

  const visibility = body.visibility ?? 'token';
  if (!validVisibility(visibility)) return json({ error: 'visibility must be public or token' }, 400);
  if (body.secrets !== undefined && !validSecrets(body.secrets)) return json({ error: 'secrets must be a JSON object' }, 400);

  const plan = await resolvePlan(env, auth);
  const usage = await readUsage(env, auth.ownerId);
  const deployments = await deploymentCount(env, auth.ownerId);
  if (deployments >= plan.deployments) return json({ error: 'Deployment limit reached', plan }, 402);
  if (usage.builds >= plan.buildsPerMonth) return json({ error: 'Monthly build limit reached', plan, usage }, 402);

  let repository;
  try {
    repository = await getInstallationRepository(env, installationId, repositoryId);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 403);
  }

  const branch = body.branch || repository.default_branch || 'main';
  if (!validBranch(branch)) return json({ error: 'Invalid branch' }, 400);
  const token = randomUrlToken(32);
  const slug = `mcp-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const displayName = (body.name || repository.full_name.split('/').pop() || slug).slice(0, 80);
  const repoUrl = `https://github.com/${repository.full_name}`;

  await env.DB.prepare(`
    INSERT INTO servers (
      id,owner,owner_org,name,repo_url,branch,subdir,command,token_hash,visibility,enabled,status,created_at,updated_at,
      github_installation_id,github_repo_id,github_repo_full_name,auto_deploy,redeploy_pending
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    slug, auth.ownerId, auth.orgId, displayName, repoUrl, branch, body.subdir || '', body.command || null,
    await sha256Hex(token), visibility, 1, 'queued', now, now,
    installationId, repositoryId, repository.full_name, body.autoDeploy === false ? 0 : 1, 0,
  ).run();

  try {
    if (body.secrets && Object.keys(body.secrets).length) await putDeploymentSecrets(env, slug, body.secrets);
  } catch (error) {
    await env.DB.prepare('DELETE FROM servers WHERE id=? AND owner=?').bind(slug, auth.ownerId).run();
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  await incrementUsage(env, auth.ownerId, 'builds');
  const row = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(slug).first<ServerRow>();
  if (!row) return json({ error: 'Failed to create deployment' }, 500);
  ctx.waitUntil(buildServer(env, row).catch((error) => console.error('GITHUB_DEPLOY_BUILD_FAILED', slug, error)));

  return json({
    id: slug,
    status: 'queued',
    endpoint: endpointFor(request, env, slug),
    visibility,
    repository: repository.full_name,
    private: repository.private,
    branch,
    autoDeploy: body.autoDeploy !== false,
    secretNames: await listDeploymentSecretNames(env, slug),
    ...(visibility === 'token' ? { bearerToken: token } : {}),
    plan: plan.id,
  }, 202);
}

async function markDelivery(env: Env, deliveryId: string, event: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    INSERT INTO github_webhook_deliveries (delivery_id,event,status,received_at) VALUES (?,?,?,?)
    ON CONFLICT(delivery_id) DO NOTHING
  `).bind(deliveryId, event, 'processing', new Date().toISOString()).run();
  return (result.meta?.changes || 0) > 0;
}

async function finishDelivery(env: Env, deliveryId: string): Promise<void> {
  await env.DB.prepare('UPDATE github_webhook_deliveries SET status=?,processed_at=? WHERE delivery_id=?')
    .bind('processed', new Date().toISOString(), deliveryId).run();
}

async function installationWebhook(env: Env, payload: InstallationPayload): Promise<void> {
  const installationId = Number(payload.installation?.id);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return;
  const action = payload.action || '';
  const active = action === 'deleted' || action === 'suspend' ? 0 : action === 'unsuspend' ? 1 : null;
  const accountLogin = payload.installation?.account?.login;
  const accountType = payload.installation?.account?.type;
  const selection = payload.installation?.repository_selection;
  if (active === null && !accountLogin && !selection) return;
  await env.DB.prepare(`
    UPDATE github_installations
    SET active=COALESCE(?,active),account_login=COALESCE(?,account_login),account_type=COALESCE(?,account_type),repository_selection=COALESCE(?,repository_selection),updated_at=?
    WHERE installation_id=?
  `).bind(active, accountLogin || null, accountType || null, selection || null, new Date().toISOString(), installationId).run();
}

async function queuePushRedeploys(env: Env, payload: PushPayload, ctx: ExecutionContext): Promise<{ queued: string[]; coalesced: string[]; skippedQuota: string[] }> {
  const installationId = Number(payload.installation?.id);
  const repositoryId = Number(payload.repository?.id);
  const ref = payload.ref || '';
  if (!Number.isSafeInteger(installationId) || !Number.isSafeInteger(repositoryId) || payload.deleted || !ref.startsWith('refs/heads/')) {
    return { queued: [], coalesced: [], skippedQuota: [] };
  }
  const branch = ref.slice('refs/heads/'.length);
  const result = await env.DB.prepare(`
    SELECT * FROM servers
    WHERE github_installation_id=? AND github_repo_id=? AND branch=? AND auto_deploy=1 AND enabled=1
  `).bind(installationId, repositoryId, branch).all<ServerRow>();

  const queued: string[] = [];
  const coalesced: string[] = [];
  const skippedQuota: string[] = [];
  const promises: Promise<void>[] = [];

  for (const row of result.results) {
    const plan = await resolvePlanForOwner(env, row.owner, row.owner_org);
    const usage = await readUsage(env, row.owner);
    if (usage.builds >= plan.buildsPerMonth) {
      skippedQuota.push(row.id);
      continue;
    }

    if (row.status === 'building' || row.status === 'queued') {
      const claimed = await env.DB.prepare(`
        UPDATE servers SET redeploy_pending=1,updated_at=? WHERE id=? AND redeploy_pending=0
      `).bind(new Date().toISOString(), row.id).run();
      if ((claimed.meta?.changes || 0) > 0) {
        await incrementUsage(env, row.owner, 'builds');
        coalesced.push(row.id);
      }
      continue;
    }

    await incrementUsage(env, row.owner, 'builds');
    await env.DB.prepare('UPDATE servers SET status=?,error=NULL,updated_at=? WHERE id=?')
      .bind('queued', new Date().toISOString(), row.id).run();
    const fresh = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(row.id).first<ServerRow>() ?? row;
    queued.push(row.id);
    promises.push(buildServer(env, fresh).catch((error) => {
      console.error('GITHUB_PUSH_REDEPLOY_FAILED', row.id, error instanceof Error ? error.stack || error.message : String(error));
    }));
  }

  if (promises.length) ctx.waitUntil(Promise.all(promises).then(() => undefined));
  return { queued, coalesced, skippedQuota };
}

async function webhookRoute(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!githubAppConfigured(env)) return json({ error: 'GitHub App integration is not configured' }, 503);
  const bytes = new Uint8Array(await request.arrayBuffer());
  let verified = false;
  try {
    verified = await verifyGitHubWebhook(env, bytes, request.headers.get('x-hub-signature-256'));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 503);
  }
  if (!verified) return json({ error: 'Invalid GitHub webhook signature' }, 401);

  await ensureGitHubSchema(env);
  const event = request.headers.get('x-github-event') || 'unknown';
  const deliveryId = request.headers.get('x-github-delivery') || '';
  if (!deliveryId || deliveryId.length > 200) return json({ error: 'Missing GitHub delivery id' }, 400);
  if (!(await markDelivery(env, deliveryId, event))) return json({ ok: true, duplicate: true, deliveryId });

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ error: 'Invalid webhook JSON' }, 400);
  }

  let result: unknown = { ignored: true };
  if (event === 'push') result = await queuePushRedeploys(env, payload as PushPayload, ctx);
  else if (event === 'installation') {
    await installationWebhook(env, payload as InstallationPayload);
    result = { installationUpdated: true };
  } else if (event === 'installation_repositories') {
    const installationId = Number(payload?.installation?.id);
    if (Number.isSafeInteger(installationId)) {
      await env.DB.prepare('UPDATE github_installations SET updated_at=? WHERE installation_id=?')
        .bind(new Date().toISOString(), installationId).run();
    }
    result = { repositoriesUpdated: true };
  } else if (event === 'ping') result = { pong: true };

  await finishDelivery(env, deliveryId);
  return json({ ok: true, event, deliveryId, result });
}

function githubPage(): Response {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GitHub · Remote MCP Factory</title><style>body{font:16px system-ui;max-width:980px;margin:45px auto;padding:0 20px;background:#0b0d10;color:#e8eaed}button,a{font:inherit;padding:9px 12px;margin:4px;border-radius:8px;border:1px solid #39404b;background:#15181d;color:#cfe5ff;text-decoration:none;cursor:pointer}.card{border:1px solid #292d34;border-radius:12px;padding:18px;margin:16px 0}.repo{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid #252a31;padding:8px 0}pre{white-space:pre-wrap;word-break:break-word}.muted{color:#aab0b8}</style></head><body><h1>GitHub App</h1><p class="muted">Install the Factory GitHub App, then authorize your GitHub user. The OAuth token is used once to prove which installations you can access and is not stored.</p><div class="card"><a id="install" target="_blank">1. Install GitHub App</a><button id="connect">2. Connect installed repositories</button><button id="refresh">Refresh</button></div><div id="accounts"></div><pre id="out"></pre><script>
const out=document.getElementById('out'),accounts=document.getElementById('accounts');
async function j(r){const x=await r.json().catch(()=>({error:'Invalid response'}));if(!r.ok)throw new Error(x.error||('HTTP '+r.status));return x}
async function config(){try{const c=await j(await fetch('/api/github/config'));if(c.installUrl)install.href=c.installUrl;else install.style.display='none'}catch(e){out.textContent=e.message}}
connect.onclick=async()=>{try{const x=await j(await fetch('/api/github/connect/start',{method:'POST'}));location.href=x.authorizeUrl}catch(e){out.textContent=e.message}};
refresh.onclick=load;
async function load(){accounts.textContent='';try{const installs=await j(await fetch('/api/github/installations'));for(const i of installs){const card=document.createElement('div');card.className='card';const h=document.createElement('h3');h.textContent=i.account_login+' · installation '+i.installation_id+(i.active?'':' (inactive)');card.appendChild(h);if(i.active){const repos=await j(await fetch('/api/github/installations/'+i.installation_id+'/repositories'));for(const r of repos){const row=document.createElement('div');row.className='repo';const label=document.createElement('span');label.textContent=r.fullName+(r.private?' 🔒':'');const b=document.createElement('button');b.textContent='Deploy';b.onclick=()=>deploy(i.installation_id,r);row.append(label,b);card.appendChild(row)}}accounts.appendChild(card)}}catch(e){out.textContent=e.message}}
async function deploy(installationId,repo){let secrets;const raw=prompt('Optional environment secrets as JSON (leave blank for none)','');if(raw){try{secrets=JSON.parse(raw)}catch{out.textContent='Invalid secrets JSON';return}}try{out.textContent='Deploying '+repo.fullName+'…';const x=await j(await fetch('/api/github/deploy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({installationId,repositoryId:repo.id,branch:repo.defaultBranch,visibility:'token',autoDeploy:true,secrets})}));out.textContent=JSON.stringify(x,null,2)}catch(e){out.textContent=e.message}}
config();load();</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function githubRoutes(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/github' && request.method === 'GET') return githubPage();
  if (url.pathname === '/api/github/config' && request.method === 'GET') return configRoute(request, env);
  if (url.pathname === '/api/github/connect/start' && request.method === 'POST') return connectStartRoute(request, env);
  if (url.pathname === '/api/github/callback' && request.method === 'GET') return callbackRoute(request, env);
  if (url.pathname === '/api/github/installations' && request.method === 'GET') return installationsRoute(request, env);
  if (url.pathname === '/api/github/deploy' && request.method === 'POST') return deployRoute(request, env, ctx);
  if (url.pathname === '/api/github/webhook' && request.method === 'POST') return webhookRoute(request, env, ctx);

  const repoMatch = url.pathname.match(/^\/api\/github\/installations\/(\d+)\/repositories$/);
  if (repoMatch && request.method === 'GET') return repositoriesRoute(request, env, Number(repoMatch[1]));
  return null;
}
