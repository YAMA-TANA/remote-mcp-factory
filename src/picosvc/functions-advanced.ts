import type { Env } from '../types.js';
import { functionManagementRoutes } from './functions-service.js';
import { json, requireIdentity } from './service-utils.js';

const MAX_CODE_BYTES = 64 * 1024;
const MAX_SECRETS = 20;
const MAX_SECRET_VALUE_BYTES = 8 * 1024;
const MAX_LOGS = 200;

type App = { id: string; owner: string; public_id: string; name: string; code: string; enabled: number; current_revision: number; updated_at: string };

function toArrayBuffer(data: Uint8Array): ArrayBuffer { const copy = new Uint8Array(data.byteLength); copy.set(data); return copy.buffer; }
function b64(data: Uint8Array): string { let result = ''; for (let i = 0; i < data.length; i += 0x8000) result += String.fromCharCode(...data.subarray(i, i + 0x8000)); return btoa(result); }
function fromB64(value: string): ArrayBuffer { return toArrayBuffer(Uint8Array.from(atob(value), (char) => char.charCodeAt(0))); }
async function encryptionKey(env: Env): Promise<CryptoKey | null> {
  if (!env.DEPLOYMENT_SECRETS_KEY) return null;
  try { const raw = fromB64(env.DEPLOYMENT_SECRETS_KEY); if (raw.byteLength !== 32) return null;
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
  } catch { return null; }
}
function validSecretName(name: string): boolean {
  const reserved = new Set(['PATH','HOME','NODE_OPTIONS','NODE_PATH','LD_PRELOAD','PICOSVC_FUNCTION_ID','PICOSVC_FUNCTION_NAME']);
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(name) && !reserved.has(name) && !name.startsWith('CF_') && !name.startsWith('WRANGLER_');
}

export async function loadFunctionSecrets(env: Env, appId: string, owner: string): Promise<Record<string, string>> {
  const rows = await env.DB.prepare('SELECT name,iv,ciphertext FROM function_secrets WHERE app_id=? AND owner=? LIMIT 20')
    .bind(appId, owner).all<{ name: string; iv: string; ciphertext: string }>();
  if (!rows.results?.length) return {};
  const key = await encryptionKey(env);
  if (!key) throw new Error('Function secrets encryption key is unavailable');
  const values: Record<string, string> = {};
  for (const row of rows.results) {
    if (!validSecretName(row.name)) continue;
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(row.iv) }, key, fromB64(row.ciphertext));
    values[row.name] = new TextDecoder().decode(decrypted);
  }
  return values;
}

async function ensureInitialRevision(env: Env, app: App): Promise<void> {
  await env.DB.prepare(`INSERT OR IGNORE INTO function_revisions(id,app_id,owner,revision_no,code,created_at)
    VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(), app.id, app.owner, app.current_revision, app.code, app.updated_at).run();
}

async function recordRevisionAfterUpdate(env: Env, before: App, after: App): Promise<number | null> {
  if (before.code === after.code) return before.current_revision;
  if (new TextEncoder().encode(after.code).byteLength > MAX_CODE_BYTES) return null;
  const next = before.current_revision + 1;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO function_revisions(id,app_id,owner,revision_no,code,created_at)
      SELECT ?,id,owner,?,code,? FROM function_apps WHERE id=? AND owner=? AND current_revision=? AND code=?`)
      .bind(crypto.randomUUID(), next, now, before.id, before.owner, before.current_revision, after.code),
    env.DB.prepare(`UPDATE function_apps SET current_revision=?,updated_at=? WHERE id=? AND owner=? AND current_revision=? AND code=?`)
      .bind(next, now, before.id, before.owner, before.current_revision, after.code),
  ]);
  const updated = await env.DB.prepare('SELECT current_revision FROM function_apps WHERE id=? AND owner=?')
    .bind(before.id, before.owner).first<{ current_revision: number }>();
  return updated?.current_revision === next ? next : null;
}

export async function functionsAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/functions/')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;
  if (url.pathname === '/api/picosvc/functions/apps' && request.method === 'POST') {
    const response = await functionManagementRoutes(request, env);
    if (!response || !response.ok) return response;
    const payload = await response.clone().json().catch(() => null) as { id?: string } | null;
    if (payload?.id) {
      const app = await env.DB.prepare('SELECT * FROM function_apps WHERE id=? AND owner=?').bind(payload.id, owner).first<App>();
      if (app) await ensureInitialRevision(env, app);
    }
    return response;
  }
  const match = url.pathname.match(/^\/api\/picosvc\/functions\/apps\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  if (!match) return null;
  const app = await env.DB.prepare('SELECT * FROM function_apps WHERE id=? AND owner=?').bind(match[1], owner).first<App>();
  if (!app) return json({ error: 'Function not found' }, 404);
  const suffix = match[2] || '';
  if (!suffix && request.method === 'PATCH') {
    await ensureInitialRevision(env, app);
    const response = await functionManagementRoutes(request, env);
    if (!response || !response.ok) return response;
    const updated = await env.DB.prepare('SELECT * FROM function_apps WHERE id=? AND owner=?').bind(app.id, owner).first<App>();
    if (updated && updated.code !== app.code) {
      const revision = await recordRevisionAfterUpdate(env, app, updated);
      if (revision === null) return json({ error: 'Concurrent function revision; reload before editing' }, 409);
    }
    return response;
  }
  if (suffix === 'revisions') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
    await ensureInitialRevision(env, app);
    const rows = await env.DB.prepare('SELECT id,revision_no,created_at FROM function_revisions WHERE app_id=? AND owner=? ORDER BY revision_no DESC LIMIT 100')
      .bind(app.id, owner).all();
    return json({ appId: app.id, currentRevision: app.current_revision, revisions: rows.results || [] });
  }
  const revisionMatch = suffix.match(/^revisions\/(\d+)$/);
  if (revisionMatch && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT revision_no,code,created_at FROM function_revisions WHERE app_id=? AND owner=? AND revision_no=?')
      .bind(app.id, owner, Number(revisionMatch[1])).first();
    return row ? json(row) : json({ error: 'Revision not found' }, 404);
  }
  if (suffix === 'rollback') {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    const revisionNo = Number(input?.revision);
    if (!Number.isSafeInteger(revisionNo) || revisionNo < 1) return json({ error: 'A valid revision is required' }, 400);
    const revision = await env.DB.prepare('SELECT code FROM function_revisions WHERE app_id=? AND owner=? AND revision_no=?')
      .bind(app.id, owner, revisionNo).first<{ code: string }>();
    if (!revision) return json({ error: 'Revision not found' }, 404);
    const next = app.current_revision + 1;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE function_apps SET code=?,current_revision=?,updated_at=? WHERE id=? AND owner=? AND current_revision=?`)
        .bind(revision.code, next, now, app.id, owner, app.current_revision),
      env.DB.prepare(`INSERT INTO function_revisions(id,app_id,owner,revision_no,code,created_at)
        SELECT ?,id,owner,current_revision,code,? FROM function_apps WHERE id=? AND owner=? AND current_revision=?`)
        .bind(crypto.randomUUID(), now, app.id, owner, next),
    ]);
    const current = await env.DB.prepare('SELECT current_revision FROM function_apps WHERE id=? AND owner=?').bind(app.id, owner).first<{ current_revision: number }>();
    return current?.current_revision === next ? json({ appId: app.id, restoredFrom: revisionNo, currentRevision: next }) : json({ error: 'Concurrent rollback; reload and retry' }, 409);
  }
  if (suffix === 'logs') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
    const rows = await env.DB.prepare('SELECT id,revision_no,method,status_code,duration_ms,error,occurred_at FROM function_invocations WHERE app_id=? AND owner=? ORDER BY occurred_at DESC LIMIT 200')
      .bind(app.id, owner).all();
    return json({ appId: app.id, logs: rows.results || [] });
  }
  if (suffix === 'secrets') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT name,updated_at FROM function_secrets WHERE app_id=? AND owner=? ORDER BY name')
        .bind(app.id, owner).all();
      return json({ appId: app.id, secrets: rows.results || [] });
    }
    if (request.method !== 'PUT') return new Response(null, { status: 405, headers: { allow: 'GET,PUT' } });
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    const secrets = input?.secrets;
    if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) return json({ error: 'secrets must be an object' }, 400);
    const entries = Object.entries(secrets as Record<string, unknown>);
    if (!entries.length || entries.length > MAX_SECRETS || entries.some(([name,value]) => !validSecretName(name) || typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_SECRET_VALUE_BYTES)) {
      return json({ error: 'Provide 1–20 uppercase env names and string values up to 8 KiB' }, 400);
    }
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM function_secrets WHERE app_id=? AND owner=?')
      .bind(app.id, owner).first<{ count: number }>();
    const existing = await env.DB.prepare('SELECT name FROM function_secrets WHERE app_id=? AND owner=?').bind(app.id, owner).all<{ name: string }>();
    const existingNames = new Set((existing.results || []).map((row) => row.name));
    if (Number(count?.count || 0) + entries.filter(([name]) => !existingNames.has(name)).length > MAX_SECRETS) return json({ error: 'Function secrets limit reached' }, 402);
    const key = await encryptionKey(env);
    if (!key) return json({ error: 'Secrets encryption key is not configured' }, 503);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    for (const [name,value] of entries) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, new TextEncoder().encode(value as string));
      statements.push(env.DB.prepare(`INSERT INTO function_secrets(app_id,owner,name,iv,ciphertext,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(app_id,name) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at`)
        .bind(app.id, owner, name, b64(iv), b64(new Uint8Array(encrypted)), now));
    }
    statements.push(env.DB.prepare('UPDATE function_apps SET updated_at=? WHERE id=? AND owner=?').bind(now, app.id, owner));
    await env.DB.batch(statements);
    return json({ appId: app.id, updated: entries.map(([name]) => name).sort() });
  }
  const secretMatch = suffix.match(/^secrets\/([A-Z][A-Z0-9_]{0,63})$/);
  if (secretMatch && request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM function_secrets WHERE app_id=? AND owner=? AND name=?').bind(app.id, owner, secretMatch[1]),
      env.DB.prepare('UPDATE function_apps SET updated_at=? WHERE id=? AND owner=?').bind(new Date().toISOString(), app.id, owner),
    ]);
    return new Response(null, { status: 204 });
  }
  return null;
}

export async function recordFunctionInvocation(env: Env, appId: string, owner: string, revision: number, method: string, status: number, durationMs: number, error: string | null): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO function_invocations(id,app_id,owner,revision_no,method,status_code,duration_ms,error,occurred_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), appId, owner, revision, method.slice(0, 12), status, durationMs, error?.slice(0, 250) || null, now),
    env.DB.prepare(`DELETE FROM function_invocations WHERE app_id=? AND owner=? AND id NOT IN (
      SELECT id FROM function_invocations WHERE app_id=? AND owner=? ORDER BY occurred_at DESC,id DESC LIMIT ?)`)
      .bind(appId, owner, appId, owner, MAX_LOGS),
  ]);
}
