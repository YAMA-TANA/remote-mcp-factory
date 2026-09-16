import type { Env } from '../types.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { sha256Hex } from './security.js';

const MAX_VALIDATE_BYTES = 16 * 1024;
const MAX_HISTORY = 100;
type LicenseKey = {
  id: string; project_id: string; owner: string; label: string | null; metadata_json: string;
  expires_at: string | null; revoked: number; customer_ref: string | null;
  activation_limit: number | null; device_binding: number;
};

async function recordValidation(env: Env, key: LicenseKey, valid: boolean, reason: string, deviceHash: string | null): Promise<void> {
  await env.DB.prepare(`INSERT INTO license_validation_history (id,key_id,owner,valid,reason,device_hash,checked_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), key.id, key.owner, valid ? 1 : 0, reason, deviceHash, new Date().toISOString()).run();
  await env.DB.prepare(`DELETE FROM license_validation_history WHERE key_id=? AND owner=? AND id IN (
    SELECT id FROM license_validation_history WHERE key_id=? AND owner=? ORDER BY checked_at DESC,id DESC LIMIT -1 OFFSET ?
  )`).bind(key.id, key.owner, key.id, key.owner, MAX_HISTORY).run();
}

export async function licenseAdvancedRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(/^\/license\/([a-f0-9]{32})\/validate$/i);
  if (!match) return null;
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > MAX_VALIDATE_BYTES) return json({ valid: false, reason: 'body_too_large' }, 413);
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_VALIDATE_BYTES) return json({ valid: false, reason: 'body_too_large' }, 413);
  let body: Record<string, unknown> | null;
  try { body = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>; } catch { return json({ valid: false, reason: 'invalid_json' }, 400); }
  const project = await env.DB.prepare('SELECT id,owner FROM license_projects WHERE public_id=?')
    .bind(match[1].toLowerCase()).first<{ id: string; owner: string }>();
  if (!project) return json({ valid: false, reason: 'project_not_found' }, 404);
  const usage = await consumeUsage(env, project.owner, 'license', 'validations');
  if (!usage.ok) return json({ valid: false, reason: 'quota_reached' }, 429);
  const supplied = typeof body?.key === 'string' && body.key.length <= 512 ? body.key : '';
  if (!supplied) return json({ valid: false, reason: 'missing_key' }, 400);
  const key = await env.DB.prepare('SELECT * FROM license_keys WHERE project_id=? AND key_hash=?')
    .bind(project.id, await sha256Hex(supplied)).first<LicenseKey>();
  if (!key) return json({ valid: false, reason: 'not_found' });
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
  const deviceHash = deviceId && deviceId.length <= 200 ? await sha256Hex(deviceId) : null;
  const respond = async (valid: boolean, reason: string, status = 200): Promise<Response> => {
    await recordValidation(env, key, valid, reason, deviceHash);
    return json(valid ? {
      valid: true, label: key.label, metadata: JSON.parse(key.metadata_json || '{}'), customerRef: key.customer_ref,
      expiresAt: key.expires_at, activationLimit: key.activation_limit, deviceBound: Boolean(key.device_binding),
    } : { valid: false, reason }, status);
  };
  if (key.revoked) return respond(false, 'revoked');
  if (key.expires_at && Date.parse(key.expires_at) <= Date.now()) return respond(false, 'expired');
  if (key.device_binding || key.activation_limit !== null) {
    if (!deviceHash) return respond(false, 'device_id_required', 400);
    const existing = await env.DB.prepare('SELECT id FROM license_activations WHERE key_id=? AND device_hash=?')
      .bind(key.id, deviceHash).first<{ id: string }>();
    if (existing) {
      await env.DB.prepare('UPDATE license_activations SET last_seen_at=? WHERE key_id=? AND device_hash=?')
        .bind(new Date().toISOString(), key.id, deviceHash).run();
    } else {
      const now = new Date().toISOString();
      const claimed = await env.DB.prepare(`
        INSERT INTO license_activations (id,key_id,owner,device_hash,activated_at,last_seen_at)
        SELECT ?,?,?,?,?,? WHERE (? IS NULL OR
          (SELECT COUNT(*) FROM license_activations WHERE key_id=?) < ?)
        ON CONFLICT(key_id,device_hash) DO NOTHING RETURNING id
      `).bind(crypto.randomUUID(), key.id, key.owner, deviceHash, now, now, key.activation_limit, key.id, key.activation_limit).first<{ id: string }>();
      if (!claimed) {
        const concurrent = await env.DB.prepare('SELECT id FROM license_activations WHERE key_id=? AND device_hash=?')
          .bind(key.id, deviceHash).first<{ id: string }>();
        if (!concurrent) return respond(false, 'activation_limit_reached');
      }
    }
  }
  return respond(true, 'valid');
}

export async function licenseAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/picosvc\/license\/keys\/([0-9a-f-]{36})(?:\/(activations|validations))?$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const key = await env.DB.prepare('SELECT * FROM license_keys WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<LicenseKey>();
  if (!key) return json({ error: 'License key not found' }, 404);
  if (match[2]) {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    if (match[2] === 'activations') {
      const rows = await env.DB.prepare('SELECT device_hash,activated_at,last_seen_at FROM license_activations WHERE key_id=? AND owner=? ORDER BY activated_at DESC LIMIT 100')
        .bind(key.id, identity.ownerId).all();
      return json({ keyId: key.id, limit: key.activation_limit, activations: rows.results || [] });
    }
    const rows = await env.DB.prepare('SELECT valid,reason,device_hash,checked_at FROM license_validation_history WHERE key_id=? AND owner=? ORDER BY checked_at DESC,id DESC LIMIT 100')
      .bind(key.id, identity.ownerId).all();
    return json({ keyId: key.id, validations: rows.results || [] });
  }
  if (request.method !== 'PATCH') return null;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'JSON body required' }, 400);
  const activationLimit = body.activationLimit === undefined ? key.activation_limit
    : body.activationLimit === null ? null : Number(body.activationLimit);
  if (activationLimit !== null && (!Number.isInteger(activationLimit) || activationLimit < 1 || activationLimit > 100)) {
    return json({ error: 'activationLimit must be null or an integer from 1 to 100' }, 400);
  }
  const deviceBinding = body.deviceBinding === undefined ? Boolean(key.device_binding) : body.deviceBinding === true;
  if (deviceBinding && activationLimit === null) return json({ error: 'Device binding requires an activationLimit of 1–100' }, 400);
  const metadata = body.metadata === undefined ? JSON.parse(key.metadata_json || '{}') : body.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return json({ error: 'metadata must be an object' }, 400);
  const metadataJson = JSON.stringify(metadata);
  if (new TextEncoder().encode(metadataJson).byteLength > 4_096) return json({ error: 'metadata is limited to 4096 bytes' }, 413);
  const customerRef = body.customerRef === undefined ? key.customer_ref : body.customerRef === null ? null : String(body.customerRef).slice(0, 200);
  const revoked = body.revoked === undefined ? Boolean(key.revoked) : body.revoked === true;
  const expiresAt = body.expiresAt === undefined ? key.expires_at : body.expiresAt === null ? null : String(body.expiresAt);
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) return json({ error: 'expiresAt must be ISO timestamp or null' }, 400);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE license_keys
    SET metadata_json=?,customer_ref=?,activation_limit=?,device_binding=?,revoked=?,expires_at=?,updated_at=? WHERE id=? AND owner=?`)
    .bind(metadataJson, customerRef, activationLimit, deviceBinding ? 1 : 0, revoked ? 1 : 0, expiresAt, now, key.id, identity.ownerId).run();
  return json({ id: key.id, customerRef, metadata, activationLimit, deviceBinding, revoked, expiresAt, updatedAt: now });
}
