import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { consumeUsage, json, requireIdentity, resourceCapacity } from './service-utils.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SIGN_SECONDS = 900;
const MODES = new Set(['public', 'private']);
const CACHE_MODES = new Set(['no-store', 'public, max-age=300', 'public, max-age=3600']);

type Space = { id: string; owner: string; public_id: string; enabled: number; access_mode: string };

function pathOf(raw: string): string | null {
  let value: string;
  try { value = decodeURIComponent(raw); } catch { return null; }
  if (!value || value.length > 512 || value.startsWith('/') || value.includes('..') || value.includes('\\') || /[\x00-\x1f]/.test(value)) return null;
  return value;
}

function bytes(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function hex(value: Uint8Array): string {
  return [...value].map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function signingKey(env: Env): Promise<CryptoKey | null> {
  if (!env.DEPLOYMENT_SECRETS_KEY) return null;
  try {
    const raw = Uint8Array.from(atob(env.DEPLOYMENT_SECRETS_KEY), (char) => char.charCodeAt(0));
    if (raw.byteLength !== 32) return null;
    return crypto.subtle.importKey('raw', bytes(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } catch { return null; }
}

async function signature(key: CryptoKey, space: Space, action: 'download' | 'upload', path: string, expires: number): Promise<string> {
  const input = new TextEncoder().encode(`picosvc-files-v1\n${space.id}\n${action}\n${path}\n${expires}`);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, input)));
}

function sameHex(expected: string, provided: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ provided.toLowerCase().charCodeAt(i);
  return mismatch === 0;
}

async function validSignature(request: Request, env: Env, space: Space, action: 'download' | 'upload', path: string): Promise<boolean> {
  const url = new URL(request.url);
  const expires = Number(url.searchParams.get('expires'));
  const provided = url.searchParams.get('sig') || '';
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + MAX_SIGN_SECONDS + 30) return false;
  const key = await signingKey(env);
  return Boolean(key && sameHex(await signature(key, space, action, path, expires), provided));
}

export async function filesAccessManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/picosvc\/files\/spaces\/([0-9a-f-]{36})\/(access|sign|metadata)$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const space = await env.DB.prepare('SELECT id,owner,public_id,enabled,access_mode FROM file_spaces WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<Space>();
  if (!space) return json({ error: 'File space not found' }, 404);
  if (match[2] === 'access') {
    if (request.method === 'GET') return json({ id: space.id, accessMode: space.access_mode });
    if (request.method !== 'PATCH') return new Response(null, { status: 405, headers: { allow: 'GET,PATCH' } });
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (typeof input?.mode !== 'string' || !MODES.has(input.mode)) return json({ error: 'mode must be public or private' }, 400);
    await env.DB.prepare('UPDATE file_spaces SET access_mode=?,updated_at=? WHERE id=? AND owner=?')
      .bind(input.mode, new Date().toISOString(), space.id, identity.ownerId).run();
    return json({ id: space.id, accessMode: input.mode });
  }
  if (match[2] === 'sign') {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    if (!space.enabled) return json({ error: 'File space is disabled' }, 409);
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    const path = typeof input?.path === 'string' ? pathOf(input.path) : null;
    const action = input?.action;
    if (!path || (action !== 'download' && action !== 'upload')) return json({ error: 'Valid path and action (download/upload) required' }, 400);
    const duration = input?.expiresInSeconds === undefined ? 300 : Number(input.expiresInSeconds);
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > MAX_SIGN_SECONDS) return json({ error: 'expiresInSeconds must be 1–900' }, 400);
    const key = await signingKey(env);
    if (!key) return json({ error: 'Signing key is not configured' }, 503);
    if (action === 'download') {
      const object = await env.DB.prepare('SELECT 1 AS ok FROM file_objects WHERE space_id=? AND path=?').bind(space.id, path).first();
      if (!object) return json({ error: 'File not found' }, 404);
    }
    const expires = Math.floor(Date.now() / 1000) + duration;
    const sig = await signature(key, space, action, path, expires);
    const escaped = path.split('/').map(encodeURIComponent).join('/');
    const pathname = action === 'download' ? `/files/${space.public_id}/${escaped}` : `/files-upload/${space.public_id}/${escaped}`;
    return json({ method: action === 'download' ? 'GET' : 'PUT', url: `${url.origin}${pathname}?expires=${expires}&sig=${sig}`, expiresAt: new Date(expires * 1000).toISOString(), uploadViaWorker: action === 'upload' });
  }
  if (request.method !== 'PATCH') return new Response(null, { status: 405, headers: { allow: 'PATCH' } });
  const path = pathOf(url.searchParams.get('path') || '');
  if (!path) return json({ error: 'Valid path query required' }, 400);
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof input?.cacheControl !== 'string' || !CACHE_MODES.has(input.cacheControl)) return json({ error: 'Unsupported cacheControl' }, 400);
  const updated = await env.DB.prepare('UPDATE file_objects SET cache_control=?,updated_at=? WHERE space_id=? AND owner=? AND path=? RETURNING path')
    .bind(input.cacheControl, new Date().toISOString(), space.id, identity.ownerId, path).first();
  return updated ? json({ path, cacheControl: input.cacheControl }) : json({ error: 'File not found' }, 404);
}

export async function filesAccessRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/(files|files-upload)\/([a-f0-9]{32})\/(.+)$/i);
  if (!match) return null;
  const upload = match[1] === 'files-upload';
  const path = pathOf(match[3]);
  if (!path) return json({ error: 'Invalid file path' }, 400);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: upload ? 'PUT,OPTIONS' : 'GET,HEAD,OPTIONS' } });
  if (upload ? request.method !== 'PUT' : !['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { allow: upload ? 'PUT' : 'GET,HEAD' } });
  }
  const space = await env.DB.prepare('SELECT id,owner,public_id,enabled,access_mode FROM file_spaces WHERE public_id=? AND enabled=1')
    .bind(match[2].toLowerCase()).first<Space>();
  if (!space) return json({ error: 'File space not found' }, 404);
  if (!env.ARTIFACTS) return json({ error: 'R2 binding is not configured' }, 503);
  const authorized = upload || space.access_mode === 'private' ? await validSignature(request, env, space, upload ? 'upload' : 'download', path) : true;
  if (!authorized) return json({ error: 'Valid signed URL required' }, 403);
  const r2key = `picosvc/files/${space.id}/${path}`;
  if (!upload) {
    const meta = await env.DB.prepare('SELECT cache_control FROM file_objects WHERE space_id=? AND path=?')
      .bind(space.id, path).first<{ cache_control: string }>();
    if (!meta) return json({ error: 'File not found' }, 404);
    const object = await env.ARTIFACTS.get(r2key);
    if (!object) return json({ error: 'File not found' }, 404);
    if (request.method === 'GET') {
      const usage = await consumeUsage(env, space.owner, 'files', 'downloads');
      if (!usage.ok) return json({ error: 'File download quota reached', ...usage }, 429);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', space.access_mode === 'private' ? 'private, no-store' : CACHE_MODES.has(meta.cache_control) ? meta.cache_control : 'public, max-age=300');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  }
  const declared = Number(request.headers.get('content-length') || '0');
  if (!Number.isFinite(declared) || declared > MAX_FILE_BYTES) return json({ error: 'File exceeds 10 MiB' }, 413);
  const payload = await request.arrayBuffer();
  if (payload.byteLength > MAX_FILE_BYTES) return json({ error: 'File exceeds 10 MiB' }, 413);
  const existing = await env.DB.prepare('SELECT size_bytes,cache_control FROM file_objects WHERE space_id=? AND path=?')
    .bind(space.id, path).first<{ size_bytes: number; cache_control: string }>();
  if (!existing) {
    const capacity = await resourceCapacity(env, space.owner, 'files', 'files', 'file_objects');
    if (!capacity.ok) return json({ error: 'File count limit reached', ...capacity }, 402);
  }
  const { tier, limit } = await productLimit(env, space.owner, 'files', 'storageBytes');
  const count = await env.DB.prepare('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM file_objects WHERE owner=?').bind(space.owner).first<{ bytes: number }>();
  const used = Number(count?.bytes || 0);
  const projected = used - Number(existing?.size_bytes || 0) + payload.byteLength;
  if (limit !== null && projected > limit) return json({ error: 'File storage limit reached', tier, limit, used, projected }, 402);
  const contentType = (request.headers.get('content-type') || 'application/octet-stream').slice(0, 200);
  const object = await env.ARTIFACTS.put(r2key, payload, { httpMetadata: { contentType } });
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO file_objects (space_id,owner,path,content_type,size_bytes,etag,created_at,updated_at,cache_control)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(space_id,path) DO UPDATE SET
    content_type=excluded.content_type,size_bytes=excluded.size_bytes,etag=excluded.etag,updated_at=excluded.updated_at`)
    .bind(space.id, space.owner, path, contentType, payload.byteLength, object?.etag || null, now, now, existing?.cache_control || 'public, max-age=300').run();
  return json({ path, sizeBytes: payload.byteLength, storageUsedBytes: projected, accessMode: space.access_mode, publicUrl: space.access_mode === 'public' ? `${url.origin}/files/${space.public_id}/${path.split('/').map(encodeURIComponent).join('/')}` : null }, 201);
}
