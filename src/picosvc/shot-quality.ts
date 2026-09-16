import type { Env } from '../types.js';
import { clerkIdentity } from '../auth.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { randomSecret, safePublicUrl, sha256Hex } from './security.js';
import { inspectShot } from './shot-image-quality.js';

const MAX_TIMEOUT = 20_000;
const MAX_WAIT = 10_000;
const MAX_BYTES = 20 * 1024 * 1024;
const KEY_PATTERN = /^pss_[A-Za-z0-9_-]{32}$/;
const METHODS = 'GET,POST,DELETE';
type ShotOwner = { ownerId: string };

function fail(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}
function bounded(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}
function validSelector(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 300 ? value.trim() : null;
}
function month(): string { return new Date().toISOString().slice(0, 7); }

async function resolveShotOwner(request: Request, env: Env): Promise<ShotOwner | Response> {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (bearer.startsWith('pss_')) {
    if (!KEY_PATTERN.test(bearer)) return fail('invalid_api_key', 'Invalid Screenshot API key', 401);
    try {
      const tokenHash = await sha256Hex(bearer);
      const row = await env.DB.prepare('SELECT id, owner FROM shot_api_keys WHERE token_hash=? AND revoked_at IS NULL')
        .bind(tokenHash).first<{ id: string; owner: string }>();
      if (!row) return fail('invalid_api_key', 'Screenshot API key was not found or has been revoked', 401);
      await env.DB.prepare('UPDATE shot_api_keys SET last_used_at=? WHERE id=? AND revoked_at IS NULL')
        .bind(new Date().toISOString(), row.id).run();
      return { ownerId: row.owner };
    } catch {
      return fail('api_keys_unavailable', 'Screenshot API keys are not ready. Apply the latest database migration.', 503);
    }
  }
  const identity = await clerkIdentity(request, env);
  return identity ? { ownerId: identity.ownerId } : fail('authentication_required', 'Sign in or send a Screenshot API key in Authorization: Bearer <key>', 401);
}

async function keyRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname === '/api/picosvc/shot/keys';
  const keyMatch = url.pathname.match(/^\/api\/picosvc\/shot\/keys\/([0-9a-f-]{36})$/i);
  if (!collection && !keyMatch) return null;
  // A Screenshot API key must never be allowed to mint or manage other keys.
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  try {
    if (collection && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id,name,created_at,last_used_at FROM shot_api_keys WHERE owner=? AND revoked_at IS NULL ORDER BY created_at DESC')
        .bind(identity.ownerId).all();
      return json({ keys: rows.results || [] });
    }
    if (collection && request.method === 'POST') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM shot_api_keys WHERE owner=? AND revoked_at IS NULL')
        .bind(identity.ownerId).first<{ count: number }>();
      if (Number(count?.count || 0) >= 10) return fail('key_limit', 'Maximum 10 active Screenshot API keys. Revoke an unused key first.', 409);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
      if (!name) return fail('invalid_name', 'A key name is required', 400);
      const token = randomSecret('pss');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO shot_api_keys (id,owner,name,token_hash,created_at) VALUES (?,?,?,?,?)')
        .bind(id, identity.ownerId, name, await sha256Hex(token), now).run();
      return json({ id, name, token, created_at: now, note: 'This token is displayed only once. Store it securely.' }, 201);
    }
    if (keyMatch && request.method === 'DELETE') {
      const row = await env.DB.prepare('SELECT id FROM shot_api_keys WHERE id=? AND owner=? AND revoked_at IS NULL')
        .bind(keyMatch[1], identity.ownerId).first();
      if (!row) return fail('not_found', 'Screenshot API key not found', 404);
      await env.DB.prepare('UPDATE shot_api_keys SET revoked_at=? WHERE id=? AND owner=?')
        .bind(new Date().toISOString(), keyMatch[1], identity.ownerId).run();
      return new Response(null, { status: 204 });
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: collection ? 'GET,POST' : 'DELETE' } });
  } catch {
    return fail('api_keys_unavailable', 'Screenshot API keys are not ready. Apply migration 0029.', 503);
  }
}

async function capture(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  const owner = await resolveShotOwner(request, env);
  if (owner instanceof Response) return owner;
  if (!env.BROWSER) return fail('browser_unavailable', 'Cloudflare Browser Run binding BROWSER is missing.', 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const target = safePublicUrl(body?.url);
  if (!target) return fail('invalid_url', 'Provide a public HTTP(S) URL on port 80 or 443.', 400);
  const format = body?.format === 'pdf' ? 'pdf' : 'png';
  const timeoutMs = bounded(body?.timeoutMs, MAX_TIMEOUT, 1000, MAX_TIMEOUT);
  const waitMs = bounded(body?.waitMs, 900, 0, MAX_WAIT);
  const width = bounded(body?.width, 1280, 320, 3840);
  const height = bounded(body?.height, 720, 200, 2160);
  const deviceScaleFactor = bounded(body?.deviceScaleFactor, 1, 1, 3);
  const selector = validSelector(body?.selector);
  if (body?.selector && !selector) return fail('invalid_selector', 'CSS selector must contain 1–300 characters.', 400);
  const waitUntil = ['networkidle0', 'networkidle2', 'load', 'domcontentloaded'].includes(String(body?.waitUntil))
    ? String(body?.waitUntil) : 'networkidle2';
  const fullPage = body?.fullPage === true;
  const usage = await consumeUsage(env, owner.ownerId, 'shot', 'shots');
  if (!usage.ok) return json({ error: { code: 'quota_reached', message: 'Screenshot monthly quota reached' }, tier: usage.tier, limit: usage.limit, used: usage.used }, 429);
  const options: Record<string, unknown> = {
    url: target.toString(),
    viewport: { width, height, deviceScaleFactor },
    gotoOptions: { timeout: timeoutMs, waitUntil },
    actionTimeout: timeoutMs,
    ...(waitMs ? { waitForTimeout: waitMs } : {}),
    ...(selector && format === 'png' ? { selector, waitForSelector: { selector, visible: true, timeout: timeoutMs } } : {}),
    ...(format === 'pdf' ? { pdfOptions: { printBackground: true, timeout: timeoutMs } } : { screenshotOptions: { fullPage } }),
  };
  const action = format === 'pdf' ? 'pdf' : 'screenshot';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        env.BROWSER.quickAction(action, options),
        new Promise<Response>((_, reject) => { timer = setTimeout(() => reject(new Error('capture_timeout')), timeoutMs * 2 + waitMs + 2500); }),
      ]);
      if (!response.ok) return fail('browser_error', `Browser renderer failed (HTTP ${response.status}). Check URL accessibility and try a longer timeout.`, response.status === 429 ? 429 : 502);
      if (Number(response.headers.get('content-length') || '0') > MAX_BYTES) return fail('output_too_large', 'Rendered output exceeds 20 MiB.', 413);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const inspection = await inspectShot(bytes, format);
      if (!inspection.ok) return fail('invalid_output', inspection.reason || 'Renderer did not return a valid image or PDF.', 502);
      if (inspection.blank) {
        if (attempt === 0) {
          // Retry a blank PNG once with a stricter load condition. Never return a white image as success.
          options.gotoOptions = { timeout: timeoutMs, waitUntil: 'networkidle0' };
          options.waitForTimeout = Math.max(1800, waitMs);
          continue;
        }
        return fail('blank_capture', 'Page rendered as an all-white image even after retry. Confirm the URL is public, or set waitMs / selector for dynamically loaded content.', 422);
      }
      const headers = new Headers({
        'content-type': format === 'pdf' ? 'application/pdf' : 'image/png',
        'content-disposition': `attachment; filename="picosvc-capture.${format}"`,
        'cache-control': 'no-store',
        'x-picosvc-tier': usage.tier,
        'x-content-type-options': 'nosniff',
      });
      if (inspection.width && inspection.height) headers.set('x-picosvc-image-size', `${inspection.width}x${inspection.height}`);
      return new Response(bytes, { status: 200, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(/timeout/i.test(message) ? 'capture_timeout' : 'capture_failed', /timeout/i.test(message)
        ? 'Rendering timed out. Try a smaller viewport, shorter wait, or a page that loads faster.'
        : 'Browser rendering failed. Confirm the target URL is reachable and try again.', /timeout/i.test(message) ? 504 : 502);
    } finally { if (timer) clearTimeout(timer); }
  }
  return fail('capture_failed', 'Screenshot could not be captured.', 502);
}

export async function shotQualityManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/picosvc/shot') return capture(request, env);
  if (!url.pathname.startsWith('/api/picosvc/shot/')) return null;
  return (await keyRoutes(request, env, url)) || json({ error: 'Screenshot route not found' }, 404);
}
