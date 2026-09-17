import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { json, requireIdentity } from './service-utils.js';

/** The legacy PUT handler treats a supplied JSON null as a missing value. Intercept that
 * case without altering its existing non-null write contract or consuming the request body. */
export async function flagsWriteGuard(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'PUT') return null;
  const match = new URL(request.url).pathname.match(/^\/api\/picosvc\/flags\/projects\/([0-9a-f-]{36})\/flags$/i);
  if (!match) return null;
  const body: unknown = await request.clone().json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const draft = body as Record<string, unknown>;
  if (['__proto__', 'prototype', 'constructor'].includes(String(draft.key))) {
    return json({ error: 'Reserved flag key' }, 400);
  }
  if (!Object.prototype.hasOwnProperty.call(draft, 'value') || draft.value !== null) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;
  const project = await env.DB.prepare('SELECT id FROM flag_projects WHERE id=? AND owner=?')
    .bind(match[1], owner).first<{ id: string }>();
  if (!project) return json({ error: 'Flag project not found' }, 404);
  const key = typeof draft.key === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(draft.key) ? draft.key : null;
  if (!key) return json({ error: 'key must match [A-Za-z0-9._-] and be 1-100 chars' }, 400);
  const existing = await env.DB.prepare('SELECT 1 AS ok FROM feature_flags WHERE project_id=? AND key=?')
    .bind(project.id, key).first();
  if (!existing) {
    const { tier, limit } = await productLimit(env, owner, 'flags', 'flags');
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM feature_flags f JOIN flag_projects p ON p.id=f.project_id WHERE p.owner=?')
      .bind(owner).first<{ count: number }>();
    if (limit !== null && Number(count?.count || 0) >= limit) {
      return json({ error: 'Feature flag limit reached', tier, limit }, 402);
    }
  }
  const now = new Date().toISOString();
  const enabled = draft.enabled === false ? 0 : 1;
  await env.DB.prepare(`INSERT INTO feature_flags (project_id,key,value_json,enabled,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(project_id,key) DO UPDATE SET value_json=excluded.value_json,enabled=excluded.enabled,updated_at=excluded.updated_at`)
    .bind(project.id, key, 'null', enabled, now).run();
  return json({ key, value: null, enabled: Boolean(enabled), updatedAt: now });
}
