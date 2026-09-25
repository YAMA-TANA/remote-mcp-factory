import type { Env } from '../types.js';
import { hooksManagementRoutes, hooksRuntimeRoute, safeReplayUrl } from './hooks.js';
import { json, requireIdentity } from './service-utils.js';
import { safePublicUrl } from './security.js';
import { fetchPicoSvcTarget, type InternalPicoSvcDispatch } from './internal-dispatch.js';

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function parseObject(value: string | null | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function safeResponseHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const blocked = new Set(['content-length','transfer-encoding','connection']);
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const name = rawName.toLowerCase().trim();
    if (!name || blocked.has(name) || typeof rawValue !== 'string') continue;
    result[name] = rawValue.slice(0, 8_192);
  }
  return result;
}

async function eventBody(env: Env, event: any): Promise<Uint8Array> {
  if (event.body_r2_key && env.ARTIFACTS) {
    const object = await env.ARTIFACTS.get(event.body_r2_key);
    if (object) return new Uint8Array(await object.arrayBuffer());
  }
  return decodeBase64(event.body_base64 || '');
}

async function recordDelivery(env: Env, event: any, kind: 'forward' | 'replay', targetUrl: string, status: number | null, durationMs: number, error: string | null): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO webhook_deliveries
      (id,event_id,inbox_id,owner,kind,target_url,response_status,duration_ms,error,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(crypto.randomUUID(), event.id, event.inbox_id, event.owner, kind, targetUrl, status, durationMs, error, new Date().toISOString()).run();
}

async function forwardStoredEvent(env: Env, event: any, inbox: any, dispatchInternal?: InternalPicoSvcDispatch, requestOrigin?: string): Promise<void> {
  const target = safePublicUrl(inbox.forward_url);
  if (!target) return;
  const bytes = await eventBody(env, event);
  const headers = new Headers();
  for (const [name, value] of Object.entries(parseObject(event.headers_json))) {
    if (value === '[redacted]' || name === 'authorization' || name === 'cookie' || name === 'host' || name.startsWith('cf-')) continue;
    headers.set(name, value);
  }
  headers.set('x-picosvc-forwarded-event', event.id);
  const started = Date.now();
  let status: number | null = null;
  let error: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const method = String(event.method || 'POST').toUpperCase();
    const response = await fetchPicoSvcTarget(target, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : asArrayBuffer(bytes),
      redirect: 'manual',
      signal: controller.signal,
    }, env, dispatchInternal, requestOrigin);
    status = response.status;
    if (!response.ok) error = `Forward returned HTTP ${response.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 1_000) : String(err).slice(0, 1_000);
  } finally {
    clearTimeout(timer);
  }
  await recordDelivery(env, event, 'forward', target.toString(), status, Date.now() - started, error);
}

function customResponse(inbox: any, eventId: string): Response | null {
  if (inbox.response_status === null || inbox.response_status === undefined) return null;
  const status = Math.max(200, Math.min(599, Number(inbox.response_status)));
  const headers = new Headers(safeResponseHeaders(parseObject(inbox.response_headers_json)));
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('x-picosvc-event-id', eventId);
  const body = String(inbox.response_body ?? '').replace(/\{\{\s*eventId\s*\}\}/g, eventId);
  return new Response(status === 204 || status === 205 || status === 304 ? null : body, { status, headers });
}

export async function hooksAdvancedRuntimeRoute(request: Request, env: Env, dispatchInternal?: InternalPicoSvcDispatch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!/^\/hooks\/[a-f0-9]{32}(?:\/.*)?$/i.test(url.pathname)) return null;
  const response = await hooksRuntimeRoute(request, env);
  if (!response || response.status !== 202) return response;
  const payload = await response.clone().json().catch(() => null) as { eventId?: string } | null;
  if (!payload?.eventId) return response;
  const row = await env.DB.prepare(`
    SELECT e.*, i.forward_url, i.response_status, i.response_headers_json, i.response_body
    FROM webhook_events e JOIN webhook_inboxes i ON i.id=e.inbox_id
    WHERE e.id=?
  `).bind(payload.eventId).first<any>();
  if (!row) return response;
  if (row.forward_url) await forwardStoredEvent(env, row, row, dispatchInternal, url.origin);
  return customResponse(row, row.id) || response;
}

async function hmacSha256(secret: string, bytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, asArrayBuffer(bytes)));
  return Array.from(signature).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) diff |= (left[index] || 0) ^ (right[index] || 0);
  return diff === 0;
}

export async function hooksAdvancedManagementRoutes(request: Request, env: Env, dispatchInternal?: InternalPicoSvcDispatch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/hooks/')) return null;

  const replayMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/events\/([0-9a-f-]{36})\/replay$/i);
  if (replayMatch && request.method === 'POST') {
    const cloned = request.clone();
    const authRequest = new Request(cloned.url, { method: 'GET', headers: cloned.headers });
    const started = Date.now();
    const response = await hooksManagementRoutes(request, env, dispatchInternal);
    if (!response) return null;
    const identity = await requireIdentity(authRequest, env);
    if (!(identity instanceof Response)) {
      const event = await env.DB.prepare('SELECT * FROM webhook_events WHERE id=? AND owner=?').bind(replayMatch[1], identity.ownerId).first<any>();
      const body = await cloned.json().catch(() => null) as Record<string, unknown> | null;
      const target = safeReplayUrl(body?.url)?.toString();
      if (event && target) {
        const result = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
        const status = typeof result?.status === 'number' ? result.status : null;
        const error = response.ok ? null : String(result?.error || `Replay HTTP ${response.status}`).slice(0, 1_000);
        await recordDelivery(env, event, 'replay', target, status, Date.now() - started, error);
      }
    }
    return response;
  }

  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  const settingsMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/inboxes\/([0-9a-f-]{36})\/settings$/i);
  if (settingsMatch) {
    const inbox = await env.DB.prepare('SELECT * FROM webhook_inboxes WHERE id=? AND owner=?').bind(settingsMatch[1], owner).first<any>();
    if (!inbox) return json({ error: 'Webhook inbox not found' }, 404);
    if (request.method === 'GET') return json({
      inboxId: inbox.id,
      forwardUrl: inbox.forward_url || null,
      responseStatus: inbox.response_status ?? null,
      responseHeaders: parseObject(inbox.response_headers_json),
      responseBody: inbox.response_body ?? null,
    });
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return json({ error: 'JSON body required' }, 400);
      const forward = body.forwardUrl === undefined ? inbox.forward_url : body.forwardUrl ? safePublicUrl(body.forwardUrl) : null;
      if (body.forwardUrl && !forward) return json({ error: 'forwardUrl must be a public HTTP(S) URL' }, 400);
      const responseStatus = body.responseStatus === undefined ? inbox.response_status : body.responseStatus === null ? null : Number(body.responseStatus);
      if (responseStatus !== null && (!Number.isInteger(responseStatus) || responseStatus < 200 || responseStatus > 599)) return json({ error: 'responseStatus must be null or 200-599' }, 400);
      const responseHeaders = body.responseHeaders === undefined ? parseObject(inbox.response_headers_json) : safeResponseHeaders(body.responseHeaders);
      const responseBody = body.responseBody === undefined ? inbox.response_body : body.responseBody === null ? null : String(body.responseBody).slice(0, 64 * 1024);
      await env.DB.prepare('UPDATE webhook_inboxes SET forward_url=?,response_status=?,response_headers_json=?,response_body=?,updated_at=? WHERE id=? AND owner=?')
        .bind(forward ? forward.toString() : null, responseStatus, JSON.stringify(responseHeaders), responseBody, new Date().toISOString(), inbox.id, owner).run();
      return json({ inboxId: inbox.id, forwardUrl: forward ? forward.toString() : null, responseStatus, responseHeaders, responseBody });
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PATCH' } });
  }

  const searchMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/inboxes\/([0-9a-f-]{36})\/search$/i);
  if (searchMatch && request.method === 'GET') {
    const inbox = await env.DB.prepare('SELECT id FROM webhook_inboxes WHERE id=? AND owner=?').bind(searchMatch[1], owner).first<any>();
    if (!inbox) return json({ error: 'Webhook inbox not found' }, 404);
    const q = (url.searchParams.get('q') || '').slice(0, 200);
    const method = (url.searchParams.get('method') || '').toUpperCase();
    const requested = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50)));
    const pattern = `%${q.replace(/[%_]/g, '')}%`;
    const rows = await env.DB.prepare(`
      SELECT id,method,path,query_json,headers_json,content_type,body_preview,size_bytes,received_at
      FROM webhook_events
      WHERE inbox_id=? AND owner=?
        AND (?='' OR method=?)
        AND (?='' OR path LIKE ? OR body_preview LIKE ? OR content_type LIKE ?)
      ORDER BY received_at DESC LIMIT ?
    `).bind(inbox.id, owner, method, method, q, pattern, pattern, pattern, requested).all<any>();
    return json({ events: rows.results || [] });
  }

  const deliveriesMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/events\/([0-9a-f-]{36})\/deliveries$/i);
  if (deliveriesMatch && request.method === 'GET') {
    const event = await env.DB.prepare('SELECT id FROM webhook_events WHERE id=? AND owner=?').bind(deliveriesMatch[1], owner).first<any>();
    if (!event) return json({ error: 'Webhook event not found' }, 404);
    const rows = await env.DB.prepare('SELECT * FROM webhook_deliveries WHERE event_id=? AND owner=? ORDER BY created_at DESC LIMIT 100').bind(event.id, owner).all();
    return json({ eventId: event.id, deliveries: rows.results || [] });
  }

  const verifyMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/events\/([0-9a-f-]{36})\/verify-hmac$/i);
  if (verifyMatch && request.method === 'POST') {
    const event = await env.DB.prepare('SELECT * FROM webhook_events WHERE id=? AND owner=?').bind(verifyMatch[1], owner).first<any>();
    if (!event) return json({ error: 'Webhook event not found' }, 404);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const secret = typeof body?.secret === 'string' ? body.secret : '';
    const headerName = typeof body?.headerName === 'string' ? body.headerName.toLowerCase() : 'x-signature';
    const prefix = typeof body?.prefix === 'string' ? body.prefix : 'sha256=';
    if (!secret || secret.length > 4_096) return json({ error: 'secret is required and limited to 4096 characters' }, 400);
    const provided = parseObject(event.headers_json)[headerName] || '';
    if (!provided || provided === '[redacted]') return json({ valid: false, reason: 'signature_header_missing', headerName });
    const expected = `${prefix}${await hmacSha256(secret, await eventBody(env, event))}`;
    return json({ valid: constantTimeEqual(provided.trim(), expected), headerName, algorithm: 'hmac-sha256' });
  }

  return null;
}
