import type { Env } from '../types.js';
import { cleanName, consumeUsage, json, requireIdentity } from './service-utils.js';
import { fetchPublic, randomPublicId, safePublicUrl } from './security.js';
import { productLimit } from './entitlements.js';

const MAX_RAW_BYTES = 1024 * 1024;
const MAIL_DOMAIN = 'picosvc.com';

function publicAddress(publicId: string): string {
  return `${publicId}@${MAIL_DOMAIN}`;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}

export async function mailManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/mail')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  if (url.pathname === '/api/picosvc/mail/routes') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM mail_routes WHERE owner=? ORDER BY created_at DESC').bind(owner).all<any>();
      const { tier, limit } = await productLimit(env, owner, 'mail', 'routes');
      return json({ tier, limit, routes: (rows.results || []).map((row) => ({ id: row.id, publicId: row.public_id, name: row.name, webhookUrl: row.webhook_url, enabled: Boolean(row.enabled), address: publicAddress(row.public_id), createdAt: row.created_at, updatedAt: row.updated_at })) });
    }
    if (request.method === 'POST') {
      const { tier, limit } = await productLimit(env, owner, 'mail', 'routes');
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM mail_routes WHERE owner=?').bind(owner).first<{ count: number }>();
      if (limit !== null && Number(count?.count || 0) >= limit) return json({ error: 'Mail route limit reached', tier, limit }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const webhook = safePublicUrl(body?.webhookUrl); if (!webhook) return json({ error: 'webhookUrl must be a public HTTP(S) URL' }, 400);
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO mail_routes (id,owner,public_id,name,webhook_url,enabled,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)')
        .bind(id, owner, publicId, cleanName(body?.name, 'Email Route'), webhook.toString(), now, now).run();
      return json({ id, publicId, name: cleanName(body?.name, 'Email Route'), webhookUrl: webhook.toString(), address: publicAddress(publicId), tier }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const routeMatch = url.pathname.match(/^\/api\/picosvc\/mail\/routes\/([0-9a-f-]{36})(?:\/(events))?$/i);
  if (!routeMatch) return null;
  const route = await env.DB.prepare('SELECT * FROM mail_routes WHERE id=? AND owner=?').bind(routeMatch[1], owner).first<any>();
  if (!route) return json({ error: 'Mail route not found' }, 404);
  if (routeMatch[2] === 'events' && request.method === 'GET') {
    const [rows, attempts] = await Promise.all([
      env.DB.prepare('SELECT * FROM mail_events WHERE route_id=? AND owner=? ORDER BY received_at DESC LIMIT 200').bind(route.id, owner).all<any>(),
      env.DB.prepare(`SELECT * FROM mail_delivery_attempts WHERE route_id=? AND owner=?
        AND event_id IN (SELECT id FROM mail_events WHERE route_id=? AND owner=? ORDER BY received_at DESC LIMIT 200)
        ORDER BY attempted_at DESC`).bind(route.id, owner, route.id, owner).all<any>(),
    ]);
    const attemptsByEvent = new Map<string, any[]>();
    for (const attempt of attempts.results || []) {
      const list = attemptsByEvent.get(attempt.event_id) || [];
      list.push(attempt);
      attemptsByEvent.set(attempt.event_id, list);
    }
    return json({ route: { id: route.id, publicId: route.public_id, name: route.name, address: publicAddress(route.public_id) },
      events: (rows.results || []).map((event) => ({ ...event, deliveryAttempts: attemptsByEvent.get(event.id) || [] })) });
  }
  if (!routeMatch[2] && request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const webhook = body?.webhookUrl === undefined ? null : safePublicUrl(body.webhookUrl); if (body?.webhookUrl !== undefined && !webhook) return json({ error: 'webhookUrl must be a public HTTP(S) URL' }, 400);
    const enabled = body?.enabled === undefined ? route.enabled : body.enabled ? 1 : 0; const name = body?.name === undefined ? route.name : cleanName(body.name, route.name);
    await env.DB.prepare('UPDATE mail_routes SET name=?,webhook_url=?,enabled=?,updated_at=? WHERE id=? AND owner=?').bind(name, webhook?.toString() || route.webhook_url, enabled, new Date().toISOString(), route.id, owner).run();
    return json({ id: route.id, name, webhookUrl: webhook?.toString() || route.webhook_url, enabled: Boolean(enabled), address: publicAddress(route.public_id) });
  }
  if (!routeMatch[2] && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM mail_routes WHERE id=? AND owner=?').bind(route.id, owner).run(); return new Response(null, { status: 204 }); }
  return null;
}

export async function handleIncomingEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const [local, domain] = message.to.trim().toLowerCase().split('@');
  if (domain !== MAIL_DOMAIN || !local || !/^[a-f0-9]{32}$/.test(local)) return;
  const route = await env.DB.prepare('SELECT * FROM mail_routes WHERE public_id=? AND enabled=1').bind(local).first<any>();
  if (!route) return;
  const usage = await consumeUsage(env, route.owner, 'mail', 'mails');
  const receivedAt = new Date().toISOString();
  if (!usage.ok) {
    await env.DB.prepare('INSERT INTO mail_events (id,route_id,owner,from_address,to_address,subject,raw_size,delivery_status,error,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), route.id, route.owner, message.from, message.to, message.headers.get('subject'), message.rawSize || 0, 'quota_reached', 'Monthly mail quota reached', receivedAt).run();
    return;
  }

  let rawBase64: string | null = null; let rawTruncated = false;
  if ((message.rawSize || 0) <= MAX_RAW_BYTES) {
    const bytes = new Uint8Array(await new Response(message.raw).arrayBuffer());
    rawBase64 = encodeBase64(bytes);
  } else rawTruncated = true;

  const payload = {
    routeId: route.id,
    from: message.from,
    to: message.to,
    subject: message.headers.get('subject'),
    messageId: message.headers.get('message-id'),
    contentType: message.headers.get('content-type'),
    receivedAt,
    rawSize: message.rawSize || 0,
    rawBase64,
    rawTruncated,
  };

  let deliveryStatus = 'delivered'; let error: string | null = null;
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchPublic(route.webhook_url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'PicoSvc-Mail/1.0' }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) { deliveryStatus = 'failed'; error = `Webhook returned HTTP ${response.status}`; }
    } finally { clearTimeout(timer); }
  } catch (err) { deliveryStatus = 'failed'; error = err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000); }

  await env.DB.prepare('INSERT INTO mail_events (id,route_id,owner,from_address,to_address,subject,raw_size,delivery_status,error,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), route.id, route.owner, message.from, message.to, message.headers.get('subject'), message.rawSize || 0, deliveryStatus, error, receivedAt).run();
}
