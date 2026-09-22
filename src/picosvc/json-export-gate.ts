import type { Env } from '../types.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';

/** An export page reads up to 100 documents; it must not bypass monthly request quotas. */
export async function jsonExportQuotaGate(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  const match = new URL(request.url).pathname.match(/^\/api\/picosvc\/json\/stores\/([0-9a-f-]{36})\/export$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const store = await env.DB.prepare('SELECT owner FROM json_stores WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ owner: string }>();
  if (!store) return null;
  const usage = await consumeUsage(env, store.owner, 'json', 'requests');
  return usage.ok ? null : json({ error: 'JSON export request quota reached', ...usage }, 429);
}
