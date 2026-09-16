import type { Env } from '../types.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { randomSecret, sha256Hex } from './security.js';

const MAX_JSON_BYTES = 256 * 1024;
const MAX_EXPORT_BYTES = 1024 * 1024;
type Store = { id: string; owner: string; public_id: string; token_hash: string; public_read: number };
type Document = { key: string; value_json: string; updated_at: string };

function keyFromPath(value: string): string | null {
  let key: string;
  try { key = decodeURIComponent(value); } catch { return null; }
  return key.length > 0 && key.length <= 200 && /^[A-Za-z0-9._:@/-]+$/.test(key) ? key : null;
}
function bearer(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}
function responseWithTag(body: unknown, tag: string, status = 200): Response {
  return Response.json(body, { status, headers: { etag: tag, 'cache-control': 'no-store' } });
}
async function documentTag(document: Pick<Document, 'value_json'|'updated_at'>): Promise<string> {
  return `"${await sha256Hex(`${document.updated_at}\n${document.value_json}`)}"`;
}
function tokenScopeAllows(scope: string, method: string): boolean {
  return scope === 'readwrite' || (scope === 'read' && method === 'GET') || (scope === 'write' && method !== 'GET');
}
async function isAuthorized(request: Request, env: Env, store: Store, key: string): Promise<boolean> {
  const token = bearer(request);
  if (!token) return request.method === 'GET' && Boolean(store.public_read);
  const hash = await sha256Hex(token);
  if (hash === store.token_hash) return true;
  const scoped = await env.DB.prepare(`
    SELECT scope,key_prefix,expires_at FROM json_store_tokens
    WHERE store_id=? AND token_hash=?
  `).bind(store.id, hash).first<{ scope: string; key_prefix: string; expires_at: string | null }>();
  if (!scoped || (scoped.expires_at && Date.parse(scoped.expires_at) <= Date.now())) return false;
  return key.startsWith(scoped.key_prefix) && tokenScopeAllows(scoped.scope, request.method);
}
async function documentByKey(env: Env, storeId: string, key: string): Promise<Document | null> {
  return env.DB.prepare('SELECT key,value_json,updated_at FROM json_documents WHERE store_id=? AND key=?')
    .bind(storeId, key).first<Document>();
}

export async function jsonAdvancedRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/json\/([a-f0-9]{32})\/(.+)$/i);
  if (!match) return null;
  const key = keyFromPath(match[2]);
  if (!key) return json({ error: 'Invalid document key' }, 400);
  const store = await env.DB.prepare('SELECT id,owner,public_id,token_hash,public_read FROM json_stores WHERE public_id=?')
    .bind(match[1].toLowerCase()).first<Store>();
  if (!store) return json({ error: 'JSON store not found' }, 404);
  if (!['GET','PUT','DELETE'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PUT,DELETE' } });
  if (!(await isAuthorized(request, env, store, key))) return json({ error: 'Unauthorized or token scope denied' }, 403);
  const usage = await consumeUsage(env, store.owner, 'json', 'requests');
  if (!usage.ok) return json({ error: 'JSON request quota reached', ...usage }, 429);
  const before = await documentByKey(env, store.id, key);
  const currentTag = before ? await documentTag(before) : null;
  const ifMatch = request.headers.get('if-match');
  const ifNoneMatch = request.headers.get('if-none-match');
  if (request.method === 'GET') {
    if (!before) return json({ error: 'Document not found' }, 404);
    if (ifNoneMatch === '*' || ifNoneMatch?.split(',').map((item) => item.trim()).includes(currentTag || '')) {
      return new Response(null, { status: 304, headers: { etag: currentTag!, 'cache-control': 'no-store' } });
    }
    return responseWithTag({ key, value: JSON.parse(before.value_json), updatedAt: before.updated_at, etag: currentTag }, currentTag!);
  }
  if (ifMatch && (ifMatch === '*' ? !before : ifMatch !== currentTag)) return json({ error: 'ETag precondition failed', currentEtag: currentTag }, 412);
  if (ifNoneMatch === '*' && before) return json({ error: 'Document already exists', currentEtag: currentTag }, 412);
  if (request.method === 'DELETE') {
    if (!before) return json({ error: 'Document not found' }, 404);
    const result = await env.DB.prepare('DELETE FROM json_documents WHERE store_id=? AND key=? AND updated_at=? AND value_json=?')
      .bind(store.id, key, before.updated_at, before.value_json).run();
    return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: 'Document changed during request' }, 412);
  }
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Body must be valid JSON' }, 400); }
  const valueJson = JSON.stringify(value);
  if (new TextEncoder().encode(valueJson).byteLength > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
  const now = new Date().toISOString();
  if (before) {
    const result = await env.DB.prepare('UPDATE json_documents SET value_json=?,updated_at=? WHERE store_id=? AND key=? AND updated_at=? AND value_json=?')
      .bind(valueJson, now, store.id, key, before.updated_at, before.value_json).run();
    if (!result.meta.changes) return json({ error: 'Document changed during request' }, 412);
  } else {
    const result = await env.DB.prepare('INSERT INTO json_documents (store_id,key,value_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(store_id,key) DO NOTHING')
      .bind(store.id, key, valueJson, now).run();
    if (!result.meta.changes) return json({ error: 'Document created during request' }, 412);
  }
  const etag = await documentTag({ value_json: valueJson, updated_at: now });
  return responseWithTag({ key, value, updatedAt: now, etag }, etag, before ? 200 : 201);
}

export async function jsonAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/picosvc\/json\/stores\/([0-9a-f-]{36})\/(tokens|tokens\/([0-9a-f-]{36})|settings|export)$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const store = await env.DB.prepare('SELECT id,owner,public_id,public_read FROM json_stores WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<Store>();
  if (!store) return json({ error: 'JSON store not found' }, 404);
  const action = match[2];
  if (action === 'settings') {
    if (request.method === 'GET') return json({ storeId: store.id, publicRead: Boolean(store.public_read) });
    if (request.method !== 'PATCH') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PATCH' } });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (typeof body?.publicRead !== 'boolean') return json({ error: 'publicRead must be a boolean' }, 400);
    await env.DB.prepare('UPDATE json_stores SET public_read=?,updated_at=? WHERE id=? AND owner=?')
      .bind(body.publicRead ? 1 : 0, new Date().toISOString(), store.id, identity.ownerId).run();
    return json({ storeId: store.id, publicRead: body.publicRead });
  }
  if (action === 'tokens') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id,label,scope,key_prefix,expires_at,created_at FROM json_store_tokens WHERE store_id=? AND owner=? ORDER BY created_at DESC LIMIT 100')
        .bind(store.id, identity.ownerId).all();
      return json({ storeId: store.id, tokens: rows.results || [] });
    }
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM json_store_tokens WHERE store_id=? AND owner=?').bind(store.id, identity.ownerId).first<{ count: number }>();
    if (Number(count?.count || 0) >= 20) return json({ error: 'Maximum 20 scoped tokens per store' }, 402);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const scope = body?.scope;
    if (scope !== 'read' && scope !== 'write' && scope !== 'readwrite') return json({ error: 'scope must be read, write or readwrite' }, 400);
    const prefix = body?.keyPrefix === undefined ? '' : keyFromPath(String(body.keyPrefix));
    if (prefix === null) return json({ error: 'Invalid keyPrefix' }, 400);
    const expiresAt = body?.expiresAt === undefined || body.expiresAt === null ? null : String(body.expiresAt);
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) return json({ error: 'expiresAt must be a future timestamp' }, 400);
    const token = randomSecret('json_scope');
    const id = crypto.randomUUID();
    const label = typeof body?.label === 'string' ? body.label.slice(0, 120) : 'Scoped token';
    await env.DB.prepare('INSERT INTO json_store_tokens (id,store_id,owner,label,token_hash,scope,key_prefix,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, store.id, identity.ownerId, label, await sha256Hex(token), scope, prefix, expiresAt, new Date().toISOString()).run();
    return json({ id, storeId: store.id, label, scope, keyPrefix: prefix, expiresAt, bearerToken: token }, 201);
  }
  if (action.startsWith('tokens/')) {
    if (request.method !== 'DELETE') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'DELETE' } });
    const result = await env.DB.prepare('DELETE FROM json_store_tokens WHERE id=? AND store_id=? AND owner=?')
      .bind(match[3], store.id, identity.ownerId).run();
    return result.meta.changes ? new Response(null, { status: 204 }) : json({ error: 'Scoped token not found' }, 404);
  }
  if (action === 'export') {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    const after = url.searchParams.get('after') || '';
    if (after && !keyFromPath(after)) return json({ error: 'Invalid after cursor' }, 400);
    const rows = await env.DB.prepare('SELECT key,value_json,updated_at FROM json_documents WHERE store_id=? AND key>? ORDER BY key LIMIT 101')
      .bind(store.id, after).all<Document>();
    const documents: Array<{ key: string; value: unknown; updatedAt: string }> = [];
    let bytes = 0;
    const values = rows.results || [];
    for (const row of values.slice(0, 100)) {
      const entryBytes = new TextEncoder().encode(row.value_json).byteLength + row.key.length + 128;
      if (documents.length && bytes + entryBytes > MAX_EXPORT_BYTES) break;
      documents.push({ key: row.key, value: JSON.parse(row.value_json), updatedAt: row.updated_at });
      bytes += entryBytes;
    }
    const last = documents.at(-1)?.key || null;
    return json({ storeId: store.id, documents, nextCursor: last && (values.length > documents.length) ? last : null, maxPageBytes: MAX_EXPORT_BYTES });
  }
  return null;
}
