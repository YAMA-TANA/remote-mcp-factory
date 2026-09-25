import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { decodeMimeHeader, parseMimeMessage } from './mail-mime.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { randomSecret, safePublicUrl } from './security.js';
import { fetchPicoSvcTarget, type InternalPicoSvcDispatch } from './internal-dispatch.js';

const MAIL_DOMAIN = 'picosvc.com';
const MAX_RAW_BYTES = 1024 * 1024;
const MAX_ATTEMPTS = 4;
const RETRY_MINUTES = [1, 5, 15];
const MAX_DELIVERY_MS = 10_000;

type Route = { id: string; owner: string; public_id: string; enabled: number; webhook_url: string; signing_iv: string | null; signing_ciphertext: string | null };
type MailEvent = { id: string; route_id: string; owner: string; payload_r2_key: string | null; attempts: number };

function bufferCopy(input: Uint8Array): ArrayBuffer {
  const bytes = new Uint8Array(input.byteLength); bytes.set(input); return bytes.buffer;
}
function base64(input: Uint8Array): string {
  let str = '';
  for (let index = 0; index < input.byteLength; index += 0x8000) str += String.fromCharCode(...input.subarray(index, index + 0x8000));
  return btoa(str);
}
function fromBase64(input: string): ArrayBuffer {
  return bufferCopy(Uint8Array.from(atob(input), (char) => char.charCodeAt(0)));
}
function hex(bytes: Uint8Array): string { return [...bytes].map((part) => part.toString(16).padStart(2, '0')).join(''); }

async function aesKey(env: Env): Promise<CryptoKey | null> {
  try {
    const raw = env.DEPLOYMENT_SECRETS_KEY ? fromBase64(env.DEPLOYMENT_SECRETS_KEY) : null;
    if (!raw || raw.byteLength !== 32) return null;
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
  } catch { return null; }
}
async function signingSecret(env: Env, route: Route): Promise<string | null> {
  if (!route.signing_iv || !route.signing_ciphertext) return null;
  const key = await aesKey(env);
  if (!key) throw new Error('Mail signing key is not configured');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(route.signing_iv) }, key, fromBase64(route.signing_ciphertext));
  return new TextDecoder().decode(plain);
}
async function webhookSignature(secret: string, timestamp: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))));
}

async function deletePrefix(env: Env, prefix: string): Promise<void> {
  if (!env.ARTIFACTS) return;
  let cursor: string | undefined;
  do {
    const result = await env.ARTIFACTS.list({ prefix, ...(cursor ? { cursor } : {}) });
    if (result.objects.length) await env.ARTIFACTS.delete(result.objects.map((row) => row.key));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);
}

async function deliver(env: Env, eventId: string, dispatchInternal?: InternalPicoSvcDispatch): Promise<void> {
  const started = Date.now();
  const now = new Date().toISOString();
  const event = await env.DB.prepare(`UPDATE mail_events SET delivery_status='sending',attempts=attempts+1,next_retry_at=NULL
    WHERE id=? AND delivery_status IN ('pending','retry') AND (next_retry_at IS NULL OR next_retry_at<=?)
    RETURNING id,route_id,owner,payload_r2_key,attempts`).bind(eventId, now).first<MailEvent>();
  if (!event) return;
  const route = await env.DB.prepare('SELECT * FROM mail_routes WHERE id=? AND owner=? AND enabled=1').bind(event.route_id, event.owner).first<Route>();
  let status: number | null = null;
  let error: string | null = null;
  if (!route) error = 'Mail route is disabled or missing';
  else if (!env.ARTIFACTS || !event.payload_r2_key) error = 'Mail delivery payload is unavailable';
  else {
    try {
      const object = await env.ARTIFACTS.get(event.payload_r2_key);
      if (!object) throw new Error('Mail delivery payload is missing');
      const payload = await object.text();
      const headers = new Headers({ 'content-type': 'application/json', 'user-agent': 'PicoSvc-Mail/2.0', 'x-picosvc-mail-event': event.id });
      const secret = await signingSecret(env, route);
      if (secret) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        headers.set('x-picosvc-mail-timestamp', timestamp);
        headers.set('x-picosvc-mail-signature', `v1=${await webhookSignature(secret, timestamp, payload)}`);
      }
      const url = safePublicUrl(route.webhook_url);
      if (!url) throw new Error('Webhook target is not a permitted public URL');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MAX_DELIVERY_MS);
      try {
        const response = await fetchPicoSvcTarget(url, { method: 'POST', headers, body: payload, signal: controller.signal }, env, dispatchInternal);
        status = response.status;
        if (!response.ok) error = `Webhook returned HTTP ${response.status}`;
      } finally { clearTimeout(timeout); }
    } catch (err) { error = err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400); }
  }
  const retryable = Boolean(error && route && event.payload_r2_key && event.attempts < MAX_ATTEMPTS);
  const next = retryable ? new Date(Date.now() + RETRY_MINUTES[event.attempts - 1] * 60_000).toISOString() : null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO mail_delivery_attempts
      (id,event_id,route_id,owner,attempt_number,response_status,duration_ms,error,attempted_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), event.id, event.route_id, event.owner, event.attempts, status, Date.now() - started, error, new Date().toISOString()),
    env.DB.prepare('UPDATE mail_events SET delivery_status=?,error=?,response_status=?,next_retry_at=? WHERE id=? AND owner=?')
      .bind(error ? retryable ? 'retry' : 'failed' : 'delivered', error, status, next, event.id, event.owner),
  ]);
}

export async function runMailRetries(env: Env, dispatchInternal?: InternalPicoSvcDispatch): Promise<void> {
  const now = new Date().toISOString();
  const due = await env.DB.prepare(`SELECT id FROM mail_events WHERE delivery_status='retry' AND next_retry_at<=? ORDER BY next_retry_at LIMIT 50`)
    .bind(now).all<{ id: string }>();
  for (const event of due.results || []) await deliver(env, event.id, dispatchInternal);
}

export async function handleIncomingMailAdvanced(message: ForwardableEmailMessage, env: Env, dispatchInternal?: InternalPicoSvcDispatch): Promise<void> {
  const [local, domain] = message.to.trim().toLowerCase().split('@');
  if (domain !== MAIL_DOMAIN || !local || !/^[a-f0-9]{32}$/.test(local)) return;
  const route = await env.DB.prepare('SELECT * FROM mail_routes WHERE public_id=? AND enabled=1').bind(local).first<Route>();
  if (!route) return;
  const quota = await consumeUsage(env, route.owner, 'mail', 'mails');
  const eventId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const rawSize = Number(message.rawSize || 0);
  const prefix = `picosvc/mail/${route.id}/${eventId}/`;
  if (!quota.ok) {
    await env.DB.prepare('INSERT INTO mail_events (id,route_id,owner,from_address,to_address,subject,raw_size,delivery_status,error,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(eventId, route.id, route.owner, message.from, message.to, message.headers.get('subject'), rawSize, 'quota_reached', 'Monthly mail quota reached', receivedAt).run();
    return;
  }
  const raw = rawSize > 0 && rawSize <= MAX_RAW_BYTES ? new Uint8Array(await new Response(message.raw).arrayBuffer()) : null;
  const parsed = raw && raw.byteLength <= MAX_RAW_BYTES ? parseMimeMessage(raw) : { text: null, html: null, attachments: [], omittedAttachments: 0 };
  const subject = decodeMimeHeader(message.headers.get('subject') || '');
  await env.DB.prepare(`INSERT INTO mail_events (id,route_id,owner,from_address,to_address,subject,raw_size,delivery_status,error,received_at,text_preview,html_preview)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId, route.id, route.owner, message.from, message.to, subject, rawSize, 'pending', null, receivedAt, parsed.text?.slice(0, 2000) || null, parsed.html?.slice(0, 2000) || null).run();
  if (!env.ARTIFACTS) {
    await env.DB.prepare("UPDATE mail_events SET delivery_status='failed',error='R2 is not configured' WHERE id=?").bind(eventId).run();
    return;
  }
  try {
    const attachments: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }> = [];
    for (const attachment of parsed.attachments) {
      const id = crypto.randomUUID();
      const r2key = `${prefix}attachments/${id}`;
      await env.ARTIFACTS.put(r2key, bufferCopy(attachment.data), { httpMetadata: { contentType: attachment.contentType } });
      await env.DB.prepare(`INSERT INTO mail_attachments (id,event_id,route_id,owner,filename,content_type,size_bytes,r2_key,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(id, eventId, route.id, route.owner, attachment.filename, attachment.contentType, attachment.data.byteLength, r2key, receivedAt).run();
      attachments.push({ id, filename: attachment.filename, contentType: attachment.contentType, sizeBytes: attachment.data.byteLength });
    }
    const payload = JSON.stringify({ routeId: route.id, eventId, from: message.from, to: message.to,
      subject, messageId: message.headers.get('message-id'), contentType: message.headers.get('content-type'), receivedAt,
      rawSize, rawBase64: raw && raw.byteLength <= MAX_RAW_BYTES ? base64(raw) : null,
      rawTruncated: !raw || raw.byteLength > MAX_RAW_BYTES,
      text: parsed.text, html: parsed.html, attachments, omittedAttachments: parsed.omittedAttachments });
    const payloadKey = `${prefix}payload.json`;
    await env.ARTIFACTS.put(payloadKey, payload, { httpMetadata: { contentType: 'application/json' } });
    await env.DB.prepare('UPDATE mail_events SET payload_r2_key=? WHERE id=?').bind(payloadKey, eventId).run();
    await deliver(env, eventId, dispatchInternal);
  } catch (error) {
    await deletePrefix(env, prefix).catch(() => undefined);
    await env.DB.prepare('DELETE FROM mail_attachments WHERE event_id=?').bind(eventId).run();
    await env.DB.prepare("UPDATE mail_events SET delivery_status='failed',error=? WHERE id=?")
      .bind(error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400), eventId).run();
  }
}

export async function mailAdvancedManagementRoutes(request: Request, env: Env, dispatchInternal?: InternalPicoSvcDispatch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/mail/')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;
  const signing = url.pathname.match(/^\/api\/picosvc\/mail\/routes\/([0-9a-f-]{36})\/signing-key$/i);
  if (signing) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    const route = await env.DB.prepare('SELECT id FROM mail_routes WHERE id=? AND owner=?').bind(signing[1], owner).first();
    if (!route) return json({ error: 'Mail route not found' }, 404);
    const key = await aesKey(env);
    if (!key) return json({ error: 'Mail signing encryption key is not configured' }, 503);
    const secret = randomSecret('mail_whsec');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferCopy(iv) }, key, new TextEncoder().encode(secret));
    await env.DB.prepare('UPDATE mail_routes SET signing_iv=?,signing_ciphertext=?,updated_at=? WHERE id=? AND owner=?')
      .bind(base64(iv), base64(new Uint8Array(encrypted)), new Date().toISOString(), signing[1], owner).run();
    return json({ routeId: signing[1], signingSecret: secret, format: 'v1=HMAC_SHA256(secret, timestamp + "." + exact_json_body)', headers: ['x-picosvc-mail-timestamp','x-picosvc-mail-signature'], note: 'Secret is returned only on rotation; store it securely.' });
  }
  const details = url.pathname.match(/^\/api\/picosvc\/mail\/events\/([0-9a-f-]{36})(?:\/(retry|attachments\/([0-9a-f-]{36})))?$/i);
  if (details) {
    const event = await env.DB.prepare('SELECT * FROM mail_events WHERE id=? AND owner=?').bind(details[1], owner).first<any>();
    if (!event) return json({ error: 'Mail event not found' }, 404);
    if (details[2] === 'retry') {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      if (event.delivery_status === 'delivered' || event.delivery_status === 'sending' || !event.payload_r2_key) return json({ error: 'Mail event cannot be retried' }, 409);
      await env.DB.prepare("UPDATE mail_events SET delivery_status='retry',next_retry_at=? WHERE id=? AND owner=?")
        .bind(new Date().toISOString(), event.id, owner).run();
      await deliver(env, event.id, dispatchInternal);
      return json({ eventId: event.id, retryRequested: true });
    }
    if (details[2]?.startsWith('attachments/')) {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
      const attachment = await env.DB.prepare('SELECT * FROM mail_attachments WHERE id=? AND event_id=? AND owner=?')
        .bind(details[3], event.id, owner).first<any>();
      if (!attachment || !env.ARTIFACTS) return json({ error: 'Attachment not found' }, 404);
      const object = await env.ARTIFACTS.get(attachment.r2_key);
      if (!object) return json({ error: 'Attachment missing from R2' }, 404);
      const headers = new Headers({ 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
      headers.set('content-disposition', `attachment; filename="${String(attachment.filename).replace(/["\\\r\n]/g, '_')}"`);
      return new Response(object.body, { headers });
    }
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
    const [attachments, deliveryAttempts] = await Promise.all([
      env.DB.prepare('SELECT id,filename,content_type,size_bytes FROM mail_attachments WHERE event_id=? AND owner=? ORDER BY created_at')
        .bind(event.id, owner).all(),
      env.DB.prepare('SELECT attempt_number,response_status,duration_ms,error,attempted_at FROM mail_delivery_attempts WHERE event_id=? AND owner=? ORDER BY attempt_number')
        .bind(event.id, owner).all(),
    ]);
    return json({ event: { id: event.id, routeId: event.route_id, from: event.from_address, to: event.to_address,
      subject: event.subject, rawSize: event.raw_size, deliveryStatus: event.delivery_status, attempts: event.attempts,
      nextRetryAt: event.next_retry_at, responseStatus: event.response_status, error: event.error,
      textPreview: event.text_preview, htmlPreview: event.html_preview, receivedAt: event.received_at },
      attachments: attachments.results || [], deliveryAttempts: deliveryAttempts.results || [] });
  }
  const deleting = url.pathname.match(/^\/api\/picosvc\/mail\/routes\/([0-9a-f-]{36})$/i);
  if (deleting && request.method === 'DELETE') {
    const route = await env.DB.prepare('SELECT id FROM mail_routes WHERE id=? AND owner=?').bind(deleting[1], owner).first<{ id: string }>();
    if (!route) return json({ error: 'Mail route not found' }, 404);
    await deletePrefix(env, `picosvc/mail/${route.id}/`);
    await env.DB.prepare('DELETE FROM mail_routes WHERE id=? AND owner=?').bind(route.id, owner).run();
    return new Response(null, { status: 204 });
  }
  return null;
}

export async function pruneMailR2Owner(env: Env, owner: string): Promise<void> {
  const { limit } = await productLimit(env, owner, 'mail', 'history');
  if (limit === null) return;
  for (;;) {
    const expired = await env.DB.prepare('SELECT id,route_id FROM mail_events WHERE owner=? ORDER BY received_at DESC,id DESC LIMIT 100 OFFSET ?')
      .bind(owner, Math.max(0, limit)).all<{ id: string; route_id: string }>();
    if (!expired.results?.length) break;
    for (const event of expired.results) {
      await deletePrefix(env, `picosvc/mail/${event.route_id}/${event.id}/`);
      await env.DB.prepare('DELETE FROM mail_events WHERE id=? AND owner=?').bind(event.id, owner).run();
    }
  }
}
export async function pruneMailR2Owners(env: Env): Promise<void> {
  const owners = await env.DB.prepare('SELECT owner FROM mail_events GROUP BY owner HAVING COUNT(*)>100 LIMIT 500').all<{ owner: string }>();
  for (const row of owners.results || []) await pruneMailR2Owner(env, row.owner);
}
export async function pruneIncomingMailR2(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const [local, domain] = message.to.trim().toLowerCase().split('@');
  if (!local || domain !== MAIL_DOMAIN || !/^[a-f0-9]{32}$/.test(local)) return;
  const route = await env.DB.prepare('SELECT owner FROM mail_routes WHERE public_id=?').bind(local).first<{ owner: string }>();
  if (route) await pruneMailR2Owner(env, route.owner);
}
