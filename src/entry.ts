import { clerkIdentity } from './auth.js';
import core from './index.js';
import { deleteDeploymentSecret, listDeploymentSecretNames, putDeploymentSecrets } from './secrets.js';
import { stopRuntime } from './runtime.js';
import type { Env, ServerRow } from './types.js';

export { Sandbox } from '@cloudflare/sandbox';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function ownedServer(request: Request, env: Env, id: string): Promise<{ row: ServerRow } | { response: Response }> {
  const identity = await clerkIdentity(request, env);
  if (!identity) return { response: json({ error: 'Authentication required', signInUrl: env.CLERK_SIGN_IN_URL || null }, 401) };
  const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?').bind(id, identity.ownerId).first<ServerRow>();
  if (!row) return { response: json({ error: 'Not found' }, 404) };
  return { row };
}

async function secretRoutes(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/servers\/([a-z0-9][a-z0-9-]{5,40})\/secrets(?:\/([A-Z][A-Z0-9_]{0,63}))?$/);
  if (!match) return null;

  const owned = await ownedServer(request, env, match[1]);
  if ('response' in owned) return owned.response;
  const { row } = owned;
  const name = match[2] ? decodeURIComponent(match[2]) : null;

  try {
    if (request.method === 'GET' && !name) {
      const names = await listDeploymentSecretNames(env, row.id);
      return json({ serverId: row.id, names });
    }

    if (request.method === 'PUT' && !name) {
      const body = await request.json().catch(() => null) as { secrets?: Record<string, string> } | null;
      if (!body?.secrets || typeof body.secrets !== 'object' || Array.isArray(body.secrets)) {
        return json({ error: 'Body must be { secrets: { NAME: "value" } }' }, 400);
      }
      const updated = await putDeploymentSecrets(env, row.id, body.secrets);
      // Existing Linux fallback processes inherit env at process start, so stop them and lazily restart on next request.
      ctx.waitUntil(stopRuntime(env, row).catch(() => undefined));
      const names = await listDeploymentSecretNames(env, row.id);
      return json({ serverId: row.id, updated, names });
    }

    if (request.method === 'DELETE' && name) {
      await deleteDeploymentSecret(env, row.id, name);
      ctx.waitUntil(stopRuntime(env, row).catch(() => undefined));
      const names = await listDeploymentSecretNames(env, row.id);
      return json({ serverId: row.id, deleted: name, names });
    }

    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, PUT, DELETE' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const configuration = message.startsWith('DEPLOYMENT_SECRETS_KEY');
    return json({ error: configuration ? 'Deployment secret encryption is not configured' : message }, configuration ? 503 : 400);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const secretResponse = await secretRoutes(request, env, ctx);
    if (secretResponse) return secretResponse;
    return await core.fetch(request, env, ctx);
  },
};
