import { clerkIdentity } from '../auth.js';
import type { Env } from '../types.js';
import { incrementProductUsage, monthKey, productLimit } from './entitlements.js';

interface WebhookInboxRow {
  id: string;
  owner: string;
  public_id: string;
  name: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface WebhookEventRow {
  id: string;
  inbox_id: string;
  owner: string;
  method: string;
  path: string;
  query_json: string;
  headers_json: string;
  content_type: string | null;
  body_base64: string;
  body_preview: string;
  size_bytes: number;
  received_at: string;
}

const MAX_BODY_BYTES = 512 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024;
const MAX_LIST_LIMIT = 100;
const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);
const DROPPED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding']);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function requestHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of headers.entries()) {
    const name = rawName.toLowerCase();
    if (name.startsWith('cf-') || DROPPED_HEADERS.has(name)) continue;
    if (REDACTED_HEADERS.has(name)) {
      result[name] = '[redacted]';
      continue;
    }
    result[name] = rawValue.slice(0, 16_384);
  }
  return result;
}

function parseJsonObject(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonPairs(value: string): Array<[string, string]> {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function preview(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, MAX_PREVIEW_BYTES));
}

function inboxEndpoint(origin: string, publicId: string): string {
  return `${origin}/hooks/${publicId}`;
}

function serializeInbox(row: WebhookInboxRow, origin: string, eventCount?: number, latestAt?: string | null) {
  return {
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    endpoint: inboxEndpoint(origin, row.public_id),
    eventCount: eventCount ?? 0,
    latestEventAt: latestAt ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeEvent(row: WebhookEventRow, includeBody = false) {
  return {
    id: row.id,
    inboxId: row.inbox_id,
    method: row.method,
    path: row.path,
    query: parseJsonPairs(row.query_json),
    headers: parseJsonObject(row.headers_json),
    contentType: row.content_type,
    bodyPreview: row.body_preview,
    ...(includeBody ? { bodyBase64: row.body_base64 } : {}),
    sizeBytes: row.size_bytes,
    receivedAt: row.received_at,
  };
}

async function ownedInbox(env: Env, owner: string, id: string): Promise<WebhookInboxRow | null> {
  return env.DB.prepare('SELECT * FROM webhook_inboxes WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<WebhookInboxRow>();
}

async function ownedEvent(env: Env, owner: string, id: string): Promise<WebhookEventRow | null> {
  return env.DB.prepare('SELECT * FROM webhook_events WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<WebhookEventRow>();
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return false;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes(':')) return false;
  return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb');
}

export function safeReplayUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
  if (hostname === 'metadata.google.internal' || hostname === 'metadata') return null;
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return null;
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (port !== '80' && port !== '443') return null;
  return url;
}

export async function hooksRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/hooks\/([a-f0-9]{32})(?:\/(.*))?$/i);
  if (!match) return null;

  const inbox = await env.DB.prepare('SELECT * FROM webhook_inboxes WHERE public_id=? AND enabled=1')
    .bind(match[1].toLowerCase())
    .first<WebhookInboxRow>();
  if (!inbox) return json({ error: 'Webhook inbox not found' }, 404);

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: 'Webhook body is limited to 512 KiB' }, 413);
  }

  const { tier, limit } = await productLimit(env, inbox.owner, 'hooks', 'events');
  const usage = await env.DB.prepare(`
    SELECT quantity FROM product_usage_monthly
    WHERE owner=? AND product='hooks' AND metric='events' AND month=?
  `).bind(inbox.owner, monthKey()).first<{ quantity: number }>();
  const used = Number(usage?.quantity || 0);
  if (limit !== null && used >= limit) {
    return json({ error: 'Webhook event quota reached', product: 'hooks', tier, limit }, 429);
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) return json({ error: 'Webhook body is limited to 512 KiB' }, 413);
  const bytes = new Uint8Array(buffer);
  const id = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const path = match[2] ? `/${match[2]}` : '';
  const query = Array.from(url.searchParams.entries());
  const headers = requestHeaders(request.headers);

  await env.DB.prepare(`
    INSERT INTO webhook_events
      (id, inbox_id, owner, method, path, query_json, headers_json, content_type, body_base64, body_preview, size_bytes, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    inbox.id,
    inbox.owner,
    request.method.toUpperCase(),
    path,
    JSON.stringify(query),
    JSON.stringify(headers),
    request.headers.get('content-type'),
    encodeBase64(bytes),
    preview(bytes),
    bytes.byteLength,
    receivedAt,
  ).run();
  await incrementProductUsage(env, inbox.owner, 'hooks', 'events', 1);

  return json({ received: true, eventId: id }, 202);
}

export async function hooksManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/hooks/')) return null;

  const identity = await clerkIdentity(request, env);
  if (!identity) return json({ error: 'Authentication required', signInUrl: env.CLERK_SIGN_IN_URL || null }, 401);
  const owner = identity.ownerId;
  const origin = url.origin;

  if (url.pathname === '/api/picosvc/hooks/inboxes' && request.method === 'GET') {
    const rows = await env.DB.prepare(`
      SELECT i.*,
        COUNT(e.id) AS event_count,
        MAX(e.received_at) AS latest_event_at
      FROM webhook_inboxes i
      LEFT JOIN webhook_events e ON e.inbox_id=i.id
      WHERE i.owner=?
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).bind(owner).all<WebhookInboxRow & { event_count: number; latest_event_at: string | null }>();
    const { tier, limit } = await productLimit(env, owner, 'hooks', 'events');
    const usage = await env.DB.prepare(`
      SELECT quantity FROM product_usage_monthly
      WHERE owner=? AND product='hooks' AND metric='events' AND month=?
    `).bind(owner, monthKey()).first<{ quantity: number }>();
    return json({
      tier,
      monthlyEventLimit: limit,
      monthlyEventsUsed: Number(usage?.quantity || 0),
      inboxes: (rows.results || []).map((row) => serializeInbox(row, origin, Number(row.event_count || 0), row.latest_event_at)),
    });
  }

  if (url.pathname === '/api/picosvc/hooks/inboxes' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!name) return json({ error: 'name is required' }, 400);
    const id = crypto.randomUUID();
    const publicId = crypto.randomUUID().replaceAll('-', '');
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO webhook_inboxes (id, owner, public_id, name, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).bind(id, owner, publicId, name, now, now).run();
    const row = await ownedInbox(env, owner, id);
    return json(row ? serializeInbox(row, origin) : null, 201);
  }

  const eventReplayMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/events\/([0-9a-f-]{36})\/replay$/i);
  if (eventReplayMatch && request.method === 'POST') {
    const event = await ownedEvent(env, owner, eventReplayMatch[1]);
    if (!event) return json({ error: 'Webhook event not found' }, 404);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const target = safeReplayUrl(body?.url);
    if (!target) return json({ error: 'Replay URL must be a public HTTP(S) URL on port 80 or 443' }, 400);

    const headers = new Headers();
    for (const [name, value] of Object.entries(parseJsonObject(event.headers_json))) {
      if (value === '[redacted]' || REDACTED_HEADERS.has(name) || DROPPED_HEADERS.has(name) || name.startsWith('cf-')) continue;
      headers.set(name, value);
    }
    headers.set('x-picosvc-replay', event.id);

    const bytes = decodeBase64(event.body_base64);
    const replayBody = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(replayBody).set(bytes);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const method = event.method.toUpperCase();
      const replay = await fetch(target.toString(), {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : replayBody,
        redirect: 'manual',
        signal: controller.signal,
      });
      return json({
        ok: replay.ok,
        status: replay.status,
        statusText: replay.statusText,
        location: replay.headers.get('location'),
        target: target.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: 'Replay request failed', detail: message }, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  const eventMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/events\/([0-9a-f-]{36})$/i);
  if (eventMatch) {
    const event = await ownedEvent(env, owner, eventMatch[1]);
    if (!event) return json({ error: 'Webhook event not found' }, 404);
    if (request.method === 'GET') return json(serializeEvent(event, true));
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM webhook_events WHERE id=? AND owner=?').bind(event.id, owner).run();
      return new Response(null, { status: 204 });
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,DELETE' } });
  }

  const inboxEventsMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/inboxes\/([0-9a-f-]{36})\/events$/i);
  if (inboxEventsMatch && request.method === 'GET') {
    const inbox = await ownedInbox(env, owner, inboxEventsMatch[1]);
    if (!inbox) return json({ error: 'Webhook inbox not found' }, 404);
    const requested = Number(url.searchParams.get('limit') || '50');
    const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, Number.isFinite(requested) ? Math.floor(requested) : 50));
    const before = url.searchParams.get('before');
    const query = before
      ? env.DB.prepare('SELECT * FROM webhook_events WHERE inbox_id=? AND owner=? AND received_at<? ORDER BY received_at DESC LIMIT ?').bind(inbox.id, owner, before, limit + 1)
      : env.DB.prepare('SELECT * FROM webhook_events WHERE inbox_id=? AND owner=? ORDER BY received_at DESC LIMIT ?').bind(inbox.id, owner, limit + 1);
    const rows = await query.all<WebhookEventRow>();
    const results = rows.results || [];
    const hasMore = results.length > limit;
    const page = results.slice(0, limit);
    return json({
      inbox: serializeInbox(inbox, origin),
      events: page.map((row) => serializeEvent(row)),
      nextBefore: hasMore && page.length ? page[page.length - 1].received_at : null,
    });
  }

  const inboxMatch = url.pathname.match(/^\/api\/picosvc\/hooks\/inboxes\/([0-9a-f-]{36})$/i);
  if (!inboxMatch) return null;
  const inbox = await ownedInbox(env, owner, inboxMatch[1]);
  if (!inbox) return json({ error: 'Webhook inbox not found' }, 404);

  if (request.method === 'GET') return json(serializeInbox(inbox, origin));
  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: 'JSON body required' }, 400);
    const name = body.name === undefined ? inbox.name : String(body.name).trim().slice(0, 120);
    const enabled = body.enabled === undefined ? inbox.enabled : (body.enabled ? 1 : 0);
    if (!name) return json({ error: 'name is required' }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE webhook_inboxes SET name=?, enabled=?, updated_at=? WHERE id=? AND owner=?')
      .bind(name, enabled, now, inbox.id, owner).run();
    const updated = await ownedInbox(env, owner, inbox.id);
    return json(updated ? serializeInbox(updated, origin) : null);
  }
  if (request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM webhook_events WHERE inbox_id=? AND owner=?').bind(inbox.id, owner),
      env.DB.prepare('DELETE FROM webhook_inboxes WHERE id=? AND owner=?').bind(inbox.id, owner),
    ]);
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PATCH,DELETE' } });
}
