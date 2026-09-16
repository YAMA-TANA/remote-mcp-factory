import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { cleanName, consumeUsage, json, requireIdentity } from './service-utils.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const BLOCKED_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection']);
const REDACTED_REQUEST_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);
const MAX_REQUEST_BODY = 256 * 1024;
const MAX_PREVIEW = 4 * 1024;
const MAX_DELAY_MS = 5_000;

type MockEndpoint = {
  id: string; owner: string; public_id: string; name: string; method: string; path: string;
  status_code: number; content_type: string; headers_json: string; body: string; enabled: number;
};

type MockRule = {
  id: string; endpoint_id: string; owner: string; priority: number; name: string; method: string | null;
  path_glob: string | null; query_json: string; match_headers_json: string; body_contains: string | null;
  status_code: number; content_type: string; response_headers_json: string; response_body: string;
  delay_ms: number; failure_percent: number; enabled: number; created_at: string; updated_at: string;
};

function normalizedPath(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function safeObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'string') continue;
    out[key.toLowerCase()] = raw.slice(0, 8_192);
  }
  return out;
}

function safeResponseHeaders(value: unknown): Record<string, string> {
  const source = safeObject(value);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) if (!BLOCKED_RESPONSE_HEADERS.has(key)) out[key] = value;
  return out;
}

function requestHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    const key = name.toLowerCase();
    if (key.startsWith('cf-') || key === 'host' || key === 'content-length') continue;
    out[key] = REDACTED_REQUEST_HEADERS.has(key) ? '[redacted]' : value.slice(0, 8_192);
  }
  return out;
}

function parseObject(value: string): Record<string, string> {
  try { return safeObject(JSON.parse(value)); } catch { return {}; }
}

function parseAnyObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function matchEndpointPath(pattern: string, requested: string): { ok: boolean; params: Record<string, string> } {
  const wanted = normalizedPath(pattern).split('/').filter(Boolean);
  const actual = normalizedPath(requested).split('/').filter(Boolean);
  if (wanted.length !== actual.length) return { ok: false, params: {} };
  const params: Record<string, string> = {};
  for (let index = 0; index < wanted.length; index += 1) {
    const expected = wanted[index];
    const value = actual[index];
    const parameter = expected.match(/^\{([A-Za-z0-9_-]+)\}$/);
    if (parameter) params[parameter[1]] = decodeURIComponent(value);
    else if (expected !== value) return { ok: false, params: {} };
  }
  return { ok: true, params };
}

function globMatches(glob: string | null, value: string): boolean {
  if (!glob) return true;
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try { return new RegExp(`^${escaped}$`).test(value); } catch { return false; }
}

function ruleMatches(rule: MockRule, request: Request, url: URL, path: string, bodyText: string): boolean {
  if (rule.method && rule.method !== request.method.toUpperCase()) return false;
  if (!globMatches(rule.path_glob, path)) return false;
  const query = parseObject(rule.query_json);
  for (const [key, value] of Object.entries(query)) if (url.searchParams.get(key) !== value) return false;
  const headers = parseObject(rule.match_headers_json);
  for (const [key, value] of Object.entries(headers)) if ((request.headers.get(key) || '') !== value) return false;
  if (rule.body_contains && !bodyText.includes(rule.body_contains)) return false;
  return true;
}

function templateValue(name: string, request: Request, url: URL, pathParams: Record<string, string>, bodyText: string): string {
  if (name === 'method') return request.method.toUpperCase();
  if (name === 'path') return url.pathname;
  if (name === 'body') return bodyText;
  if (name.startsWith('path.')) return pathParams[name.slice(5)] || '';
  if (name.startsWith('query.')) return url.searchParams.get(name.slice(6)) || '';
  if (name.startsWith('header.')) return request.headers.get(name.slice(7)) || '';
  return '';
}

function renderTemplate(value: string, request: Request, url: URL, pathParams: Record<string, string>, bodyText: string): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, name: string) => templateValue(name, request, url, pathParams, bodyText));
}

async function pruneHistory(env: Env, owner: string): Promise<void> {
  const { limit } = await productLimit(env, owner, 'mock', 'history');
  if (limit === null) return;
  await env.DB.prepare(`
    DELETE FROM mock_requests
    WHERE owner=? AND id IN (
      SELECT id FROM mock_requests WHERE owner=? ORDER BY received_at DESC LIMIT -1 OFFSET ?
    )
  `).bind(owner, owner, Math.max(0, limit)).run();
}

async function recordRequest(env: Env, endpoint: MockEndpoint, ruleId: string | null, request: Request, path: string, bodyText: string, status: number): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO mock_requests
      (id,endpoint_id,owner,rule_id,method,path,query_json,headers_json,body_preview,size_bytes,response_status,received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    crypto.randomUUID(), endpoint.id, endpoint.owner, ruleId, request.method.toUpperCase(), path,
    JSON.stringify(Array.from(new URL(request.url).searchParams.entries())), JSON.stringify(requestHeaders(request.headers)),
    bodyText.slice(0, MAX_PREVIEW), new TextEncoder().encode(bodyText).byteLength, status, new Date().toISOString(),
  ).run();
  await pruneHistory(env, endpoint.owner);
}

async function requestBodyText(request: Request): Promise<string> {
  if (request.method === 'GET' || request.method === 'HEAD') return '';
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY) throw new Error('Mock request body exceeds 256 KiB');
  const text = await request.clone().text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY) throw new Error('Mock request body exceeds 256 KiB');
  return text;
}

export async function mockAdvancedRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/mock\/([a-f0-9]{32})(?:\/(.*))?$/i);
  if (!match) return null;
  const endpoint = await env.DB.prepare('SELECT * FROM mock_endpoints WHERE public_id=? AND enabled=1').bind(match[1].toLowerCase()).first<MockEndpoint>();
  if (!endpoint) return json({ error: 'Mock endpoint not found' }, 404);
  const path = normalizedPath(match[2] || '');
  const endpointPath = matchEndpointPath(endpoint.path, path);
  if (!endpointPath.ok) return json({ error: 'Mock endpoint not found' }, 404);
  if (request.method.toUpperCase() !== endpoint.method) return new Response('Method Not Allowed', { status: 405, headers: { allow: endpoint.method } });

  const usage = await consumeUsage(env, endpoint.owner, 'mock', 'requests');
  if (!usage.ok) return json({ error: 'Mock request quota reached', product: 'mock', tier: usage.tier, limit: usage.limit, used: usage.used }, 429);

  let bodyText = '';
  try { bodyText = await requestBodyText(request); }
  catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 413); }

  const rules = await env.DB.prepare('SELECT * FROM mock_rules WHERE endpoint_id=? AND owner=? AND enabled=1 ORDER BY priority ASC, created_at ASC').bind(endpoint.id, endpoint.owner).all<MockRule>();
  const selected = (rules.results || []).find((rule) => ruleMatches(rule, request, url, path, bodyText)) || null;
  const failure = selected && selected.failure_percent > 0 && crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff < selected.failure_percent / 100;
  const status = failure ? 500 : Number(selected?.status_code ?? endpoint.status_code);
  const responseBody = failure ? 'Injected mock failure' : renderTemplate(selected?.response_body ?? endpoint.body, request, url, endpointPath.params, bodyText);
  const responseHeaders = selected ? parseObject(selected.response_headers_json) : parseObject(endpoint.headers_json);
  const contentType = selected?.content_type || endpoint.content_type;
  const delay = Math.max(0, Math.min(MAX_DELAY_MS, Number(selected?.delay_ms || 0)));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

  const headers = new Headers();
  for (const [name, value] of Object.entries(responseHeaders)) if (!BLOCKED_RESPONSE_HEADERS.has(name)) headers.set(name, renderTemplate(value, request, url, endpointPath.params, bodyText));
  if (!headers.has('content-type') && contentType) headers.set('content-type', contentType);
  if (!headers.has('access-control-allow-origin')) headers.set('access-control-allow-origin', '*');
  headers.set('x-picosvc-mock', endpoint.public_id);
  headers.set('x-picosvc-tier', usage.tier);
  if (selected) headers.set('x-picosvc-mock-rule', selected.id);

  await recordRequest(env, endpoint, selected?.id || null, request, path, bodyText, status);
  const noBody = request.method === 'HEAD' || status === 204 || status === 205 || status === 304;
  return new Response(noBody ? null : responseBody, { status, headers });
}

function serializeRule(row: MockRule) {
  return {
    id: row.id, name: row.name, priority: row.priority, method: row.method, pathGlob: row.path_glob,
    query: parseAnyObject(row.query_json), headers: parseAnyObject(row.match_headers_json), bodyContains: row.body_contains,
    statusCode: row.status_code, contentType: row.content_type, responseHeaders: parseAnyObject(row.response_headers_json),
    body: row.response_body, delayMs: row.delay_ms, failurePercent: row.failure_percent, enabled: Boolean(row.enabled),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function ownedEndpoint(env: Env, owner: string, id: string): Promise<MockEndpoint | null> {
  return env.DB.prepare('SELECT * FROM mock_endpoints WHERE id=? AND owner=?').bind(id, owner).first<MockEndpoint>();
}

function normalizeRuleBody(body: Record<string, unknown>, existing?: MockRule) {
  const method = body.method === undefined ? (existing?.method || null) : body.method ? String(body.method).toUpperCase() : null;
  if (method && !METHODS.has(method)) throw new Error('Unsupported rule method');
  const statusCode = body.statusCode === undefined ? Number(existing?.status_code ?? 200) : Number(body.statusCode);
  if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) throw new Error('statusCode must be 200-599');
  const delayMs = Math.max(0, Math.min(MAX_DELAY_MS, Number(body.delayMs === undefined ? existing?.delay_ms || 0 : body.delayMs)));
  const failurePercent = Math.max(0, Math.min(100, Number(body.failurePercent === undefined ? existing?.failure_percent || 0 : body.failurePercent)));
  return {
    name: body.name === undefined ? existing?.name || 'Rule' : cleanName(body.name, existing?.name || 'Rule'),
    priority: Math.max(-100_000, Math.min(100_000, Math.trunc(Number(body.priority === undefined ? existing?.priority || 100 : body.priority)))),
    method,
    pathGlob: body.pathGlob === undefined ? existing?.path_glob || null : body.pathGlob ? String(body.pathGlob).slice(0, 500) : null,
    query: body.query === undefined ? parseAnyObject(existing?.query_json || '{}') : (body.query && typeof body.query === 'object' && !Array.isArray(body.query) ? body.query : {}),
    headers: body.headers === undefined ? parseAnyObject(existing?.match_headers_json || '{}') : safeObject(body.headers),
    bodyContains: body.bodyContains === undefined ? existing?.body_contains || null : body.bodyContains ? String(body.bodyContains).slice(0, 2_000) : null,
    statusCode,
    contentType: body.contentType === undefined ? existing?.content_type || 'application/json; charset=utf-8' : String(body.contentType || 'application/json; charset=utf-8').slice(0, 255),
    responseHeaders: body.responseHeaders === undefined ? parseAnyObject(existing?.response_headers_json || '{}') : safeResponseHeaders(body.responseHeaders),
    responseBody: body.body === undefined ? existing?.response_body || '' : (typeof body.body === 'string' ? body.body : JSON.stringify(body.body)),
    delayMs,
    failurePercent,
    enabled: body.enabled === undefined ? Number(existing?.enabled ?? 1) : body.enabled ? 1 : 0,
  };
}

function responseFromOpenApi(operation: any): { statusCode: number; contentType: string; body: string } {
  const responses = operation?.responses && typeof operation.responses === 'object' ? operation.responses : {};
  const keys = Object.keys(responses);
  const key = keys.find((value) => /^2\d\d$/.test(value)) || keys.find((value) => value === 'default') || '200';
  const statusCode = /^\d{3}$/.test(key) ? Number(key) : 200;
  const response = responses[key] || {};
  const content = response.content && typeof response.content === 'object' ? response.content : {};
  const contentType = Object.keys(content)[0] || 'application/json; charset=utf-8';
  const media = content[contentType] || {};
  let example = media.example ?? media.schema?.example;
  if (example === undefined && media.examples && typeof media.examples === 'object') {
    const sample = (Object.values(media.examples as Record<string, any>) as any[])[0];
    example = sample?.value;
  }
  if (example === undefined) example = { ok: true };
  return { statusCode, contentType, body: typeof example === 'string' ? example : JSON.stringify(example, null, 2) };
}

export async function mockAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/mock/')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  if (url.pathname === '/api/picosvc/mock/import/openapi' && request.method === 'POST') {
    const spec = await request.json().catch(() => null) as any;
    if (!spec?.paths || typeof spec.paths !== 'object') return json({ error: 'OpenAPI document with paths is required' }, 400);
    const candidates: Array<{ method: string; path: string; operation: any }> = [];
    for (const [path, pathItem] of Object.entries(spec.paths as Record<string, any>)) {
      for (const method of ['get','post','put','patch','delete','options','head']) if (pathItem?.[method]) candidates.push({ method: method.toUpperCase(), path, operation: pathItem[method] });
    }
    if (!candidates.length) return json({ error: 'No HTTP operations found in OpenAPI document' }, 400);
    if (candidates.length > 50) return json({ error: 'OpenAPI import is limited to 50 operations at a time' }, 413);
    const { tier, limit } = await productLimit(env, owner, 'mock', 'endpoints');
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM mock_endpoints WHERE owner=?').bind(owner).first<{ count: number }>();
    const used = Number(count?.count || 0);
    if (limit !== null && used + candidates.length > limit) return json({ error: 'OpenAPI import exceeds Mock endpoint limit', tier, limit, used, requested: candidates.length }, 402);
    const now = new Date().toISOString();
    const created: unknown[] = [];
    for (const item of candidates) {
      const id = crypto.randomUUID(); const publicId = crypto.randomUUID().replaceAll('-', '');
      const path = normalizedPath(item.path);
      const response = responseFromOpenApi(item.operation);
      const name = cleanName(item.operation?.summary || item.operation?.operationId || `${item.method} ${item.path}`, `${item.method} ${item.path}`);
      await env.DB.prepare(`INSERT INTO mock_endpoints (id,owner,public_id,name,method,path,status_code,content_type,headers_json,body,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`)
        .bind(id, owner, publicId, name, item.method, path, response.statusCode, response.contentType, '{}', response.body, now, now).run();
      created.push({ id, publicId, name, method: item.method, path, endpoint: `${url.origin}/mock/${publicId}/${path}`, statusCode: response.statusCode });
    }
    return json({ imported: created.length, endpoints: created }, 201);
  }

  const listMatch = url.pathname.match(/^\/api\/picosvc\/mock\/endpoints\/([0-9a-f-]{36})\/(rules|requests)$/i);
  if (listMatch) {
    const endpoint = await ownedEndpoint(env, owner, listMatch[1]);
    if (!endpoint) return json({ error: 'Mock endpoint not found' }, 404);
    if (listMatch[2] === 'requests') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
      const requested = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50)));
      const rows = await env.DB.prepare('SELECT * FROM mock_requests WHERE endpoint_id=? AND owner=? ORDER BY received_at DESC LIMIT ?').bind(endpoint.id, owner, requested).all<any>();
      return json({ endpointId: endpoint.id, requests: (rows.results || []).map((row) => ({ id: row.id, ruleId: row.rule_id, method: row.method, path: row.path, query: JSON.parse(row.query_json || '[]'), headers: JSON.parse(row.headers_json || '{}'), bodyPreview: row.body_preview, sizeBytes: row.size_bytes, responseStatus: row.response_status, receivedAt: row.received_at })) });
    }
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM mock_rules WHERE endpoint_id=? AND owner=? ORDER BY priority ASC, created_at ASC').bind(endpoint.id, owner).all<MockRule>();
      return json({ endpointId: endpoint.id, rules: (rows.results || []).map(serializeRule) });
    }
    if (request.method === 'POST') {
      const { tier, limit } = await productLimit(env, owner, 'mock', 'rules');
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM mock_rules WHERE owner=?').bind(owner).first<{ count: number }>();
      if (limit !== null && Number(count?.count || 0) >= limit) return json({ error: 'Mock rule limit reached', tier, limit, used: Number(count?.count || 0) }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return json({ error: 'JSON body required' }, 400);
      let normalized; try { normalized = normalizeRuleBody(body); } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 400); }
      if (new TextEncoder().encode(normalized.responseBody).byteLength > 256 * 1024) return json({ error: 'Mock rule response body is limited to 256 KiB' }, 413);
      const id = crypto.randomUUID(); const now = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO mock_rules (id,endpoint_id,owner,priority,name,method,path_glob,query_json,match_headers_json,body_contains,status_code,content_type,response_headers_json,response_body,delay_ms,failure_percent,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, endpoint.id, owner, normalized.priority, normalized.name, normalized.method, normalized.pathGlob, JSON.stringify(normalized.query), JSON.stringify(normalized.headers), normalized.bodyContains, normalized.statusCode, normalized.contentType, JSON.stringify(normalized.responseHeaders), normalized.responseBody, normalized.delayMs, normalized.failurePercent, normalized.enabled, now, now).run();
      const row = await env.DB.prepare('SELECT * FROM mock_rules WHERE id=? AND owner=?').bind(id, owner).first<MockRule>();
      return json({ tier, rule: row ? serializeRule(row) : null }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const ruleMatch = url.pathname.match(/^\/api\/picosvc\/mock\/endpoints\/([0-9a-f-]{36})\/rules\/([0-9a-f-]{36})$/i);
  if (ruleMatch) {
    const endpoint = await ownedEndpoint(env, owner, ruleMatch[1]);
    if (!endpoint) return json({ error: 'Mock endpoint not found' }, 404);
    const row = await env.DB.prepare('SELECT * FROM mock_rules WHERE id=? AND endpoint_id=? AND owner=?').bind(ruleMatch[2], endpoint.id, owner).first<MockRule>();
    if (!row) return json({ error: 'Mock rule not found' }, 404);
    if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM mock_rules WHERE id=? AND owner=?').bind(row.id, owner).run(); return new Response(null, { status: 204 }); }
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body) return json({ error: 'JSON body required' }, 400);
      let normalized; try { normalized = normalizeRuleBody(body, row); } catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 400); }
      if (new TextEncoder().encode(normalized.responseBody).byteLength > 256 * 1024) return json({ error: 'Mock rule response body is limited to 256 KiB' }, 413);
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE mock_rules SET priority=?,name=?,method=?,path_glob=?,query_json=?,match_headers_json=?,body_contains=?,status_code=?,content_type=?,response_headers_json=?,response_body=?,delay_ms=?,failure_percent=?,enabled=?,updated_at=? WHERE id=? AND owner=?`)
        .bind(normalized.priority, normalized.name, normalized.method, normalized.pathGlob, JSON.stringify(normalized.query), JSON.stringify(normalized.headers), normalized.bodyContains, normalized.statusCode, normalized.contentType, JSON.stringify(normalized.responseHeaders), normalized.responseBody, normalized.delayMs, normalized.failurePercent, normalized.enabled, now, row.id, owner).run();
      const updated = await env.DB.prepare('SELECT * FROM mock_rules WHERE id=? AND owner=?').bind(row.id, owner).first<MockRule>();
      return json(updated ? serializeRule(updated) : null);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'PATCH,DELETE' } });
  }

  return null;
}
