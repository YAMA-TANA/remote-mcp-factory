import { clerkIdentity } from './auth.js';
import { githubAppConfigured, listUserInstallations } from './github-app.js';
import { ensureGitHubSchema } from './github-schema.js';
import type { Env } from './types.js';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function configured(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is not configured`);
  return result;
}

function callbackUrl(request: Request, env: Env): string {
  if (env.GITHUB_OAUTH_CALLBACK_URL?.trim()) return env.GITHUB_OAUTH_CALLBACK_URL.trim();
  return new URL('/api/github/callback', request.url).toString();
}

async function exchangeInstallCode(env: Env, request: Request, code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'remote-mcp-factory',
    },
    body: new URLSearchParams({
      client_id: configured(env.GITHUB_APP_CLIENT_ID, 'GITHUB_APP_CLIENT_ID'),
      client_secret: configured(env.GITHUB_APP_CLIENT_SECRET, 'GITHUB_APP_CLIENT_SECRET'),
      code,
      redirect_uri: callbackUrl(request, env),
    }),
  });

  const text = await response.text();
  let payload: { access_token?: string; error?: string; error_description?: string } = {};
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new Error(`GitHub OAuth code exchange returned an invalid response (${response.status})`);
  }
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `GitHub OAuth code exchange failed (${response.status})`);
  }
  return payload.access_token;
}

/**
 * GitHub's "Request user authorization (OAuth) during installation" flow is
 * initiated by GitHub itself after installation. Unlike our explicit PKCE flow,
 * that redirect can legitimately contain code + installation_id + setup_action
 * without the state value we generated in /api/github/connect/start.
 *
 * Never trust installation_id by itself: exchange the one-time code, ask GitHub
 * which installations that user can access, and only link the claimed id if it
 * appears in that authenticated list.
 */
export async function githubInstallCallbackRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/github/callback') return null;
  if (url.searchParams.get('state')) return null; // Explicit PKCE flow stays in github-routes.ts.

  const code = url.searchParams.get('code') || '';
  const installationId = Number(url.searchParams.get('installation_id'));
  const setupAction = url.searchParams.get('setup_action') || '';
  if (!code || !Number.isSafeInteger(installationId) || installationId <= 0 || !['install', 'update'].includes(setupAction)) {
    return null;
  }

  if (!githubAppConfigured(env)) return json({ error: 'GitHub App integration is not configured' }, 503);

  const identity = await clerkIdentity(request, env);
  if (!identity) {
    return json({
      error: 'Authentication required before linking the GitHub installation',
      signInUrl: env.CLERK_SIGN_IN_URL || null,
    }, 401);
  }

  try {
    const userToken = await exchangeInstallCode(env, request, code);
    const installations = await listUserInstallations(userToken);
    const installation = installations.find((candidate) => candidate.id === installationId);
    if (!installation) {
      return json({ error: 'GitHub installation could not be verified for the authorized GitHub user' }, 403);
    }

    await ensureGitHubSchema(env);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO github_installations (owner,installation_id,account_login,account_type,repository_selection,active,linked_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(owner,installation_id) DO UPDATE SET
        account_login=excluded.account_login,
        account_type=excluded.account_type,
        repository_selection=excluded.repository_selection,
        active=excluded.active,
        updated_at=excluded.updated_at
    `).bind(
      identity.ownerId,
      installation.id,
      installation.account.login,
      installation.account.type,
      installation.repository_selection || null,
      installation.suspended_at ? 0 : 1,
      now,
      now,
    ).run();

    const target = new URL('/github', request.url);
    target.searchParams.set('connected', '1');
    target.searchParams.set('installation', String(installation.id));
    target.searchParams.set('setup_action', setupAction);
    return Response.redirect(target.toString(), 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 502);
  }
}
