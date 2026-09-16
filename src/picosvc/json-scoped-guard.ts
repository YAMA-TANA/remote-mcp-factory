import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { json } from './service-utils.js';
import { sha256Hex } from './security.js';

const MAX_JSON_BYTES = 256 * 1024;
/** Master-token writes are already enforced by cost-guardrails.ts. This covers scoped writers. */
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
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
  let value: unknown;
  try {
    const bytes = new Uint8Array(await request.clone().arrayBuffer());
    if (bytes.byteLength > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; } // JSON parser in runtime handles invalid bodies.
  const byteLength = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (byteLength > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
  const [documentPlan, storagePlan, aggregate, existing] = await Promise.all([
    productLimit(env, store.owner, 'json', 'documents'),
    productLimit(env, store.owner, 'json', 'storageBytes'),
    env.DB.prepare(`SELECT COUNT(*) AS documents,COALESCE(SUM(LENGTH(CAST(d.value_json AS BLOB))),0) AS bytes
      FROM json_documents d JOIN json_stores s ON s.id=d.store_id WHERE s.owner=?`)
      .bind(store.owner).first<{ documents: number; bytes: number }>(),
    env.DB.prepare('SELECT LENGTH(CAST(value_json AS BLOB)) AS bytes FROM json_documents WHERE store_id=? AND key=?')
      .bind(store.id, key).first<{ bytes: number }>(),
  ]);
  const documents = Number(aggregate?.documents || 0);
  const storage = Number(aggregate?.bytes || 0);
  if (documentPlan.limit !== null && documents + (existing ? 0 : 1) > documentPlan.limit) {
    return json({ error: 'JSON document limit reached', tier: documentPlan.tier, limit: documentPlan.limit, used: documents }, 402);
  }
  if (storagePlan.limit !== null && storage - Number(existing?.bytes || 0) + byteLength > storagePlan.limit) {
    return json({ error: 'JSON storage limit reached', tier: storagePlan.tier, limit: storagePlan.limit, used: storage }, 402);
  }
  return null;
}
