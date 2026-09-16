import QRCode from 'qrcode';
import type { Env } from '../types.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { fetchPublic, safePublicUrl } from './security.js';

const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const MAX_FETCH_OUTPUT = 2 * 1024 * 1024;
const MAX_BROWSER_TIMEOUT_MS = 20_000;
const MAX_WAIT_MS = 10_000;
const MAX_SELECTOR = 300;
const MAX_HEADERS = 24;
const MAX_COOKIES = 20;
const BLOCKED_HEADERS = new Set(['host','content-length','connection','transfer-encoding','cf-connecting-ip','cf-ray']);
const QR_LEVELS = new Set(['L','M','Q','H']);

function htmlEntityDecode(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function metadata(html: string, url: string, readable = false) {
  const cleaned = readable
    ? html.replace(/<(script|style|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    : html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const text = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    title: htmlEntityDecode(titleMatch?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''),
    description: htmlEntityDecode(descMatch?.[1]?.trim() || ''),
    canonical: canonicalMatch?.[1] ? new URL(canonicalMatch[1], url).toString() : null,
    textPreview: htmlEntityDecode(text.slice(0, 4_000)),
  };
}

function limitedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

function safeSelector(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const selector = value.trim();
  return selector && selector.length <= MAX_SELECTOR ? selector : null;
}

function safeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_HEADERS)) {
    const name = rawName.toLowerCase().trim();
    if (!name || BLOCKED_HEADERS.has(name) || typeof rawValue !== 'string') continue;
    result[name] = rawValue.slice(0, 8_192);
  }
  return result;
}

function safeCookies(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COOKIES).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const cookie = raw as Record<string, unknown>;
    if (typeof cookie.name !== 'string' || typeof cookie.value !== 'string') return [];
    const result: Record<string, unknown> = {
      name: cookie.name.slice(0, 200),
      value: cookie.value.slice(0, 8_192),
    };
    for (const key of ['domain','path','url','sameSite'] as const) if (typeof cookie[key] === 'string') result[key] = String(cookie[key]).slice(0, 2_048);
    if (typeof cookie.httpOnly === 'boolean') result.httpOnly = cookie.httpOnly;
    if (typeof cookie.secure === 'boolean') result.secure = cookie.secure;
    return [result];
  });
}

async function quickActionWithDeadline(env: Env, action: string, options: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  if (!env.BROWSER) throw new Error('browser_unavailable');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      env.BROWSER.quickAction(action as any, options as any),
      new Promise<Response>((_, reject) => { timer = setTimeout(() => reject(new Error('browser_timeout')), timeoutMs + 2_000); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fetchError(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

async function fetchRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const target = safePublicUrl(body?.url);
  if (!target) return fetchError('invalid_url', 'url must be a public HTTP(S) URL on port 80 or 443', 400);
  const usage = await consumeUsage(env, identity.ownerId, 'fetch', 'requests');
  if (!usage.ok) return fetchError('quota_reached', 'Fetch quota reached', 429);
  const format = body?.format === 'metadata' ? 'metadata' : 'markdown';
  const readable = body?.readable === true;
  const timeoutMs = limitedNumber(body?.timeoutMs, 15_000, 1_000, MAX_BROWSER_TIMEOUT_MS);

  try {
    if (format === 'markdown') {
      const response = await quickActionWithDeadline(env, 'markdown', {
        url: target.toString(),
        gotoOptions: { timeout: timeoutMs, waitUntil: body?.waitUntil === 'networkidle0' ? 'networkidle0' : body?.waitUntil === 'networkidle2' ? 'networkidle2' : 'domcontentloaded' },
      }, timeoutMs);
      if (!response.ok) return fetchError('browser_error', `Browser Run returned HTTP ${response.status}`, 502);
      const markdown = await response.text();
      if (new TextEncoder().encode(markdown).byteLength > MAX_FETCH_OUTPUT) return fetchError('output_too_large', 'Markdown output exceeds 2 MiB', 413);
      return json({ schema: 'picosvc.fetch.v1', url: target.toString(), format: 'markdown', readable, markdown, tier: usage.tier });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try { response = await fetchPublic(target, { headers: { 'user-agent': 'PicoSvc-Fetch/1.0' }, signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if (!response.ok) return fetchError('upstream_http', `Upstream returned HTTP ${response.status}`, 502);
    const declared = Number(response.headers.get('content-length') || '0');
    if (declared > MAX_FETCH_BYTES) return fetchError('upstream_too_large', 'Upstream document exceeds 2 MiB', 413);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_FETCH_BYTES) return fetchError('upstream_too_large', 'Upstream document exceeds 2 MiB', 413);
    const html = new TextDecoder().decode(bytes);
    return json({ schema: 'picosvc.fetch.v1', url: target.toString(), format: 'metadata', readable, bytes: bytes.byteLength, contentType: response.headers.get('content-type'), ...metadata(html, target.toString(), readable), tier: usage.tier });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fetchError(/timeout|abort/i.test(message) ? 'timeout' : message === 'browser_unavailable' ? 'browser_unavailable' : 'fetch_failed', message, /timeout|abort/i.test(message) ? 504 : 502);
  }
}

async function shotRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  if (!env.BROWSER) return json({ error: { code: 'browser_unavailable', message: 'Browser Run binding is not configured' } }, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const target = safePublicUrl(body?.url);
  if (!target) return json({ error: { code: 'invalid_url', message: 'url must be a public HTTP(S) URL on port 80 or 443' } }, 400);
  const usage = await consumeUsage(env, identity.ownerId, 'shot', 'shots');
  if (!usage.ok) return json({ error: { code: 'quota_reached', message: 'Shot quota reached' }, tier: usage.tier, limit: usage.limit, used: usage.used }, 429);

  const format = body?.format === 'pdf' ? 'pdf' : 'png';
  const timeoutMs = limitedNumber(body?.timeoutMs, 15_000, 1_000, MAX_BROWSER_TIMEOUT_MS);
  const waitMs = limitedNumber(body?.waitMs, 0, 0, MAX_WAIT_MS);
  const selector = safeSelector(body?.selector);
  const width = limitedNumber(body?.width, 1280, 320, 3840);
  const height = limitedNumber(body?.height, 720, 200, 2160);
  const deviceScaleFactor = Math.max(1, Math.min(3, Number(body?.deviceScaleFactor || 1)));
  const extraHeaders = safeHeaders(body?.headers);
  const cookies = safeCookies(body?.cookies);
  const options: Record<string, unknown> = {
    url: target.toString(),
    viewport: { width, height, deviceScaleFactor },
    gotoOptions: { timeout: timeoutMs, waitUntil: body?.waitUntil === 'networkidle0' ? 'networkidle0' : body?.waitUntil === 'networkidle2' ? 'networkidle2' : 'domcontentloaded' },
    actionTimeout: timeoutMs,
    ...(waitMs ? { waitForTimeout: waitMs } : {}),
    ...(Object.keys(extraHeaders).length ? { setExtraHTTPHeaders: extraHeaders } : {}),
    ...(cookies.length ? { cookies } : {}),
  };
  if (format === 'pdf') options.pdfOptions = { printBackground: true, timeout: timeoutMs };
  else {
    options.screenshotOptions = { fullPage: body?.fullPage !== false };
    if (selector) options.selector = selector;
  }

  try {
    const response = await quickActionWithDeadline(env, format === 'pdf' ? 'pdf' : 'screenshot', options, timeoutMs + waitMs);
    const headers = new Headers(response.headers);
    headers.set('x-picosvc-tier', usage.tier);
    headers.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: { code: /timeout/i.test(message) ? 'timeout' : 'browser_error', message } }, /timeout/i.test(message) ? 504 : 502);
  }
}

function qrStyle(url: URL) {
  const levelRaw = (url.searchParams.get('level') || 'M').toUpperCase();
  const errorCorrectionLevel = QR_LEVELS.has(levelRaw) ? levelRaw as 'L'|'M'|'Q'|'H' : 'M';
  const margin = limitedNumber(url.searchParams.get('margin'), 1, 0, 10);
  const width = limitedNumber(url.searchParams.get('width'), 512, 128, 2048);
  const hex = (value: string | null, fallback: string) => value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return { errorCorrectionLevel, margin, width, color: { dark: hex(url.searchParams.get('dark'), '#000000'), light: hex(url.searchParams.get('light'), '#ffffff') } };
}

function decodeDataUrl(value: string): Uint8Array {
  const encoded = value.split(',', 2)[1] || '';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function deviceCategory(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/bot|crawler|spider|slurp/.test(ua)) return 'bot';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  return userAgent ? 'desktop' : 'unknown';
}

function referrerCategory(value: string | null): string {
  if (!value) return 'direct';
  try { return new URL(value).hostname.toLowerCase().slice(0, 200) || 'direct'; }
  catch { return 'unknown'; }
}

async function recordQrScan(request: Request, env: Env, row: any): Promise<void> {
  const country = String((request as Request & { cf?: { country?: string } }).cf?.country || 'unknown').toUpperCase().slice(0, 8);
  const device = deviceCategory(request.headers.get('user-agent') || '');
  const referrer = referrerCategory(request.headers.get('referer'));
  const day = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE qr_links SET scans=scans+1, updated_at=? WHERE id=?').bind(now, row.id),
    env.DB.prepare(`
      INSERT INTO qr_scan_daily (link_id,owner,day,country,device,referrer,scans,updated_at)
      VALUES (?,?,?,?,?,?,1,?)
      ON CONFLICT(link_id,day,country,device,referrer) DO UPDATE SET scans=qr_scan_daily.scans+1,updated_at=excluded.updated_at
    `).bind(row.id, row.owner, day, country, device, referrer, now),
  ]);
}

export async function utilityAdvancedRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const svgMatch = url.pathname.match(/^\/q\/([a-f0-9]{32})\.svg$/i);
  const redirectMatch = url.pathname.match(/^\/q\/([a-f0-9]{32})$/i);
  const publicId = svgMatch?.[1] || redirectMatch?.[1];
  if (!publicId) return null;
  const row = await env.DB.prepare('SELECT * FROM qr_links WHERE public_id=? AND enabled=1').bind(publicId.toLowerCase()).first<any>();
  if (!row) return json({ error: 'QR link not found' }, 404);
  if (svgMatch) {
    const target = `${url.origin}/q/${row.public_id}`;
    const svg = await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return new Response(svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  }
  const usage = await consumeUsage(env, row.owner, 'qr', 'scans');
  if (!usage.ok) return json({ error: 'QR scan quota reached', tier: usage.tier, limit: usage.limit, used: usage.used }, 429);
  await recordQrScan(request, env, row);
  return Response.redirect(row.target_url, 302);
}

export async function utilityAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/picosvc/fetch') return fetchRoute(request, env);
  if (url.pathname === '/api/picosvc/shot') return shotRoute(request, env);
  if (!url.pathname.startsWith('/api/picosvc/qr/')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;

  const codeMatch = url.pathname.match(/^\/api\/picosvc\/qr\/links\/([0-9a-f-]{36})\/code$/i);
  if (codeMatch && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM qr_links WHERE id=? AND owner=?').bind(codeMatch[1], identity.ownerId).first<any>();
    if (!row) return json({ error: 'QR link not found' }, 404);
    const target = `${url.origin}/q/${row.public_id}`;
    const style = qrStyle(url);
    const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg';
    if (format === 'svg') {
      const svg = await QRCode.toString(target, { type: 'svg', ...style });
      return new Response(svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'content-disposition': `attachment; filename="${row.public_id}.svg"`, 'cache-control': 'no-store' } });
    }
    const dataUrl = await QRCode.toDataURL(target, { type: 'image/png', ...style });
    return new Response(decodeDataUrl(dataUrl), { headers: { 'content-type': 'image/png', 'content-disposition': `attachment; filename="${row.public_id}.png"`, 'cache-control': 'no-store' } });
  }

  const analyticsMatch = url.pathname.match(/^\/api\/picosvc\/qr\/links\/([0-9a-f-]{36})\/analytics$/i);
  if (analyticsMatch && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT id FROM qr_links WHERE id=? AND owner=?').bind(analyticsMatch[1], identity.ownerId).first<any>();
    if (!row) return json({ error: 'QR link not found' }, 404);
    const days = limitedNumber(url.searchParams.get('days'), 30, 1, 365);
    const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const daily = await env.DB.prepare('SELECT day,SUM(scans) AS scans FROM qr_scan_daily WHERE link_id=? AND owner=? AND day>=? GROUP BY day ORDER BY day').bind(row.id, identity.ownerId, since).all();
    const countries = await env.DB.prepare('SELECT country,SUM(scans) AS scans FROM qr_scan_daily WHERE link_id=? AND owner=? AND day>=? GROUP BY country ORDER BY scans DESC LIMIT 50').bind(row.id, identity.ownerId, since).all();
    const devices = await env.DB.prepare('SELECT device,SUM(scans) AS scans FROM qr_scan_daily WHERE link_id=? AND owner=? AND day>=? GROUP BY device ORDER BY scans DESC').bind(row.id, identity.ownerId, since).all();
    const referrers = await env.DB.prepare('SELECT referrer,SUM(scans) AS scans FROM qr_scan_daily WHERE link_id=? AND owner=? AND day>=? GROUP BY referrer ORDER BY scans DESC LIMIT 50').bind(row.id, identity.ownerId, since).all();
    return json({ linkId: row.id, days, since, daily: daily.results || [], countries: countries.results || [], devices: devices.results || [], referrers: referrers.results || [] });
  }

  return null;
}
