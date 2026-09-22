import type { Env } from '../types.js';
import { jsonWriteGuard } from './cost-guardrails.js';
import { sha256Hex } from './security.js';

/** Master-token writes are handled by cost-guardrails.ts; this covers scoped writers. */
export async function jsonScopedWriteGuard(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'PUT') return null;
  const match = new URL(request.url).pathname.match(/^\/json\/([a-f0-9]{32})\/(.+)$/i);
  if (!match) return null;
  let key: string;
  try { key = decodeURIComponent(match[2]); } catch { return null; }
  if (!key || key.length > 200 || !/^[A-Za-z0-9._:@/-]+$/.test(key)) return null;
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  const store = await env.DB.prepare('SELECT id,owner,token_hash FROM json_stores WHERE public_id=?')
    .bind(match[1].toLowerCase()).first<{ id: string; owner: string; token_hash: string }>();
  if (!store) return null;
  const hash = await sha256Hex(token);
  if (hash === store.token_hash) return null;
  const scoped = await env.DB.prepare('SELECT scope,key_prefix,expires_at FROM json_store_tokens WHERE store_id=? AND token_hash=?')
    .bind(store.id, hash).first<{ scope: string; key_prefix: string; expires_at: string | null }>();
  if (!scoped || (scoped.scope !== 'write' && scoped.scope !== 'readwrite') || !key.startsWith(scoped.key_prefix)
    || (scoped.expires_at && Date.parse(scoped.expires_at) <= Date.now())) return null;
  return jsonWriteGuard(request, env, store.owner, store.id, key);
}
