import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { cleanName, consumeUsage, json, requireIdentity, resourceCapacity } from './service-utils.js';
import { randomPublicId } from './security.js';

function validKey(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(value) ? value : null;
}

function etagFor(version: number): string {
  return `"picosvc-config-${Math.max(1, version)}"`;
}

async function bumpVersion(env: Env, projectId: string): Promise<number> {
  const row = await env.DB.prepare(`
    UPDATE flag_projects
    SET version=version+1, updated_at=?
    WHERE id=?
    RETURNING version
  `).bind(new Date().toISOString(), projectId).first<{ version: number }>();
  return Number(row?.version || 1);
}

export async function configManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/flags')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  if (url.pathname === '/api/picosvc/flags/projects') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM flag_projects WHERE owner=? ORDER BY created_at DESC').bind(owner).all<any>();
      const capacity = await resourceCapacity(env, owner, 'flags', 'projects', 'flag_projects');
      return json({ tier: capacity.tier, limit: capacity.limit, projects: rows.results || [] });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'flags', 'projects', 'flag_projects');
      if (!capacity.ok) return json({ error: 'Remote Config project limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const id = crypto.randomUUID();
      const publicId = randomPublicId();
      const now = new Date().toISOString();
      const name = cleanName(body?.name, 'Config Project');
      await env.DB.prepare('INSERT INTO flag_projects (id,owner,public_id,name,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)')
        .bind(id, owner, publicId, name, now, now).run();
      return json({ id, publicId, name, version: 1, endpoint: `${url.origin}/flags/${publicId}`, tier: capacity.tier }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const valuesMatch = url.pathname.match(/^\/api\/picosvc\/flags\/projects\/([0-9a-f-]{36})\/flags$/i);
  if (valuesMatch) {
    const project = await env.DB.prepare('SELECT * FROM flag_projects WHERE id=? AND owner=?').bind(valuesMatch[1], owner).first<any>();
    if (!project) return json({ error: 'Remote Config project not found' }, 404);

    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT key,value_json,enabled,updated_at FROM feature_flags WHERE project_id=? ORDER BY key').bind(project.id).all<any>();
      return json({
        project: { id: project.id, publicId: project.public_id, name: project.name, version: Number(project.version || 1), updatedAt: project.updated_at },
        values: (rows.results || []).map((row) => ({ key: row.key, value: JSON.parse(row.value_json), enabled: Boolean(row.enabled), updatedAt: row.updated_at })),
      });
    }

    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const key = validKey(body?.key);
      if (!key) return json({ error: 'key must match [A-Za-z0-9._-] and be 1-100 chars' }, 400);
      const existing = await env.DB.prepare('SELECT 1 AS ok FROM feature_flags WHERE project_id=? AND key=?').bind(project.id, key).first();
      if (!existing) {
        const { tier, limit } = await productLimit(env, owner, 'flags', 'flags');
        const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM feature_flags f JOIN flag_projects p ON p.id=f.project_id WHERE p.owner=?').bind(owner).first<{ count: number }>();
        if (limit !== null && Number(count?.count || 0) >= limit) return json({ error: 'Remote Config value limit reached', tier, limit }, 402);
      }
      const now = new Date().toISOString();
      const enabled = body?.enabled === false ? 0 : 1;
      const value = body?.value ?? false;
      await env.DB.prepare(`
        INSERT INTO feature_flags (project_id,key,value_json,enabled,updated_at)
        VALUES (?,?,?,?,?)
        ON CONFLICT(project_id,key) DO UPDATE SET
          value_json=excluded.value_json,
          enabled=excluded.enabled,
          updated_at=excluded.updated_at
      `).bind(project.id, key, JSON.stringify(value), enabled, now).run();
      const version = await bumpVersion(env, project.id);
      return json({ key, value, enabled: Boolean(enabled), updatedAt: now, version });
    }

    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PUT' } });
  }

  const deleteMatch = url.pathname.match(/^\/api\/picosvc\/flags\/projects\/([0-9a-f-]{36})\/flags\/([^/]+)$/i);
  if (deleteMatch && request.method === 'DELETE') {
    const project = await env.DB.prepare('SELECT * FROM flag_projects WHERE id=? AND owner=?').bind(deleteMatch[1], owner).first<any>();
    if (!project) return json({ error: 'Remote Config project not found' }, 404);
    const key = validKey(decodeURIComponent(deleteMatch[2]));
    if (!key) return json({ error: 'Invalid config key' }, 400);
    const result = await env.DB.prepare('DELETE FROM feature_flags WHERE project_id=? AND key=?').bind(project.id, key).run();
    const version = Number(result.meta?.changes || 0) > 0 ? await bumpVersion(env, project.id) : Number(project.version || 1);
    return json({ deleted: Number(result.meta?.changes || 0) > 0, key, version });
  }

  return null;
}

export async function configRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/flags\/([a-f0-9]{32})$/i);
  if (!match) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,HEAD' } });

  const project = await env.DB.prepare('SELECT * FROM flag_projects WHERE public_id=?').bind(match[1].toLowerCase()).first<any>();
  if (!project) return json({ error: 'Remote Config project not found' }, 404);
  const usage = await consumeUsage(env, project.owner, 'flags', 'requests');
  if (!usage.ok) return json({ error: 'Remote Config request quota reached', ...usage }, 429);

  const version = Number(project.version || 1);
  const etag = etagFor(version);
  const headers = new Headers({
    'cache-control': 'public, max-age=30, stale-while-revalidate=300',
    etag,
    'x-picosvc-config-version': String(version),
  });
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  const rows = await env.DB.prepare('SELECT key,value_json FROM feature_flags WHERE project_id=? AND enabled=1 ORDER BY key').bind(project.id).all<any>();
  const values: Record<string, unknown> = {};
  for (const row of rows.results || []) values[row.key] = JSON.parse(row.value_json);
  headers.set('content-type', 'application/json; charset=utf-8');
  const body = JSON.stringify({ project: project.name, version, updatedAt: project.updated_at, values, flags: values });
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}
