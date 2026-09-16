import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { safeReplayUrl } from './hooks.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { sha256Hex } from './security.js';

const MAX_JSON_BYTES = 256 * 1024;
const MIN_RETAINED_HISTORY_LIMIT = 100;

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function safeObjectPath(value: string): string | null {
  const normalized = value.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!normalized || normalized.length > 512 || normalized.includes('..') || /[\x00-\x1f]/.test(normalized)) return null;
  return normalized;
}

function safeJsonKey(value: string): string | null {
  const valueDecoded = decoded(value);
  return valueDecoded && valueDecoded.length <= 200 && /^[A-Za-z0-9._:@/-]+$/.test(valueDecoded) ? valueDecoded : null;
}

function bearerToken(request: Request): string {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

async function jsonWriteGuard(
  request: Request,
  env: Env,
  owner: string,
  storeId: string,
  key: string,
): Promise<Response | null> {
  let text: string;
  try {
    text = await request.clone().text();
  } catch {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }

  const valueJson = JSON.stringify(value);
  const valueBytes = new TextEncoder().encode(valueJson).byteLength;
  if (valueBytes > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);

  const [documentPlan, storagePlan, aggregate, existing] = await Promise.all([
    productLimit(env, owner, 'json', 'documents'),
    productLimit(env, owner, 'json', 'storageBytes'),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS documents,
        COALESCE(SUM(LENGTH(CAST(d.value_json AS BLOB))), 0) AS bytes
      FROM json_documents d
      JOIN json_stores s ON s.id=d.store_id
      WHERE s.owner=?
    `).bind(owner).first<{ documents: number; bytes: number }>(),
    env.DB.prepare('SELECT LENGTH(CAST(value_json AS BLOB)) AS bytes FROM json_documents WHERE store_id=? AND key=?')
      .bind(storeId, key).first<{ bytes: number }>(),
  ]);

  const documentsUsed = Number(aggregate?.documents || 0);
  const storageUsed = Number(aggregate?.bytes || 0);
  const existingBytes = Number(existing?.bytes || 0);
  const projectedDocuments = documentsUsed + (existing ? 0 : 1);
  const projectedStorageBytes = storageUsed - existingBytes + valueBytes;

  if (documentPlan.limit !== null && projectedDocuments > documentPlan.limit) {
    return json({
      error: 'JSON document limit reached',
      tier: documentPlan.tier,
      limit: documentPlan.limit,
      used: documentsUsed,
      projected: projectedDocuments,
    }, 402);
  }

  if (storagePlan.limit !== null && projectedStorageBytes > storagePlan.limit) {
    return json({
      error: 'JSON storage limit reached',
      tier: storagePlan.tier,
      limit: storagePlan.limit,
      used: storageUsed,
      projected: projectedStorageBytes,
    }, 402);
  }

  return null;
}

async function guardPublicJsonWrite(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method !== 'PUT') return null;
  const match = url.pathname.match(/^\/json\/([a-f0-9]{32})\/(.+)$/i);
  if (!match) return null;
  const key = safeJsonKey(match[2]);
  if (!key) return null;
  const store = await env.DB.prepare('SELECT id,owner,token_hash FROM json_stores WHERE public_id=?')
    .bind(match[1].toLowerCase()).first<{ id: string; owner: string; token_hash: string }>();
  if (!store) return null;
  const token = bearerToken(request);
  if (!token || await sha256Hex(token) !== store.token_hash) return null;
  return jsonWriteGuard(request, env, store.owner, store.id, key);
}

async function guardManagedJsonWrite(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method !== 'PUT') return null;
  const match = url.pathname.match(/^\/api\/picosvc\/json\/stores\/([0-9a-f-]{36})\/documents\/(.+)$/i);
  if (!match) return null;
  const key = safeJsonKey(match[2]);
  if (!key) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const store = await env.DB.prepare('SELECT id,owner FROM json_stores WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ id: string; owner: string }>();
  if (!store) return null;
  return jsonWriteGuard(request, env, store.owner, store.id, key);
}

async function guardFileDownload(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method === 'OPTIONS') return null;
  const match = url.pathname.match(/^\/files\/([a-f0-9]{32})\/(.+)$/i);
  if (!match) return null;
  const rawPath = decoded(match[2]);
  const path = rawPath ? safeObjectPath(rawPath) : null;
  if (!path) return null;
  const space = await env.DB.prepare('SELECT id,owner FROM file_spaces WHERE public_id=? AND enabled=1')
    .bind(match[1].toLowerCase()).first<{ id: string; owner: string }>();
  if (!space) return null;
  const exists = await env.DB.prepare('SELECT 1 AS ok FROM file_objects WHERE space_id=? AND path=?')
    .bind(space.id, path).first<{ ok: number }>();
  if (!exists) return null;
  const usage = await consumeUsage(env, space.owner, 'files', 'downloads');
  return usage.ok ? null : json({ error: 'File download quota reached', ...usage }, 429);
}

async function guardRssDelivery(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method === 'OPTIONS') return null;
  const match = url.pathname.match(/^\/rss\/([a-f0-9]{32})\.xml$/i);
  if (!match) return null;
  const feed = await env.DB.prepare('SELECT owner FROM rss_feeds WHERE public_id=? AND enabled=1')
    .bind(match[1].toLowerCase()).first<{ owner: string }>();
  if (!feed) return null;
  const usage = await consumeUsage(env, feed.owner, 'rss', 'requests');
  return usage.ok ? null : json({ error: 'RSS delivery quota reached', ...usage }, 429);
}

async function guardManualRssRefresh(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const match = url.pathname.match(/^\/api\/picosvc\/rss\/feeds\/([0-9a-f-]{36})\/refresh$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const feed = await env.DB.prepare('SELECT owner,last_checked_at FROM rss_feeds WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ owner: string; last_checked_at: string | null }>();
  if (!feed?.last_checked_at) return null;
  const { tier, limit } = await productLimit(env, feed.owner, 'rss', 'refreshMinutes');
  if (limit === null) return null;
  const last = Date.parse(feed.last_checked_at);
  if (!Number.isFinite(last)) return null;
  const remainingMs = last + limit * 60_000 - Date.now();
  if (remainingMs <= 0) return null;
  const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return Response.json({
    error: 'RSS refresh interval has not elapsed',
    tier,
    refreshMinutes: limit,
    retryAfterSeconds,
  }, {
    status: 429,
    headers: { 'cache-control': 'no-store', 'retry-after': String(retryAfterSeconds) },
  });
}

async function guardHookBody(request: Request, env: Env, url: URL): Promise<Response | null> {
  const match = url.pathname.match(/^\/hooks\/([a-f0-9]{32})(?:\/.*)?$/i);
  if (!match) return null;
  const inbox = await env.DB.prepare('SELECT owner FROM webhook_inboxes WHERE public_id=? AND enabled=1')
    .bind(match[1].toLowerCase()).first<{ owner: string }>();
  if (!inbox) return null;
  const { tier, limit } = await productLimit(env, inbox.owner, 'hooks', 'bodyBytes');
  if (limit === null) return null;
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > limit) {
    return json({ error: 'Webhook body exceeds the plan limit', tier, limitBytes: limit }, 413);
  }
  try {
    const bytes = await request.clone().arrayBuffer();
    if (bytes.byteLength > limit) return json({ error: 'Webhook body exceeds the plan limit', tier, limitBytes: limit }, 413);
  } catch {
    return null;
  }
  return null;
}

async function guardHookReplay(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const match = url.pathname.match(/^\/api\/picosvc\/hooks\/events\/([0-9a-f-]{36})\/replay$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const event = await env.DB.prepare('SELECT owner FROM webhook_events WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ owner: string }>();
  if (!event) return null;
  const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (!safeReplayUrl(body?.url)) return null;
  const usage = await consumeUsage(env, event.owner, 'hooks', 'replays');
  return usage.ok ? null : json({ error: 'Webhook replay quota reached', ...usage }, 429);
}

async function pruneHistory(
  env: Env,
  owner: string,
  product: 'mail' | 'cron' | 'forms',
  table: 'mail_events' | 'cron_runs' | 'form_submissions',
  orderColumn: 'received_at' | 'ran_at',
): Promise<void> {
  const { limit } = await productLimit(env, owner, product, 'history');
  if (limit === null) return;
  await env.DB.prepare(`
    DELETE FROM ${table}
    WHERE owner=? AND id IN (
      SELECT id FROM ${table}
      WHERE owner=?
      ORDER BY ${orderColumn} DESC
      LIMIT -1 OFFSET ?
    )
  `).bind(owner, owner, Math.max(0, limit)).run();
}

async function pruneOwnersAboveMinimum(
  env: Env,
  product: 'mail' | 'cron' | 'forms',
  table: 'mail_events' | 'cron_runs' | 'form_submissions',
  orderColumn: 'received_at' | 'ran_at',
): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT owner, COUNT(*) AS count
    FROM ${table}
    GROUP BY owner
    HAVING COUNT(*) > ?
    LIMIT 500
  `).bind(MIN_RETAINED_HISTORY_LIMIT).all<{ owner: string; count: number }>();
  for (const row of rows.results || []) await pruneHistory(env, row.owner, product, table, orderColumn);
}

export async function picoSvcRuntimeGuardrails(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  for (const guard of [
    guardHookBody,
    guardHookReplay,
    guardRssDelivery,
    guardManualRssRefresh,
    guardPublicJsonWrite,
    guardManagedJsonWrite,
    guardFileDownload,
  ]) {
    const response = await guard(request, env, url);
    if (response) return response;
  }
  return null;
}

export async function picoSvcPostResponseGuardrails(request: Request, env: Env, response: Response): Promise<void> {
  if (response.status !== 202 || request.method !== 'POST') return;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/forms\/([a-f0-9]{32})$/i);
  if (!match) return;
  const form = await env.DB.prepare('SELECT owner FROM forms WHERE public_id=?')
    .bind(match[1].toLowerCase()).first<{ owner: string }>();
  if (form) await pruneHistory(env, form.owner, 'forms', 'form_submissions', 'received_at');
}

export async function picoSvcEmailGuardrails(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const [local, domain] = message.to.trim().toLowerCase().split('@');
  if (domain !== 'picosvc.com' || !local || !/^[a-f0-9]{32}$/.test(local)) return;
  const route = await env.DB.prepare('SELECT owner FROM mail_routes WHERE public_id=?')
    .bind(local).first<{ owner: string }>();
  if (route) await pruneHistory(env, route.owner, 'mail', 'mail_events', 'received_at');
}

export async function picoSvcScheduledGuardrails(env: Env): Promise<void> {
  await pruneOwnersAboveMinimum(env, 'cron', 'cron_runs', 'ran_at');
  await pruneOwnersAboveMinimum(env, 'mail', 'mail_events', 'received_at');
  await pruneOwnersAboveMinimum(env, 'forms', 'form_submissions', 'received_at');
}
