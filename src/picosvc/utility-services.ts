import QRCode from 'qrcode';
import type { Env } from '../types.js';
import { consumeUsage, json, requireIdentity, resourceCapacity, cleanName } from './service-utils.js';
import { randomPublicId, safePublicUrl, fetchPublic } from './security.js';

function htmlEntityDecode(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function extractMeta(html: string, url: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    url,
    title: htmlEntityDecode(titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || ''),
    description: htmlEntityDecode(descMatch?.[1]?.trim() || ''),
    canonical: canonicalMatch?.[1] ? new URL(canonicalMatch[1], url).toString() : null,
    textPreview: htmlEntityDecode(text.slice(0, 1000)),
  };
}

export async function utilityManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === '/api/picosvc/fetch') {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
    const identity = await requireIdentity(request, env);
    if (identity instanceof Response) return identity;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const target = safePublicUrl(body?.url);
    if (!target) return json({ error: 'url must be a public HTTP(S) URL on port 80 or 443' }, 400);
    const usage = await consumeUsage(env, identity.ownerId, 'fetch', 'requests');
    if (!usage.ok) return json({ error: 'Fetch quota reached', ...usage }, 429);
    const format = body?.format === 'metadata' ? 'metadata' : 'markdown';

    if (format === 'markdown') {
      if (!env.BROWSER) return json({ error: 'Browser Run binding is not configured' }, 503);
      const response = await env.BROWSER.quickAction('markdown', { url: target.toString() });
      const headers = new Headers(response.headers);
      headers.set('x-picosvc-tier', usage.tier);
      headers.set('cache-control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    const response = await fetchPublic(target, { headers: { 'user-agent': 'PicoSvc-Fetch/1.0' } });
    if (!response.ok) return json({ error: `Upstream returned HTTP ${response.status}` }, 502);
    const declared = Number(response.headers.get('content-length') || '0');
    if (declared > 2 * 1024 * 1024) return json({ error: 'Upstream document exceeds 2 MiB' }, 413);
    const html = (await response.text()).slice(0, 2 * 1024 * 1024);
    return json({ ...extractMeta(html, target.toString()), tier: usage.tier });
  }

  if (url.pathname === '/api/picosvc/shot') {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
    const identity = await requireIdentity(request, env);
    if (identity instanceof Response) return identity;
    if (!env.BROWSER) return json({ error: 'Browser Run binding is not configured' }, 503);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const target = safePublicUrl(body?.url);
    if (!target) return json({ error: 'url must be a public HTTP(S) URL on port 80 or 443' }, 400);
    const usage = await consumeUsage(env, identity.ownerId, 'shot', 'shots');
    if (!usage.ok) return json({ error: 'Shot quota reached', ...usage }, 429);
    const format = body?.format === 'pdf' ? 'pdf' : 'png';
    const options = format === 'pdf'
      ? { url: target.toString(), pdfOptions: { printBackground: true } }
      : { url: target.toString(), screenshotOptions: { fullPage: body?.fullPage !== false } };
    const response = await env.BROWSER.quickAction(format === 'pdf' ? 'pdf' : 'screenshot', options);
    const headers = new Headers(response.headers);
    headers.set('x-picosvc-tier', usage.tier);
    headers.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  if (!url.pathname.startsWith('/api/picosvc/qr/')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;

  if (url.pathname === '/api/picosvc/qr/links') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM qr_links WHERE owner=? ORDER BY created_at DESC').bind(identity.ownerId).all();
      const { tier, limit } = await resourceCapacity(env, identity.ownerId, 'qr', 'qrs', 'qr_links');
      return json({ tier, limit, links: rows.results || [] });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, identity.ownerId, 'qr', 'qrs', 'qr_links');
      if (!capacity.ok) return json({ error: 'QR limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const target = safePublicUrl(body?.targetUrl);
      if (!target) return json({ error: 'targetUrl must be a public HTTP(S) URL' }, 400);
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO qr_links (id,owner,public_id,name,target_url,enabled,scans,created_at,updated_at) VALUES (?,?,?,?,?,1,0,?,?)')
        .bind(id, identity.ownerId, publicId, cleanName(body?.name, 'Dynamic QR'), target.toString(), now, now).run();
      return json({ id, publicId, redirectPath: `/q/${publicId}`, svgPath: `/q/${publicId}.svg`, targetUrl: target.toString(), tier: capacity.tier }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const match = url.pathname.match(/^\/api\/picosvc\/qr\/links\/([0-9a-f-]{36})$/i);
  if (!match) return null;
  const row = await env.DB.prepare('SELECT * FROM qr_links WHERE id=? AND owner=?').bind(match[1], identity.ownerId).first<any>();
  if (!row) return json({ error: 'QR link not found' }, 404);
  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const target = body?.targetUrl === undefined ? null : safePublicUrl(body.targetUrl);
    if (body?.targetUrl !== undefined && !target) return json({ error: 'targetUrl must be a public HTTP(S) URL' }, 400);
    const name = body?.name === undefined ? row.name : cleanName(body.name, row.name);
    const enabled = body?.enabled === undefined ? row.enabled : body.enabled ? 1 : 0;
    await env.DB.prepare('UPDATE qr_links SET name=?, target_url=?, enabled=?, updated_at=? WHERE id=? AND owner=?')
      .bind(name, target?.toString() || row.target_url, enabled, new Date().toISOString(), row.id, identity.ownerId).run();
    return json({ id: row.id, name, targetUrl: target?.toString() || row.target_url, enabled: Boolean(enabled) });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM qr_links WHERE id=? AND owner=?').bind(row.id, identity.ownerId).run();
    return new Response(null, { status: 204 });
  }
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'PATCH,DELETE' } });
}

export async function qrRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
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
  await env.DB.prepare('UPDATE qr_links SET scans=scans+1, updated_at=? WHERE id=?').bind(new Date().toISOString(), row.id).run();
  return Response.redirect(row.target_url, 302);
}
