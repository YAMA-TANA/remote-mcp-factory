import type { Env } from '../types.js';
import { cleanName, consumeUsage, json, requireIdentity, resourceCapacity } from './service-utils.js';
import { randomPublicId } from './security.js';

const MAX_CODE_BYTES = 64 * 1024;

function publicFunctionUrl(origin: string, publicId: string): string {
  return `${origin}/fn/${publicId}`;
}

function validCode(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (new TextEncoder().encode(value).byteLength > MAX_CODE_BYTES) return null;
  return value;
}

export async function functionManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/functions')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  if (url.pathname === '/api/picosvc/functions/apps') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id,public_id,name,enabled,created_at,updated_at FROM function_apps WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      const capacity = await resourceCapacity(env, owner, 'functions', 'functions', 'function_apps');
      return json({ tier: capacity.tier, limit: capacity.limit, apps: (rows.results || []).map((row: any) => ({ ...row, endpoint: publicFunctionUrl(url.origin, row.public_id) })) });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'functions', 'functions', 'function_apps');
      if (!capacity.ok) return json({ error: 'Function limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const code = validCode(body?.code);
      if (!code) return json({ error: 'code is required and limited to 64 KiB' }, 400);
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO function_apps (id,owner,public_id,name,code,enabled,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)')
        .bind(id, owner, publicId, cleanName(body?.name, 'Tiny Function'), code, now, now).run();
      return json({ id, publicId, name: cleanName(body?.name, 'Tiny Function'), endpoint: publicFunctionUrl(url.origin, publicId), tier: capacity.tier }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const match = url.pathname.match(/^\/api\/picosvc\/functions\/apps\/([0-9a-f-]{36})$/i);
  if (!match) return null;
  const app = await env.DB.prepare('SELECT * FROM function_apps WHERE id=? AND owner=?').bind(match[1], owner).first<any>();
  if (!app) return json({ error: 'Function not found' }, 404);

  if (request.method === 'GET') return json({ id: app.id, publicId: app.public_id, name: app.name, code: app.code, enabled: Boolean(app.enabled), endpoint: publicFunctionUrl(url.origin, app.public_id), updatedAt: app.updated_at });
  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const code = body?.code === undefined ? app.code : validCode(body.code);
    if (!code) return json({ error: 'code is limited to 64 KiB' }, 400);
    const name = body?.name === undefined ? app.name : cleanName(body.name, app.name);
    const enabled = body?.enabled === undefined ? app.enabled : body.enabled ? 1 : 0;
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE function_apps SET name=?,code=?,enabled=?,updated_at=? WHERE id=? AND owner=?').bind(name, code, enabled, now, app.id, owner).run();
    return json({ id: app.id, publicId: app.public_id, name, enabled: Boolean(enabled), endpoint: publicFunctionUrl(url.origin, app.public_id), updatedAt: now });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM function_apps WHERE id=? AND owner=?').bind(app.id, owner).run();
    return new Response(null, { status: 204 });
  }
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PATCH,DELETE' } });
}

export async function functionRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/fn\/([a-f0-9]{32})(?:\/(.*))?$/i);
  if (!match) return null;
  const app = await env.DB.prepare('SELECT * FROM function_apps WHERE public_id=? AND enabled=1').bind(match[1].toLowerCase()).first<any>();
  if (!app) return json({ error: 'Function not found' }, 404);
  if (!env.LOADER) return json({ error: 'Dynamic Worker loader is not configured' }, 503);
  const usage = await consumeUsage(env, app.owner, 'functions', 'invocations');
  if (!usage.ok) return json({ error: 'Function invocation quota reached', ...usage }, 429);

  const workerId = `picosvc:function:${app.id}:${app.updated_at}`;
  const stub = env.LOADER.get(workerId, async () => ({
    compatibilityDate: '2026-09-15',
    compatibilityFlags: ['nodejs_compat'],
    mainModule: 'index.js',
    modules: { 'index.js': { js: app.code } },
    env: { PICOSVC_FUNCTION_ID: app.id, PICOSVC_FUNCTION_NAME: app.name },
    limits: { cpuMs: 500, subRequests: 32 },
  }));

  const target = new URL(request.url);
  target.pathname = `/${match[2] || ''}`;
  const headers = new Headers(request.headers);
  headers.delete('host'); headers.delete('cf-connecting-ip'); headers.delete('cf-ray');
  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  try {
    return await stub.getEntrypoint().fetch(new Request(target.toString(), init));
  } catch (error) {
    return json({ error: 'Function execution failed', detail: error instanceof Error ? error.message : String(error) }, 502);
  }
}
