import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { cleanName, consumeUsage, json, requireIdentity, resourceCapacity } from './service-utils.js';
import { fetchPublic, safePublicUrl, sha256Hex } from './security.js';
import { normalizeMonitorText, readableMonitorDiff, validStripPattern } from './monitor-text.js';

const MAX_PAGE_BYTES = 2 * 1024 * 1024;
type MonitorOptions = {
  monitor_id: string; owner: string; enabled: number; content_selector: string | null; ignore_selector: string | null;
  strip_pattern: string | null; last_content_hash: string | null; last_text: string | null;
  last_checked_at: string | null; last_error: string | null;
};
function selector(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 200 || value.includes('\0')) return undefined;
  return value.trim() || null;
}
async function readPage(url: string): Promise<string> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchPublic(url, { headers: { 'user-agent': 'PicoSvc-Monitor/2.0' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') || '0') > MAX_PAGE_BYTES) throw new Error('Page exceeds 2 MiB');
    if (!response.body) throw new Error('Upstream response is empty');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_PAGE_BYTES) { await reader.cancel(); throw new Error('Page exceeds 2 MiB'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { clearTimeout(timer); }
}
export async function extractMonitorContent(html: string, options: Pick<MonitorOptions, 'content_selector'|'ignore_selector'|'strip_pattern'>): Promise<string> {
  let text = '';
  const target = options.content_selector || 'body';
  let rewriter = new HTMLRewriter();
  if (options.ignore_selector) rewriter = rewriter.on(options.ignore_selector, { element(element) { element.remove(); } });
  rewriter = rewriter.on('script,style,noscript', { element(element) { element.remove(); } });
  rewriter = rewriter.on(target, { text(chunk) { if (text.length < 16_000) text += chunk.text; } });
  await rewriter.transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })).text();
  return normalizeMonitorText(text, options.strip_pattern);
}
async function recordEvent(env: Env, monitor: any, eventType: 'change'|'fetch_error', oldHash: string | null, newHash: string | null, diff: string | null, error: string | null, webhookStatus: number | null, webhookError: string | null): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO monitor_events(id,monitor_id,owner,event_type,old_hash,new_hash,diff_text,error,webhook_status,webhook_error,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), monitor.id, monitor.owner, eventType, oldHash, newHash, diff, error, webhookStatus, webhookError, now).run();
  await env.DB.prepare('DELETE FROM monitor_events WHERE monitor_id=? AND id NOT IN (SELECT id FROM monitor_events WHERE monitor_id=? ORDER BY created_at DESC,id DESC LIMIT 100)').bind(monitor.id, monitor.id).run();
}
export async function checkAdvancedMonitor(env: Env, monitor: any, options: MonitorOptions): Promise<void> {
  const usage = await consumeUsage(env, monitor.owner, 'monitor', 'checks'); if (!usage.ok) return;
  const now = new Date().toISOString();
  try {
    const content = await extractMonitorContent(await readPage(monitor.target_url), options);
    const hash = await sha256Hex(content);
    const changed = Boolean(options.last_content_hash && options.last_content_hash !== hash);
    let webhookStatus: number | null = null; let webhookError: string | null = null;
    const diff = changed ? readableMonitorDiff(options.last_text || '', content) : null;
    if (changed && monitor.webhook_url) {
      const destination = safePublicUrl(monitor.webhook_url);
      if (destination) {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
        try {
          const response = await fetchPublic(destination, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'PicoSvc-Monitor/2.0' }, body: JSON.stringify({ monitorId: monitor.id, name: monitor.name, url: monitor.target_url, changedAt: now, previousHash: options.last_content_hash, hash, diff }), signal: controller.signal });
          webhookStatus = response.status;
          if (!response.ok) webhookError = `Webhook returned HTTP ${response.status}`;
        } catch (error) { webhookError = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300); }
        finally { clearTimeout(timer); }
      }
    }
    await env.DB.prepare('UPDATE monitor_options SET last_content_hash=?,last_text=?,last_checked_at=?,last_error=NULL,updated_at=? WHERE monitor_id=? AND owner=?')
      .bind(hash, content, now, now, monitor.id, monitor.owner).run();
    await env.DB.prepare('UPDATE monitors SET last_hash=?,last_checked_at=?,last_changed_at=?,updated_at=? WHERE id=? AND owner=?')
      .bind(hash, now, changed ? now : monitor.last_changed_at, now, monitor.id, monitor.owner).run();
    if (changed) await recordEvent(env, monitor, 'change', options.last_content_hash, hash, diff, null, webhookStatus, webhookError);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    await env.DB.prepare('UPDATE monitor_options SET last_checked_at=?,last_error=?,updated_at=? WHERE monitor_id=? AND owner=?').bind(now, message, now, monitor.id, monitor.owner).run();
    await recordEvent(env, monitor, 'fetch_error', options.last_content_hash, null, null, message, null, null);
  }
}
export async function runAdvancedMonitorChecks(env: Env, now = new Date()): Promise<void> {
  const rows = await env.DB.prepare(`SELECT m.*,o.content_selector,o.ignore_selector,o.strip_pattern,o.last_content_hash,o.last_text,o.last_checked_at AS option_checked_at,o.last_error,o.enabled AS option_enabled
    FROM monitors m JOIN monitor_options o ON o.monitor_id=m.id AND o.owner=m.owner
    WHERE m.enabled=0 AND o.enabled=1 ORDER BY o.last_checked_at ASC LIMIT 100`).all<any>();
  for (const row of rows.results || []) {
    const last = row.option_checked_at ? Date.parse(row.option_checked_at) : 0;
    const { limit } = await productLimit(env, row.owner, 'monitor', 'minIntervalMinutes');
    if (last && now.getTime() - last < Math.max(Number(row.interval_minutes || 15), limit ?? 5) * 60_000) continue;
    const options: MonitorOptions = {
      monitor_id: row.id, owner: row.owner, enabled: row.option_enabled,
      content_selector: row.content_selector, ignore_selector: row.ignore_selector, strip_pattern: row.strip_pattern,
      last_content_hash: row.last_content_hash, last_text: row.last_text, last_checked_at: row.option_checked_at, last_error: row.last_error,
    };
    await checkAdvancedMonitor(env, row, options);
  }
}

export async function monitorAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/picosvc/monitor' && !/^\/api\/picosvc\/monitor\/[0-9a-f-]{36}(?:\/(?:options|events|preview))?$/i.test(url.pathname)) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;
  if (url.pathname === '/api/picosvc/monitor' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT m.*,o.enabled AS advanced_enabled,o.content_selector,o.ignore_selector,o.last_error FROM monitors m LEFT JOIN monitor_options o ON o.monitor_id=m.id AND o.owner=m.owner WHERE m.owner=? ORDER BY m.created_at DESC`).bind(owner).all<any>();
    const capacity = await resourceCapacity(env, owner, 'monitor', 'monitors', 'monitors');
    const { limit } = await productLimit(env, owner, 'monitor', 'minIntervalMinutes');
    return json({ tier: capacity.tier, limit: capacity.limit, minIntervalMinutes: limit, monitors: (rows.results || []).map((row) => ({ ...row, enabled: row.advanced_enabled === null ? Boolean(row.enabled) : Boolean(row.advanced_enabled), advanced: row.advanced_enabled !== null })) });
  }
  const match = url.pathname.match(/^\/api\/picosvc\/monitor\/([0-9a-f-]{36})(?:\/(options|events|preview))?$/i);
  if (!match) return null;
  const monitor = await env.DB.prepare('SELECT * FROM monitors WHERE id=? AND owner=?').bind(match[1], owner).first<any>();
  if (!monitor) return json({ error: 'Monitor not found' }, 404);
  const options = await env.DB.prepare('SELECT * FROM monitor_options WHERE monitor_id=? AND owner=?').bind(monitor.id, owner).first<MonitorOptions>();
  const action = match[2];
  if (action === 'events' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id,event_type,old_hash,new_hash,diff_text,error,webhook_status,webhook_error,created_at FROM monitor_events WHERE monitor_id=? AND owner=? ORDER BY created_at DESC LIMIT 100').bind(monitor.id, owner).all();
    return json({ monitorId: monitor.id, events: rows.results || [] });
  }
  if (action === 'options' && request.method === 'GET') return json({ monitorId: monitor.id, enabled: options ? Boolean(options.enabled) : Boolean(monitor.enabled), contentSelector: options?.content_selector || null, ignoreSelector: options?.ignore_selector || null, stripPattern: options?.strip_pattern || null, lastError: options?.last_error || null, advanced: Boolean(options) });
  if (action === 'options' && request.method === 'PUT') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: 'JSON configuration required' }, 400);
    const contentSelector = selector(body.contentSelector); const ignoreSelector = selector(body.ignoreSelector);
    if (contentSelector === undefined || ignoreSelector === undefined) return json({ error: 'Selectors must be at most 200 characters' }, 400);
    const stripPattern = validStripPattern(body.stripPattern);
    if (body.stripPattern != null && body.stripPattern !== '' && stripPattern === null) return json({ error: 'Unsupported stripPattern (use the safe, non-repeating regex subset)' }, 400);
    const now = new Date().toISOString(); const enabled = body.enabled === false ? 0 : 1;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO monitor_options(monitor_id,owner,enabled,content_selector,ignore_selector,strip_pattern,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(monitor_id) DO UPDATE SET enabled=excluded.enabled,content_selector=excluded.content_selector,ignore_selector=excluded.ignore_selector,strip_pattern=excluded.strip_pattern,last_content_hash=NULL,last_text=NULL,last_checked_at=NULL,last_error=NULL,updated_at=excluded.updated_at`)
        .bind(monitor.id, owner, enabled, contentSelector, ignoreSelector, stripPattern, now, now),
      env.DB.prepare('UPDATE monitors SET enabled=0,updated_at=? WHERE id=? AND owner=?').bind(now, monitor.id, owner),
    ]);
    return json({ monitorId: monitor.id, enabled: Boolean(enabled), contentSelector, ignoreSelector, stripPattern, advanced: true });
  }
  if (action === 'preview' && request.method === 'POST') {
    const usage = await consumeUsage(env, owner, 'monitor', 'checks'); if (!usage.ok) return json({ error: 'Monitor check quota reached', ...usage }, 429);
    try {
      const content = await extractMonitorContent(await readPage(monitor.target_url), options || { content_selector: null, ignore_selector: null, strip_pattern: null });
      return json({ monitorId: monitor.id, text: content.slice(0, 2000), hash: await sha256Hex(content) });
    } catch (error) { return json({ error: 'Monitor preview failed', detail: error instanceof Error ? error.message : String(error) }, 422); }
  }
  if (!action && options && request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: 'JSON body required' }, 400);
    const target = body.targetUrl === undefined ? null : safePublicUrl(body.targetUrl);
    if (body.targetUrl !== undefined && !target) return json({ error: 'targetUrl must be a public HTTP(S) URL' }, 400);
    const webhook = body.webhookUrl === undefined ? undefined : body.webhookUrl ? safePublicUrl(body.webhookUrl) : null;
    if (body.webhookUrl && !webhook) return json({ error: 'webhookUrl must be a public HTTP(S) URL' }, 400);
    const { limit } = await productLimit(env, owner, 'monitor', 'minIntervalMinutes');
    const interval = body.intervalMinutes === undefined ? monitor.interval_minutes : Number(body.intervalMinutes);
    if (!Number.isFinite(interval)) return json({ error: 'Invalid intervalMinutes' }, 400);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE monitors SET name=?,target_url=?,webhook_url=?,interval_minutes=?,enabled=0,updated_at=? WHERE id=? AND owner=?')
        .bind(body.name === undefined ? monitor.name : cleanName(body.name, monitor.name), target?.toString() || monitor.target_url, webhook === undefined ? monitor.webhook_url : webhook?.toString() || null, Math.max(limit ?? 5, Math.min(10080, interval)), now, monitor.id, owner),
      env.DB.prepare('UPDATE monitor_options SET enabled=?,updated_at=? WHERE monitor_id=? AND owner=?').bind(body.enabled === undefined ? options.enabled : body.enabled ? 1 : 0, now, monitor.id, owner),
    ]);
    return json({ id: monitor.id, enabled: body.enabled === undefined ? Boolean(options.enabled) : Boolean(body.enabled), advanced: true });
  }
  return null;
}
