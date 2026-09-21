import { clerkIdentity } from '../auth.js';
import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { consumeUsage } from './service-utils.js';

interface MockEndpointRow {
  id: string;
  owner: string;
  public_id: string;
  name: string;
  method: string;
  path: string;
  status_code: number;
  content_type: string;
  headers_json: string;
  body: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const BLOCKED_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection']);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function normalizedPath(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^\/+|\/+$/g, '');
}

function safeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim().toLowerCase();
    if (!name || BLOCKED_RESPONSE_HEADERS.has(name) || typeof raw !== 'string') continue;
    result[name] = raw.slice(0, 8_192);
  }
  return result;
}

function serialize(row: MockEndpointRow, origin: string) {
  const suffix = row.path ? `/${row.path}` : '';
  return {
    id: row.id,
    name: row.name,
    method: row.method,
    path: row.path,
    statusCode: row.status_code,
    contentType: row.content_type,
    headers: (() => { try { return JSON.parse(row.headers_json); } catch { return {}; } })(),
    body: row.body,
    enabled: Boolean(row.enabled),
    endpoint: `${origin}/mock/${row.public_id}${suffix}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ownedEndpoint(env: Env, owner: string, id: string): Promise<MockEndpointRow | null> {
  return env.DB.prepare('SELECT * FROM mock_endpoints WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<MockEndpointRow>();
}

export async function mockRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/mock\/([a-f0-9]{32})(?:\/(.*))?$/);
  if (!match) return null;

  const row = await env.DB.prepare('SELECT * FROM mock_endpoints WHERE public_id=? AND enabled=1')
    .bind(match[1])
    .first<MockEndpointRow>();
  if (!row) return json({ error: 'Mock endpoint not found' }, 404);

  const requestedPath = normalizedPath(match[2] || '');
  if (requestedPath !== row.path) return json({ error: 'Mock endpoint not found' }, 404);
  if (request.method.toUpperCase() !== row.method) {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: row.method } });
  }

  const usage = await consumeUsage(env, row.owner, 'mock', 'requests');
  if (!usage.ok) {
    return json({ error: 'Mock request quota reached', product: 'mock', tier: usage.tier, limit: usage.limit, used: usage.used }, 429);
  }

  const headers = new Headers();
  let configured: Record<string, string> = {};
  try { configured = JSON.parse(row.headers_json || '{}'); } catch {}
  for (const [key, value] of Object.entries(configured)) {
    if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) headers.set(key, String(value));
  }
  if (!headers.has('content-type') && row.content_type) headers.set('content-type', row.content_type);
  if (!headers.has('access-control-allow-origin')) headers.set('access-control-allow-origin', '*');
  headers.set('x-picosvc-mock', row.public_id);
  headers.set('x-picosvc-tier', usage.tier);

  const noBody = request.method === 'HEAD' || NULL_BODY_STATUSES.has(row.status_code);
  return new Response(noBody ? null : row.body, { status: row.status_code, headers });
}

export async function mockManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/mock/')) return null;

  const identity = await clerkIdentity(request, env);
  if (!identity) return json({ error: 'Authentication required', signInUrl: env.CLERK_SIGN_IN_URL || null }, 401);
  const owner = identity.ownerId;
  const origin = url.origin;

  if (url.pathname === '/api/picosvc/mock/endpoints' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM mock_endpoints WHERE owner=? ORDER BY created_at DESC')
      .bind(owner)
      .all<MockEndpointRow>();
    const { tier, limit } = await productLimit(env, owner, 'mock', 'endpoints');
    return json({ tier, limit, endpoints: (rows.results || []).map((row) => serialize(row, origin)) });
  }

  if (url.pathname === '/api/picosvc/mock/endpoints' && request.method === 'POST') {
    const { tier, limit } = await productLimit(env, owner, 'mock', 'endpoints');
    const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM mock_endpoints WHERE owner=?')
      .bind(owner)
      .first<{ count: number }>();
    const used = Number(countRow?.count || 0);
    if (limit !== null && used >= limit) {
      return json({ error: 'Mock endpoint limit reached', product: 'mock', tier, limit, used }, 402);
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: 'JSON body required' }, 400);

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const method = typeof body.method === 'string' ? body.method.trim().toUpperCase() : 'GET';
    const path = normalizedPath(body.path);
    const statusCode = Number(body.statusCode ?? 200);
    const contentType = typeof body.contentType === 'string' && body.contentType.trim()
      ? body.contentType.trim().slice(0, 255)
      : 'application/json; charset=utf-8';
    const responseBody = typeof body.body === 'string' ? body.body : JSON.stringify(body.body ?? {});
    const headers = safeHeaders(body.headers);
    const enabled = body.enabled === false ? 0 : 1;

    if (!name) return json({ error: 'name is required' }, 400);
    if (!METHODS.has(method)) return json({ error: 'Unsupported HTTP method' }, 400);
    if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) return json({ error: 'statusCode must be 200-599' }, 400);
    if (path.length > 500) return json({ error: 'path is too long' }, 400);
    if (responseBody.length > 256 * 1024) return json({ error: 'Mock response body is limited to 256 KiB' }, 413);

    const id = crypto.randomUUID();
    const publicId = crypto.randomUUID().replaceAll('-', '');
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO mock_endpoints
        (id, owner, public_id, name, method, path, status_code, content_type, headers_json, body, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, owner, publicId, name, method, path, statusCode, contentType, JSON.stringify(headers), responseBody, enabled, now, now).run();

    const row = await ownedEndpoint(env, owner, id);
    return json({ tier, limit, endpoint: row ? serialize(row, origin) : null }, 201);
  }

  const itemMatch = url.pathname.match(/^\/api\/picosvc\/mock\/endpoints\/([0-9a-f-]{36})$/i);
  if (!itemMatch) return null;
  const row = await ownedEndpoint(env, owner, itemMatch[1]);
  if (!row) return json({ error: 'Mock endpoint not found' }, 404);

  if (request.method === 'GET') return json(serialize(row, origin));

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM mock_endpoints WHERE id=? AND owner=?').bind(row.id, owner).run();
    return new Response(null, { status: 204 });
  }

  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: 'JSON body required' }, 400);

    const name = body.name === undefined ? row.name : String(body.name).trim().slice(0, 120);
    const method = body.method === undefined ? row.method : String(body.method).trim().toUpperCase();
    const path = body.path === undefined ? row.path : normalizedPath(body.path);
    const statusCode = body.statusCode === undefined ? row.status_code : Number(body.statusCode);
    const contentType = body.contentType === undefined ? row.content_type : String(body.contentType).trim().slice(0, 255);
    const responseBody = body.body === undefined ? row.body : (typeof body.body === 'string' ? body.body : JSON.stringify(body.body));
    const existingHeaders = (() => { try { return JSON.parse(row.headers_json); } catch { return {}; } })();
    const headers = body.headers === undefined ? existingHeaders : safeHeaders(body.headers);
    const enabled = body.enabled === undefined ? row.enabled : (body.enabled ? 1 : 0);

    if (!name) return json({ error: 'name is required' }, 400);
    if (!METHODS.has(method)) return json({ error: 'Unsupported HTTP method' }, 400);
    if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) return json({ error: 'statusCode must be 200-599' }, 400);
    if (path.length > 500) return json({ error: 'path is too long' }, 400);
    if (responseBody.length > 256 * 1024) return json({ error: 'Mock response body is limited to 256 KiB' }, 413);

    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE mock_endpoints
      SET name=?, method=?, path=?, status_code=?, content_type=?, headers_json=?, body=?, enabled=?, updated_at=?
      WHERE id=? AND owner=?
    `).bind(name, method, path, statusCode, contentType || 'application/json; charset=utf-8', JSON.stringify(headers), responseBody, enabled, now, row.id, owner).run();

    const updated = await ownedEndpoint(env, owner, row.id);
    return json(updated ? serialize(updated, origin) : null);
  }

  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,PATCH,DELETE' } });
}
