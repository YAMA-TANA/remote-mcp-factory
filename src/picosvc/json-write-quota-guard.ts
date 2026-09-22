import type { Env } from '../types.js';
import { requireIdentity } from './service-utils.js';
import { sha256Hex } from './security.js';
import { checkJsonWriteCapacity } from './json-capacity.js';

function safeJsonKey(value: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  return decoded.length > 0 && decoded.length <= 200 && /^[A-Za-z0-9._:@/-]+$/.test(decoded) ? decoded : null;
}

/**
 * Replaces both legacy full-table JSON guards. Unauthorized requests fall through
 * to the runtime's authorization response; quota details are not leaked.
 */
export async function jsonWriteQuotaGuard(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'PUT') return null;
  const pathname = new URL(request.url).pathname;
  const publicMatch = pathname.match(/^\/json\/([a-f0-9]{32})\/(.+)$/i);
  if (publicMatch) {
    const key = safeJsonKey(publicMatch[2]);
    if (!key) return null;
    const store = await env.DB.prepare('SELECT id,owner,token_hash FROM json_stores WHERE public_id=?')
      .bind(publicMatch[1].toLowerCase()).first<{ id: string; owner: string; token_hash: string }>();
    if (!store) return null;
    const auth = request.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const tokenHash = await sha256Hex(auth.slice(7));
    if (tokenHash !== store.token_hash) {
      const scoped = await env.DB.prepare(`
        SELECT scope,key_prefix,expires_at FROM json_store_tokens WHERE store_id=? AND token_hash=?
      `).bind(store.id, tokenHash).first<{ scope: string; key_prefix: string; expires_at: string | null }>();
      if (!scoped || (scoped.scope !== 'write' && scoped.scope !== 'readwrite')
        || !key.startsWith(scoped.key_prefix)
        || (scoped.expires_at && Date.parse(scoped.expires_at) <= Date.now())) return null;
    }
    return checkJsonWriteCapacity(request, env, store.owner, store.id, key);
  }
  const managedMatch = pathname.match(/^\/api\/picosvc\/json\/stores\/([0-9a-f-]{36})\/documents\/(.+)$/i);
  if (!managedMatch) return null;
  const key = safeJsonKey(managedMatch[2]);
  if (!key) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const store = await env.DB.prepare('SELECT id,owner FROM json_stores WHERE id=? AND owner=?')
    .bind(managedMatch[1], identity.ownerId).first<{ id: string; owner: string }>();
  return store ? checkJsonWriteCapacity(request, env, store.owner, store.id, key) : null;
}
