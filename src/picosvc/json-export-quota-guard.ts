import type { Env } from '../types.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';

/** Export pages previously bypassed the public JSON API's monthly request meter. */
export async function jsonExportQuotaGuard(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  const match = new URL(request.url).pathname.match(/^\/api\/picosvc\/json\/stores\/([0-9a-f-]{36})\/export$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const store = await env.DB.prepare('SELECT id FROM json_stores WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ id: string }>();
  if (!store) return null;
  const usage = await consumeUsage(env, identity.ownerId, 'json', 'requests');
  return usage.ok ? null : json({ error: 'JSON request quota reached', ...usage }, 429);
}
