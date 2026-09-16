import type { Env } from '../types.js';
import { cleanName, consumeUsage, json, requireIdentity, resourceCapacity } from './service-utils.js';
import { randomPublicId, randomSecret, sha256Hex } from './security.js';

const MAX_JSON_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FORM_BYTES = 128 * 1024;

function safeKey(value: string): string | null {
  const decoded = decodeURIComponent(value);
  return decoded.length > 0 && decoded.length <= 200 && /^[A-Za-z0-9._:@/-]+$/.test(decoded) ? decoded : null;
}

function safeObjectPath(value: string): string | null {
  const normalized = value.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!normalized || normalized.length > 512 || normalized.includes('..') || /[\x00-\x1f]/.test(normalized)) return null;
  return normalized;
}

async function verifyStoreToken(request: Request, tokenHash: string): Promise<boolean> {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(token) && await sha256Hex(token) === tokenHash;
}

export async function dataManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!/^\/api\/picosvc\/(json|files|license|flags|forms)(?:\/|$)/.test(url.pathname)) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  // JSON stores
  if (url.pathname === '/api/picosvc/json/stores') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id,public_id,name,created_at,updated_at FROM json_stores WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      const capacity = await resourceCapacity(env, owner, 'json', 'stores', 'json_stores');
      return json({ tier: capacity.tier, limit: capacity.limit, stores: rows.results || [] });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'json', 'stores', 'json_stores');
      if (!capacity.ok) return json({ error: 'JSON store limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const token = randomSecret('json'); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO json_stores (id,owner,public_id,name,token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .bind(id, owner, publicId, cleanName(body?.name, 'JSON Store'), await sha256Hex(token), now, now).run();
      return json({ id, publicId, name: cleanName(body?.name, 'JSON Store'), endpoint: `${url.origin}/json/${publicId}`, bearerToken: token, tier: capacity.tier }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const jsonStoreMatch = url.pathname.match(/^\/api\/picosvc\/json\/stores\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  if (jsonStoreMatch) {
    const store = await env.DB.prepare('SELECT * FROM json_stores WHERE id=? AND owner=?').bind(jsonStoreMatch[1], owner).first<any>();
    if (!store) return json({ error: 'JSON store not found' }, 404);
    const suffix = jsonStoreMatch[2] || '';
    if (suffix === 'token/rotate' && request.method === 'POST') {
      const token = randomSecret('json');
      await env.DB.prepare('UPDATE json_stores SET token_hash=?, updated_at=? WHERE id=? AND owner=?').bind(await sha256Hex(token), new Date().toISOString(), store.id, owner).run();
      return json({ id: store.id, bearerToken: token });
    }
    if (suffix.startsWith('documents/')) {
      const key = safeKey(suffix.slice('documents/'.length));
      if (!key) return json({ error: 'Invalid document key' }, 400);
      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT value_json,updated_at FROM json_documents WHERE store_id=? AND key=?').bind(store.id, key).first<any>();
        return row ? json({ key, value: JSON.parse(row.value_json), updatedAt: row.updated_at }) : json({ error: 'Document not found' }, 404);
      }
      if (request.method === 'PUT') {
        const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
        let value: unknown; try { value = JSON.parse(text); } catch { return json({ error: 'Body must be valid JSON' }, 400); }
        const now = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO json_documents (store_id,key,value_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(store_id,key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`)
          .bind(store.id, key, JSON.stringify(value), now).run();
        return json({ key, value, updatedAt: now });
      }
      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM json_documents WHERE store_id=? AND key=?').bind(store.id, key).run();
        return new Response(null, { status: 204 });
      }
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PUT,DELETE' } });
    }
    if (!suffix && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM json_stores WHERE id=? AND owner=?').bind(store.id, owner).run();
      return new Response(null, { status: 204 });
    }
  }

  // Files
  if (url.pathname === '/api/picosvc/files/spaces') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM file_spaces WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      return json({ spaces: rows.results || [] });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO file_spaces (id,owner,public_id,name,enabled,created_at,updated_at) VALUES (?,?,?,?,1,?,?)')
        .bind(id, owner, publicId, cleanName(body?.name, 'File Space'), now, now).run();
      return json({ id, publicId, baseUrl: `${url.origin}/files/${publicId}`, name: cleanName(body?.name, 'File Space') }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const fileSpaceMatch = url.pathname.match(/^\/api\/picosvc\/files\/spaces\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  if (fileSpaceMatch) {
    const space = await env.DB.prepare('SELECT * FROM file_spaces WHERE id=? AND owner=?').bind(fileSpaceMatch[1], owner).first<any>();
    if (!space) return json({ error: 'File space not found' }, 404);
    const suffix = fileSpaceMatch[2] || '';
    if (suffix === 'objects' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT path,content_type,size_bytes,etag,created_at,updated_at FROM file_objects WHERE space_id=? AND owner=? ORDER BY updated_at DESC LIMIT 500').bind(space.id, owner).all();
      return json({ space: { id: space.id, publicId: space.public_id, name: space.name }, objects: rows.results || [] });
    }
    if (suffix === 'object') {
      const path = safeObjectPath(url.searchParams.get('path') || '');
      if (!path) return json({ error: 'A valid path query parameter is required' }, 400);
      if (request.method === 'PUT') {
        if (!env.ARTIFACTS) return json({ error: 'R2 binding is not configured' }, 503);
        const declared = Number(request.headers.get('content-length') || '0');
        if (declared > MAX_FILE_BYTES) return json({ error: 'Files are limited to 10 MiB' }, 413);
        const body = await request.arrayBuffer(); if (body.byteLength > MAX_FILE_BYTES) return json({ error: 'Files are limited to 10 MiB' }, 413);
        const existing = await env.DB.prepare('SELECT 1 AS ok FROM file_objects WHERE space_id=? AND path=?').bind(space.id, path).first();
        if (!existing) {
          const capacity = await resourceCapacity(env, owner, 'files', 'files', 'file_objects');
          if (!capacity.ok) return json({ error: 'File count limit reached', ...capacity }, 402);
        }
        const key = `picosvc/files/${space.id}/${path}`;
        const contentType = (request.headers.get('content-type') || 'application/octet-stream').slice(0, 200);
        const result = await env.ARTIFACTS.put(key, body, { httpMetadata: { contentType } });
        const now = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO file_objects (space_id,owner,path,content_type,size_bytes,etag,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(space_id,path) DO UPDATE SET content_type=excluded.content_type,size_bytes=excluded.size_bytes,etag=excluded.etag,updated_at=excluded.updated_at`)
          .bind(space.id, owner, path, contentType, body.byteLength, result?.etag || null, now, now).run();
        return json({ path, sizeBytes: body.byteLength, contentType, publicUrl: `${url.origin}/files/${space.public_id}/${path}` });
      }
      if (request.method === 'DELETE') {
        if (env.ARTIFACTS) await env.ARTIFACTS.delete(`picosvc/files/${space.id}/${path}`);
        await env.DB.prepare('DELETE FROM file_objects WHERE space_id=? AND path=?').bind(space.id, path).run();
        return new Response(null, { status: 204 });
      }
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'PUT,DELETE' } });
    }
    if (!suffix && request.method === 'DELETE') {
      if (env.ARTIFACTS) {
        const listed = await env.ARTIFACTS.list({ prefix: `picosvc/files/${space.id}/` });
        if (listed.objects.length) await env.ARTIFACTS.delete(listed.objects.map((item) => item.key));
      }
      await env.DB.prepare('DELETE FROM file_spaces WHERE id=? AND owner=?').bind(space.id, owner).run();
      return new Response(null, { status: 204 });
    }
  }

  // License
  if (url.pathname === '/api/picosvc/license/projects') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM license_projects WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      return json({ projects: rows.results || [] });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO license_projects (id,owner,public_id,name,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, owner, publicId, cleanName(body?.name, 'License Project'), now, now).run();
      return json({ id, publicId, name: cleanName(body?.name, 'License Project'), validationUrl: `${url.origin}/license/${publicId}/validate` }, 201);
    }
  }

  const licenseKeysMatch = url.pathname.match(/^\/api\/picosvc\/license\/projects\/([0-9a-f-]{36})\/keys$/i);
  if (licenseKeysMatch) {
    const project = await env.DB.prepare('SELECT * FROM license_projects WHERE id=? AND owner=?').bind(licenseKeysMatch[1], owner).first<any>();
    if (!project) return json({ error: 'License project not found' }, 404);
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id,label,metadata_json,expires_at,revoked,created_at,updated_at FROM license_keys WHERE project_id=? AND owner=? ORDER BY created_at DESC').bind(project.id, owner).all<any>();
      return json({ project: { id: project.id, publicId: project.public_id, name: project.name }, keys: (rows.results || []).map((row) => ({ ...row, metadata: JSON.parse(row.metadata_json || '{}') })) });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'license', 'keys', 'license_keys');
      if (!capacity.ok) return json({ error: 'License key limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const licenseKey = randomSecret('pico_lic'); const id = crypto.randomUUID(); const now = new Date().toISOString();
      const expiresAt = typeof body?.expiresAt === 'string' && !Number.isNaN(Date.parse(body.expiresAt)) ? new Date(body.expiresAt).toISOString() : null;
      const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};
      await env.DB.prepare('INSERT INTO license_keys (id,project_id,owner,key_hash,label,metadata_json,expires_at,revoked,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)')
        .bind(id, project.id, owner, await sha256Hex(licenseKey), typeof body?.label === 'string' ? body.label.slice(0, 120) : null, JSON.stringify(metadata), expiresAt, now, now).run();
      return json({ id, licenseKey, label: body?.label || null, expiresAt, metadata }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const licenseKeyMatch = url.pathname.match(/^\/api\/picosvc\/license\/keys\/([0-9a-f-]{36})$/i);
  if (licenseKeyMatch) {
    const row = await env.DB.prepare('SELECT * FROM license_keys WHERE id=? AND owner=?').bind(licenseKeyMatch[1], owner).first<any>();
    if (!row) return json({ error: 'License key not found' }, 404);
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const revoked = body?.revoked === undefined ? row.revoked : body.revoked ? 1 : 0;
      await env.DB.prepare('UPDATE license_keys SET revoked=?, updated_at=? WHERE id=? AND owner=?').bind(revoked, new Date().toISOString(), row.id, owner).run();
      return json({ id: row.id, revoked: Boolean(revoked) });
    }
  }

  // Flags
  if (url.pathname === '/api/picosvc/flags/projects') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM flag_projects WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      return json({ projects: rows.results || [] });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO flag_projects (id,owner,public_id,name,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, owner, publicId, cleanName(body?.name, 'Flag Project'), now, now).run();
      return json({ id, publicId, name: cleanName(body?.name, 'Flag Project'), endpoint: `${url.origin}/flags/${publicId}` }, 201);
    }
  }

  const flagListMatch = url.pathname.match(/^\/api\/picosvc\/flags\/projects\/([0-9a-f-]{36})\/flags$/i);
  if (flagListMatch) {
    const project = await env.DB.prepare('SELECT * FROM flag_projects WHERE id=? AND owner=?').bind(flagListMatch[1], owner).first<any>();
    if (!project) return json({ error: 'Flag project not found' }, 404);
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT key,value_json,enabled,updated_at FROM feature_flags WHERE project_id=? ORDER BY key').bind(project.id).all<any>();
      return json({ project: { id: project.id, publicId: project.public_id, name: project.name }, flags: (rows.results || []).map((row) => ({ key: row.key, value: JSON.parse(row.value_json), enabled: Boolean(row.enabled), updatedAt: row.updated_at })) });
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const key = typeof body?.key === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(body.key) ? body.key : null;
      if (!key) return json({ error: 'key must match [A-Za-z0-9._-] and be 1-100 chars' }, 400);
      const existing = await env.DB.prepare('SELECT 1 AS ok FROM feature_flags WHERE project_id=? AND key=?').bind(project.id, key).first();
      if (!existing) {
        const { tier, limit } = await import('./entitlements.js').then((mod) => mod.productLimit(env, owner, 'flags', 'flags'));
        const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM feature_flags f JOIN flag_projects p ON p.id=f.project_id WHERE p.owner=?').bind(owner).first<{ count: number }>();
        if (limit !== null && Number(count?.count || 0) >= limit) return json({ error: 'Feature flag limit reached', tier, limit }, 402);
      }
      const now = new Date().toISOString(); const enabled = body?.enabled === false ? 0 : 1; const value = body?.value ?? false;
      await env.DB.prepare(`INSERT INTO feature_flags (project_id,key,value_json,enabled,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(project_id,key) DO UPDATE SET value_json=excluded.value_json,enabled=excluded.enabled,updated_at=excluded.updated_at`)
        .bind(project.id, key, JSON.stringify(value), enabled, now).run();
      return json({ key, value, enabled: Boolean(enabled), updatedAt: now });
    }
  }

  const flagDeleteMatch = url.pathname.match(/^\/api\/picosvc\/flags\/projects\/([0-9a-f-]{36})\/flags\/([^/]+)$/i);
  if (flagDeleteMatch && request.method === 'DELETE') {
    const project = await env.DB.prepare('SELECT id FROM flag_projects WHERE id=? AND owner=?').bind(flagDeleteMatch[1], owner).first<any>();
    if (!project) return json({ error: 'Flag project not found' }, 404);
    const key = safeKey(flagDeleteMatch[2]); if (!key) return json({ error: 'Invalid flag key' }, 400);
    await env.DB.prepare('DELETE FROM feature_flags WHERE project_id=? AND key=?').bind(project.id, key).run();
    return new Response(null, { status: 204 });
  }

  // Forms
  if (url.pathname === '/api/picosvc/forms') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM forms WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      const capacity = await resourceCapacity(env, owner, 'forms', 'forms', 'forms');
      return json({ tier: capacity.tier, limit: capacity.limit, forms: rows.results || [] });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'forms', 'forms', 'forms');
      if (!capacity.ok) return json({ error: 'Form limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO forms (id,owner,public_id,name,enabled,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(id, owner, publicId, cleanName(body?.name, 'Form'), now, now).run();
      return json({ id, publicId, name: cleanName(body?.name, 'Form'), endpoint: `${url.origin}/forms/${publicId}` }, 201);
    }
  }

  const formMatch = url.pathname.match(/^\/api\/picosvc\/forms\/([0-9a-f-]{36})(?:\/submissions)?$/i);
  if (formMatch) {
    const form = await env.DB.prepare('SELECT * FROM forms WHERE id=? AND owner=?').bind(formMatch[1], owner).first<any>();
    if (!form) return json({ error: 'Form not found' }, 404);
    if (url.pathname.endsWith('/submissions') && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id,payload_json,headers_json,received_at FROM form_submissions WHERE form_id=? AND owner=? ORDER BY received_at DESC LIMIT 200').bind(form.id, owner).all<any>();
      return json({ form: { id: form.id, publicId: form.public_id, name: form.name }, submissions: (rows.results || []).map((row) => ({ id: row.id, payload: JSON.parse(row.payload_json), headers: JSON.parse(row.headers_json), receivedAt: row.received_at })) });
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM forms WHERE id=? AND owner=?').bind(form.id, owner).run();
      return new Response(null, { status: 204 });
    }
  }

  return null;
}

export async function dataRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);

  const jsonMatch = url.pathname.match(/^\/json\/([a-f0-9]{32})\/(.+)$/i);
  if (jsonMatch) {
    const store = await env.DB.prepare('SELECT * FROM json_stores WHERE public_id=?').bind(jsonMatch[1].toLowerCase()).first<any>();
    if (!store) return json({ error: 'JSON store not found' }, 404);
    if (!(await verifyStoreToken(request, store.token_hash))) return json({ error: 'Unauthorized' }, 401);
    const key = safeKey(jsonMatch[2]); if (!key) return json({ error: 'Invalid key' }, 400);
    const usage = await consumeUsage(env, store.owner, 'json', 'requests'); if (!usage.ok) return json({ error: 'JSON request quota reached', ...usage }, 429);
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT value_json,updated_at FROM json_documents WHERE store_id=? AND key=?').bind(store.id, key).first<any>();
      return row ? json({ key, value: JSON.parse(row.value_json), updatedAt: row.updated_at }) : json({ error: 'Document not found' }, 404);
    }
    if (request.method === 'PUT') {
      const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);
      let value: unknown; try { value = JSON.parse(text); } catch { return json({ error: 'Body must be valid JSON' }, 400); }
      const now = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO json_documents (store_id,key,value_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(store_id,key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`).bind(store.id, key, JSON.stringify(value), now).run();
      return json({ key, value, updatedAt: now });
    }
    if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM json_documents WHERE store_id=? AND key=?').bind(store.id, key).run(); return new Response(null, { status: 204 }); }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PUT,DELETE' } });
  }

  const filesMatch = url.pathname.match(/^\/files\/([a-f0-9]{32})\/(.+)$/i);
  if (filesMatch) {
    if (!env.ARTIFACTS) return json({ error: 'R2 binding is not configured' }, 503);
    const space = await env.DB.prepare('SELECT * FROM file_spaces WHERE public_id=? AND enabled=1').bind(filesMatch[1].toLowerCase()).first<any>();
    if (!space) return json({ error: 'File space not found' }, 404);
    const path = safeObjectPath(decodeURIComponent(filesMatch[2])); if (!path) return json({ error: 'Invalid path' }, 400);
    const meta = await env.DB.prepare('SELECT content_type FROM file_objects WHERE space_id=? AND path=?').bind(space.id, path).first<any>();
    if (!meta) return json({ error: 'File not found' }, 404);
    const object = await env.ARTIFACTS.get(`picosvc/files/${space.id}/${path}`); if (!object) return json({ error: 'File not found' }, 404);
    const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag', object.httpEtag); headers.set('cache-control', 'public, max-age=300');
    return new Response(object.body, { headers });
  }

  const licenseMatch = url.pathname.match(/^\/license\/([a-f0-9]{32})\/validate$/i);
  if (licenseMatch) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
    const project = await env.DB.prepare('SELECT * FROM license_projects WHERE public_id=?').bind(licenseMatch[1].toLowerCase()).first<any>();
    if (!project) return json({ valid: false, reason: 'project_not_found' }, 404);
    const usage = await consumeUsage(env, project.owner, 'license', 'validations'); if (!usage.ok) return json({ valid: false, reason: 'quota_reached' }, 429);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null; const key = typeof body?.key === 'string' ? body.key : '';
    if (!key) return json({ valid: false, reason: 'missing_key' }, 400);
    const row = await env.DB.prepare('SELECT * FROM license_keys WHERE project_id=? AND key_hash=?').bind(project.id, await sha256Hex(key)).first<any>();
    if (!row) return json({ valid: false, reason: 'not_found' });
    if (row.revoked) return json({ valid: false, reason: 'revoked' });
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return json({ valid: false, reason: 'expired', expiresAt: row.expires_at });
    return json({ valid: true, label: row.label, metadata: JSON.parse(row.metadata_json || '{}'), expiresAt: row.expires_at });
  }

  const flagsMatch = url.pathname.match(/^\/flags\/([a-f0-9]{32})$/i);
  if (flagsMatch) {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    const project = await env.DB.prepare('SELECT * FROM flag_projects WHERE public_id=?').bind(flagsMatch[1].toLowerCase()).first<any>();
    if (!project) return json({ error: 'Flag project not found' }, 404);
    const usage = await consumeUsage(env, project.owner, 'flags', 'requests'); if (!usage.ok) return json({ error: 'Flag request quota reached' }, 429);
    const rows = await env.DB.prepare('SELECT key,value_json FROM feature_flags WHERE project_id=? AND enabled=1 ORDER BY key').bind(project.id).all<any>();
    const flags: Record<string, unknown> = {}; for (const row of rows.results || []) flags[row.key] = JSON.parse(row.value_json);
    return json({ project: project.name, flags }, 200);
  }

  const formsMatch = url.pathname.match(/^\/forms\/([a-f0-9]{32})$/i);
  if (formsMatch) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
    const form = await env.DB.prepare('SELECT * FROM forms WHERE public_id=? AND enabled=1').bind(formsMatch[1].toLowerCase()).first<any>();
    if (!form) return json({ error: 'Form not found' }, 404);
    const usage = await consumeUsage(env, form.owner, 'forms', 'submissions'); if (!usage.ok) return json({ error: 'Form submission quota reached' }, 429);
    const declared = Number(request.headers.get('content-length') || '0'); if (declared > MAX_FORM_BYTES) return json({ error: 'Submission is limited to 128 KiB' }, 413);
    const type = request.headers.get('content-type') || '';
    let payload: unknown;
    if (type.includes('application/json')) {
      const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_FORM_BYTES) return json({ error: 'Submission is limited to 128 KiB' }, 413);
      try { payload = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
    } else if (type.includes('application/x-www-form-urlencoded')) {
      const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_FORM_BYTES) return json({ error: 'Submission is limited to 128 KiB' }, 413);
      payload = Object.fromEntries(new URLSearchParams(text).entries());
    } else return json({ error: 'Use application/json or application/x-www-form-urlencoded' }, 415);
    const headers: Record<string, string> = {}; for (const name of ['user-agent', 'referer', 'origin']) { const value = request.headers.get(name); if (value) headers[name] = value.slice(0, 1000); }
    const id = crypto.randomUUID(); const receivedAt = new Date().toISOString();
    await env.DB.prepare('INSERT INTO form_submissions (id,form_id,owner,payload_json,headers_json,received_at) VALUES (?,?,?,?,?,?)').bind(id, form.id, form.owner, JSON.stringify(payload), JSON.stringify(headers), receivedAt).run();
    return json({ accepted: true, submissionId: id, receivedAt }, 202);
  }

  return null;
}
