import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { extractRssItems, type RssSelectors } from './rss-extractor.js';
import { cleanName, consumeUsage, json, requireIdentity, resourceCapacity } from './service-utils.js';
import { fetchPublic, randomPublicId, safeHeaderObject, safePublicUrl, sha256Hex } from './security.js';

const MAX_PAGE_BYTES = 2 * 1024 * 1024;

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function extractPage(html: string, sourceUrl: string) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || sourceUrl).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const meta = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1];
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, description: (meta || text.slice(0, 500)).trim() };
}

function selectorValue(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const selector = value.trim();
  return selector && selector.length <= 300 ? selector : null;
}

function selectorsFromFeed(feed: any): RssSelectors {
  return {
    item: feed.item_selector || null,
    title: feed.title_selector || null,
    link: feed.link_selector || null,
    content: feed.content_selector || null,
    date: feed.date_selector || null,
  };
}

function serializedSelectors(feed: any) {
  return {
    itemSelector: feed.item_selector || null,
    titleSelector: feed.title_selector || null,
    linkSelector: feed.link_selector || null,
    contentSelector: feed.content_selector || null,
    dateSelector: feed.date_selector || null,
  };
}

async function loadPage(url: string): Promise<{ html: string; hash: string }> {
  const response = await fetchPublic(url, { headers: { 'user-agent': 'PicoSvc-RSS/1.0' } });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') || '0');
  if (declared > MAX_PAGE_BYTES) throw new Error('Page exceeds 2 MiB');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PAGE_BYTES) throw new Error('Page exceeds 2 MiB');
  const html = new TextDecoder().decode(bytes);
  return { html, hash: await sha256Hex(html) };
}

async function extractedFeedItems(env: Env, feed: any, html: string, now: string) {
  const extraction = await extractRssItems(html, feed.source_url, selectorsFromFeed(feed), now);
  if (extraction.items.length) return extraction;

  const page = extractPage(html, feed.source_url);
  return {
    mode: 'auto-headings' as const,
    itemSelector: null,
    items: [{
      title: page.title,
      link: feed.source_url,
      description: page.description,
      publishedAt: now,
      guid: await sha256Hex(`${feed.source_url}\n${page.title}\n${page.description}`),
    }],
  };
}

export async function previewRssFeed(env: Env, feed: any) {
  const loaded = await loadPage(feed.source_url);
  const now = new Date().toISOString();
  const extraction = await extractedFeedItems(env, feed, loaded.html, now);
  return {
    hash: loaded.hash,
    mode: extraction.mode,
    detectedItemSelector: extraction.itemSelector,
    selectors: serializedSelectors(feed),
    items: extraction.items.slice(0, 20),
  };
}

export async function refreshRssFeed(env: Env, feed: any): Promise<{ changed: boolean; hash: string; extracted: number; inserted: number; mode: string }> {
  const loaded = await loadPage(feed.source_url);
  const now = new Date().toISOString();
  const changed = Boolean(feed.last_hash && feed.last_hash !== loaded.hash);
  const extraction = await extractedFeedItems(env, feed, loaded.html, now);
  let inserted = 0;

  for (const item of extraction.items) {
    const result = await env.DB.prepare(`
      INSERT INTO rss_entries (id,feed_id,title,link,guid,description,published_at)
      SELECT ?,?,?,?,?,?,?
      WHERE NOT EXISTS (
        SELECT 1 FROM rss_entries WHERE feed_id=? AND guid=?
      )
    `).bind(
      crypto.randomUUID(), feed.id, item.title, item.link, item.guid, item.description, item.publishedAt,
      feed.id, item.guid,
    ).run();
    inserted += Number(result.meta?.changes || 0);
  }

  const { limit: entriesPerFeed } = await productLimit(env, feed.owner, 'rss', 'entriesPerFeed');
  const keep = Math.max(1, entriesPerFeed ?? 20);
  await env.DB.prepare('DELETE FROM rss_entries WHERE feed_id=? AND id NOT IN (SELECT id FROM rss_entries WHERE feed_id=? ORDER BY published_at DESC, id DESC LIMIT ?)')
    .bind(feed.id, feed.id, keep).run();
  await env.DB.prepare('UPDATE rss_feeds SET last_hash=?,last_checked_at=?,updated_at=? WHERE id=?').bind(loaded.hash, now, now, feed.id).run();
  return { changed, hash: loaded.hash, extracted: extraction.items.length, inserted, mode: extraction.mode };
}

async function refreshMonitor(env: Env, monitor: any): Promise<void> {
  const usage = await consumeUsage(env, monitor.owner, 'monitor', 'checks');
  if (!usage.ok) return;
  const now = new Date().toISOString();
  try {
    const loaded = await loadPage(monitor.target_url);
    const changed = Boolean(monitor.last_hash && monitor.last_hash !== loaded.hash);
    if (changed && monitor.webhook_url) {
      const webhook = safePublicUrl(monitor.webhook_url);
      if (webhook) {
        await fetchPublic(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'PicoSvc-Monitor/1.0' },
          body: JSON.stringify({ monitorId: monitor.id, name: monitor.name, url: monitor.target_url, changedAt: now, previousHash: monitor.last_hash, hash: loaded.hash }),
        }).catch(() => undefined);
      }
    }
    await env.DB.prepare('UPDATE monitors SET last_hash=?,last_checked_at=?,last_changed_at=?,updated_at=? WHERE id=?')
      .bind(loaded.hash, now, changed ? now : monitor.last_changed_at, now, monitor.id).run();
  } catch {
    await env.DB.prepare('UPDATE monitors SET last_checked_at=?,updated_at=? WHERE id=?').bind(now, now, monitor.id).run();
  }
}

function fieldMatches(expr: string, value: number, min: number, max: number, sundaySeven = false): boolean {
  const normalizedValue = sundaySeven && value === 0 ? 7 : value;
  const testAtom = (atom: string): boolean => {
    if (atom === '*') return true;
    if (/^\*\/\d+$/.test(atom)) {
      const step = Number(atom.slice(2));
      return step >= 1 && normalizedValue % step === 0;
    }
    const range = atom.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (range) {
      const start = Number(range[1]); const end = Number(range[2]); const step = Number(range[3] || '1');
      return start >= min && end <= max && start <= normalizedValue && normalizedValue <= end && (normalizedValue - start) % step === 0;
    }
    if (/^\d+$/.test(atom)) {
      const n = Number(atom); return n >= min && n <= max && normalizedValue === n;
    }
    return false;
  };
  return expr.split(',').some((atom) => testAtom(atom.trim()));
}

export function validCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const probes = [
    [fields[0], 0, 0, 59, false], [fields[1], 0, 0, 23, false], [fields[2], 1, 1, 31, false], [fields[3], 1, 1, 12, false], [fields[4], 1, 1, 7, true],
  ] as const;
  return probes.every(([expr, value, min, max, sundaySeven]) => fieldMatches(expr, value, min, max, sundaySeven) || fieldMatches(expr, max, min, max, sundaySeven));
}

function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fieldMatches(fields[0], date.getUTCMinutes(), 0, 59)
    && fieldMatches(fields[1], date.getUTCHours(), 0, 23)
    && fieldMatches(fields[2], date.getUTCDate(), 1, 31)
    && fieldMatches(fields[3], date.getUTCMonth() + 1, 1, 12)
    && fieldMatches(fields[4], date.getUTCDay(), 0, 7, true);
}

async function runCronJob(env: Env, job: any, now: Date): Promise<void> {
  const usage = await consumeUsage(env, job.owner, 'cron', 'runs');
  if (!usage.ok) return;
  const started = Date.now(); let responseStatus: number | null = null; let error: string | null = null;
  try {
    const headers = new Headers(safeHeaderObject(JSON.parse(job.headers_json || '{}')));
    headers.set('user-agent', 'PicoSvc-Cron/1.0');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchPublic(job.target_url, {
        method: job.method,
        headers,
        body: job.method === 'GET' ? undefined : job.body,
        signal: controller.signal,
      });
      responseStatus = response.status;
    } finally { clearTimeout(timer); }
  } catch (err) { error = err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000); }
  const ranAt = now.toISOString();
  await env.DB.prepare('INSERT INTO cron_runs (id,job_id,owner,response_status,duration_ms,error,ran_at) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), job.id, job.owner, responseStatus, Date.now() - started, error, ranAt).run();
  await env.DB.prepare('UPDATE cron_jobs SET last_run_at=?,updated_at=? WHERE id=?').bind(ranAt, ranAt, job.id).run();
}

export async function runScheduledServices(env: Env, now = new Date()): Promise<void> {
  const jobs = await env.DB.prepare('SELECT * FROM cron_jobs WHERE enabled=1 ORDER BY created_at LIMIT 500').all<any>();
  for (const job of jobs.results || []) if (cronMatches(job.cron_expression, now)) await runCronJob(env, job, now);

  const monitors = await env.DB.prepare('SELECT * FROM monitors WHERE enabled=1 ORDER BY last_checked_at ASC LIMIT 100').all<any>();
  for (const monitor of monitors.results || []) {
    const last = monitor.last_checked_at ? Date.parse(monitor.last_checked_at) : 0;
    const { limit: minimumInterval } = await productLimit(env, monitor.owner, 'monitor', 'minIntervalMinutes');
    const interval = Math.max(Number(monitor.interval_minutes || 15), minimumInterval ?? 5);
    if (!last || now.getTime() - last >= interval * 60_000) await refreshMonitor(env, monitor);
  }

  const feeds = await env.DB.prepare('SELECT * FROM rss_feeds WHERE enabled=1 ORDER BY last_checked_at ASC LIMIT 100').all<any>();
  for (const feed of feeds.results || []) {
    const last = feed.last_checked_at ? Date.parse(feed.last_checked_at) : 0;
    const { limit: refreshMinutes } = await productLimit(env, feed.owner, 'rss', 'refreshMinutes');
    const interval = refreshMinutes ?? 1_440;
    if (!last || now.getTime() - last >= interval * 60_000) {
      const usage = await consumeUsage(env, feed.owner, 'rss', 'checks');
      if (usage.ok) await refreshRssFeed(env, feed).catch(() => undefined);
    }
  }
}

export async function automationManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!/^\/api\/picosvc\/(rss|cron|monitor)(?:\/|$)/.test(url.pathname)) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  if (url.pathname === '/api/picosvc/rss/feeds') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM rss_feeds WHERE owner=? ORDER BY created_at DESC').bind(owner).all<any>();
      const capacity = await resourceCapacity(env, owner, 'rss', 'feeds', 'rss_feeds');
      const { limit: refreshMinutes } = await productLimit(env, owner, 'rss', 'refreshMinutes');
      const { limit: monthlyChecks } = await productLimit(env, owner, 'rss', 'checks');
      return json({ tier: capacity.tier, limit: capacity.limit, refreshMinutes, monthlyChecks, feeds: (rows.results || []).map((row) => ({ ...row, ...serializedSelectors(row), feedUrl: `${url.origin}/rss/${row.public_id}.xml` })) });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'rss', 'feeds', 'rss_feeds'); if (!capacity.ok) return json({ error: 'RSS feed limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null; const source = safePublicUrl(body?.sourceUrl); if (!source) return json({ error: 'sourceUrl must be public HTTP(S)' }, 400);
      const id = crypto.randomUUID(); const publicId = randomPublicId(); const nowIso = new Date().toISOString();
      const itemSelector = selectorValue(body?.itemSelector); const titleSelector = selectorValue(body?.titleSelector); const linkSelector = selectorValue(body?.linkSelector); const contentSelector = selectorValue(body?.contentSelector); const dateSelector = selectorValue(body?.dateSelector);
      await env.DB.prepare('INSERT INTO rss_feeds (id,owner,public_id,name,source_url,enabled,last_hash,last_checked_at,item_selector,title_selector,link_selector,content_selector,date_selector,created_at,updated_at) VALUES (?,?,?,?,?,1,NULL,NULL,?,?,?,?,?,?,?)')
        .bind(id, owner, publicId, cleanName(body?.name, 'Web Feed'), source.toString(), itemSelector, titleSelector, linkSelector, contentSelector, dateSelector, nowIso, nowIso).run();
      const feed = await env.DB.prepare('SELECT * FROM rss_feeds WHERE id=?').bind(id).first<any>();
      if (feed) {
        const usage = await consumeUsage(env, owner, 'rss', 'checks');
        if (usage.ok) await refreshRssFeed(env, feed).catch(() => undefined);
      }
      const { limit: refreshMinutes } = await productLimit(env, owner, 'rss', 'refreshMinutes');
      return json({ id, publicId, sourceUrl: source.toString(), feedUrl: `${url.origin}/rss/${publicId}.xml`, tier: capacity.tier, refreshMinutes, selectors: { itemSelector, titleSelector, linkSelector, contentSelector, dateSelector } }, 201);
    }
  }

  const rssMatch = url.pathname.match(/^\/api\/picosvc\/rss\/feeds\/([0-9a-f-]{36})(?:\/(refresh|preview))?$/i);
  if (rssMatch) {
    const feed = await env.DB.prepare('SELECT * FROM rss_feeds WHERE id=? AND owner=?').bind(rssMatch[1], owner).first<any>(); if (!feed) return json({ error: 'RSS feed not found' }, 404);
    if (rssMatch[2] === 'preview' && request.method === 'POST') {
      const usage = await consumeUsage(env, owner, 'rss', 'checks');
      if (!usage.ok) return json({ error: 'RSS preview quota reached', ...usage }, 429);
      try { return json({ ...(await previewRssFeed(env, feed)), tier: usage.tier, monthlyChecksUsed: usage.used }); }
      catch (error) { return json({ error: 'RSS extraction failed', detail: error instanceof Error ? error.message : String(error) }, 422); }
    }
    if (rssMatch[2] === 'refresh' && request.method === 'POST') {
      const usage = await consumeUsage(env, owner, 'rss', 'checks');
      if (!usage.ok) return json({ error: 'RSS refresh quota reached', ...usage }, 429);
      try { return json({ ...(await refreshRssFeed(env, feed)), tier: usage.tier, monthlyChecksUsed: usage.used }); }
      catch (error) { return json({ error: 'RSS refresh failed', detail: error instanceof Error ? error.message : String(error) }, 422); }
    }
    if (!rssMatch[2] && request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null; const source = body?.sourceUrl === undefined ? null : safePublicUrl(body.sourceUrl); if (body?.sourceUrl !== undefined && !source) return json({ error: 'sourceUrl must be public HTTP(S)' }, 400);
      const enabled = body?.enabled === undefined ? feed.enabled : body.enabled ? 1 : 0; const name = body?.name === undefined ? feed.name : cleanName(body.name, feed.name);
      const itemSelector = body?.itemSelector === undefined ? feed.item_selector : selectorValue(body.itemSelector); const titleSelector = body?.titleSelector === undefined ? feed.title_selector : selectorValue(body.titleSelector); const linkSelector = body?.linkSelector === undefined ? feed.link_selector : selectorValue(body.linkSelector); const contentSelector = body?.contentSelector === undefined ? feed.content_selector : selectorValue(body.contentSelector); const dateSelector = body?.dateSelector === undefined ? feed.date_selector : selectorValue(body.dateSelector);
      await env.DB.prepare('UPDATE rss_feeds SET name=?,source_url=?,enabled=?,item_selector=?,title_selector=?,link_selector=?,content_selector=?,date_selector=?,updated_at=? WHERE id=? AND owner=?').bind(name, source?.toString() || feed.source_url, enabled, itemSelector, titleSelector, linkSelector, contentSelector, dateSelector, new Date().toISOString(), feed.id, owner).run();
      return json({ id: feed.id, name, sourceUrl: source?.toString() || feed.source_url, enabled: Boolean(enabled), selectors: { itemSelector, titleSelector, linkSelector, contentSelector, dateSelector } });
    }
    if (!rssMatch[2] && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM rss_feeds WHERE id=? AND owner=?').bind(feed.id, owner).run(); return new Response(null, { status: 204 }); }
  }

  if (url.pathname === '/api/picosvc/cron/jobs') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM cron_jobs WHERE owner=? ORDER BY created_at DESC').bind(owner).all(); const capacity = await resourceCapacity(env, owner, 'cron', 'jobs', 'cron_jobs');
      return json({ tier: capacity.tier, limit: capacity.limit, jobs: rows.results || [] });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'cron', 'jobs', 'cron_jobs'); if (!capacity.ok) return json({ error: 'Cron job limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null; const target = safePublicUrl(body?.targetUrl); if (!target) return json({ error: 'targetUrl must be public HTTP(S)' }, 400);
      const cron = typeof body?.cron === 'string' ? body.cron.trim() : ''; if (!validCronExpression(cron)) return json({ error: 'cron must be a valid five-field UTC expression' }, 400);
      const method = typeof body?.method === 'string' && ['GET','POST','PUT','PATCH','DELETE'].includes(body.method.toUpperCase()) ? body.method.toUpperCase() : 'GET';
      const id = crypto.randomUUID(); const nowIso = new Date().toISOString();
      await env.DB.prepare('INSERT INTO cron_jobs (id,owner,name,cron_expression,method,target_url,headers_json,body,enabled,last_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,NULL,?,?)')
        .bind(id, owner, cleanName(body?.name, 'Cron Job'), cron, method, target.toString(), JSON.stringify(safeHeaderObject(body?.headers)), typeof body?.body === 'string' ? body.body.slice(0, 256*1024) : '', nowIso, nowIso).run();
      return json({ id, name: cleanName(body?.name, 'Cron Job'), cron, method, targetUrl: target.toString(), tier: capacity.tier }, 201);
    }
  }

  const cronMatch = url.pathname.match(/^\/api\/picosvc\/cron\/jobs\/([0-9a-f-]{36})(?:\/(runs))?$/i);
  if (cronMatch) {
    const job = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id=? AND owner=?').bind(cronMatch[1], owner).first<any>(); if (!job) return json({ error: 'Cron job not found' }, 404);
    if (cronMatch[2] === 'runs' && request.method === 'GET') { const rows = await env.DB.prepare('SELECT * FROM cron_runs WHERE job_id=? AND owner=? ORDER BY ran_at DESC LIMIT 100').bind(job.id, owner).all(); return json({ job: { id: job.id, name: job.name }, runs: rows.results || [] }); }
    if (!cronMatch[2] && request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null; const target = body?.targetUrl === undefined ? null : safePublicUrl(body.targetUrl); if (body?.targetUrl !== undefined && !target) return json({ error: 'targetUrl must be public HTTP(S)' }, 400);
      const cron = body?.cron === undefined ? job.cron_expression : String(body.cron).trim(); if (!validCronExpression(cron)) return json({ error: 'invalid cron expression' }, 400);
      const enabled = body?.enabled === undefined ? job.enabled : body.enabled ? 1 : 0; const method = body?.method === undefined ? job.method : String(body.method).toUpperCase(); if (!['GET','POST','PUT','PATCH','DELETE'].includes(method)) return json({ error: 'invalid method' }, 400);
      await env.DB.prepare('UPDATE cron_jobs SET name=?,cron_expression=?,method=?,target_url=?,headers_json=?,body=?,enabled=?,updated_at=? WHERE id=? AND owner=?')
        .bind(body?.name === undefined ? job.name : cleanName(body.name, job.name), cron, method, target?.toString() || job.target_url, body?.headers === undefined ? job.headers_json : JSON.stringify(safeHeaderObject(body.headers)), body?.body === undefined ? job.body : String(body.body).slice(0,256*1024), enabled, new Date().toISOString(), job.id, owner).run();
      return json({ id: job.id, cron, method, targetUrl: target?.toString() || job.target_url, enabled: Boolean(enabled) });
    }
    if (!cronMatch[2] && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM cron_jobs WHERE id=? AND owner=?').bind(job.id, owner).run(); return new Response(null, { status: 204 }); }
  }

  if (url.pathname === '/api/picosvc/monitor') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM monitors WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      const capacity = await resourceCapacity(env, owner, 'monitor', 'monitors', 'monitors');
      const { limit: minIntervalMinutes } = await productLimit(env, owner, 'monitor', 'minIntervalMinutes');
      return json({ tier: capacity.tier, limit: capacity.limit, minIntervalMinutes, monitors: rows.results || [] });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'monitor', 'monitors', 'monitors'); if (!capacity.ok) return json({ error: 'Monitor limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null; const target = safePublicUrl(body?.targetUrl); if (!target) return json({ error: 'targetUrl must be public HTTP(S)' }, 400);
      const webhook = body?.webhookUrl ? safePublicUrl(body.webhookUrl) : null; if (body?.webhookUrl && !webhook) return json({ error: 'webhookUrl must be public HTTP(S)' }, 400);
      const { limit: minInterval } = await productLimit(env, owner, 'monitor', 'minIntervalMinutes');
      const interval = Math.max(minInterval ?? 5, Math.min(10080, Number(body?.intervalMinutes || minInterval || 15))); const id = crypto.randomUUID(); const nowIso = new Date().toISOString();
      await env.DB.prepare('INSERT INTO monitors (id,owner,name,target_url,webhook_url,interval_minutes,enabled,last_hash,last_checked_at,last_changed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,1,NULL,NULL,NULL,?,?)')
        .bind(id, owner, cleanName(body?.name, 'Page Monitor'), target.toString(), webhook?.toString() || null, interval, nowIso, nowIso).run();
      return json({ id, name: cleanName(body?.name, 'Page Monitor'), targetUrl: target.toString(), webhookUrl: webhook?.toString() || null, intervalMinutes: interval, minIntervalMinutes: minInterval, tier: capacity.tier }, 201);
    }
  }

  const monitorMatch = url.pathname.match(/^\/api\/picosvc\/monitor\/([0-9a-f-]{36})$/i);
  if (monitorMatch) {
    const monitor = await env.DB.prepare('SELECT * FROM monitors WHERE id=? AND owner=?').bind(monitorMatch[1], owner).first<any>(); if (!monitor) return json({ error: 'Monitor not found' }, 404);
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null; const target = body?.targetUrl === undefined ? null : safePublicUrl(body.targetUrl); if (body?.targetUrl !== undefined && !target) return json({ error: 'targetUrl must be public HTTP(S)' }, 400);
      const webhook = body?.webhookUrl === undefined ? undefined : body.webhookUrl ? safePublicUrl(body.webhookUrl) : null; if (body?.webhookUrl && !webhook) return json({ error: 'webhookUrl must be public HTTP(S)' }, 400);
      const { limit: minInterval } = await productLimit(env, owner, 'monitor', 'minIntervalMinutes');
      const requestedInterval = body?.intervalMinutes === undefined ? monitor.interval_minutes : Number(body.intervalMinutes);
      const interval = Math.max(minInterval ?? 5, Math.min(10080, requestedInterval)); const enabled = body?.enabled === undefined ? monitor.enabled : body.enabled ? 1 : 0;
      await env.DB.prepare('UPDATE monitors SET name=?,target_url=?,webhook_url=?,interval_minutes=?,enabled=?,updated_at=? WHERE id=? AND owner=?')
        .bind(body?.name === undefined ? monitor.name : cleanName(body.name, monitor.name), target?.toString() || monitor.target_url, webhook === undefined ? monitor.webhook_url : webhook?.toString() || null, interval, enabled, new Date().toISOString(), monitor.id, owner).run();
      return json({ id: monitor.id, enabled: Boolean(enabled), intervalMinutes: interval, minIntervalMinutes: minInterval });
    }
    if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM monitors WHERE id=? AND owner=?').bind(monitor.id, owner).run(); return new Response(null,{status:204}); }
  }

  return null;
}

export async function rssRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url); const match = url.pathname.match(/^\/rss\/([a-f0-9]{32})\.xml$/i); if (!match) return null;
  const feed = await env.DB.prepare('SELECT * FROM rss_feeds WHERE public_id=? AND enabled=1').bind(match[1].toLowerCase()).first<any>(); if (!feed) return new Response('Feed not found',{status:404});
  const { limit: entriesPerFeed } = await productLimit(env, feed.owner, 'rss', 'entriesPerFeed');
  const rows = await env.DB.prepare('SELECT * FROM rss_entries WHERE feed_id=? ORDER BY published_at DESC LIMIT ?').bind(feed.id, Math.max(1, entriesPerFeed ?? 20)).all<any>();
  const items = (rows.results || []).map((entry) => `<item><title>${xmlEscape(entry.title)}</title><link>${xmlEscape(entry.link)}</link><guid isPermaLink="false">${xmlEscape(entry.guid)}</guid><description>${xmlEscape(entry.description)}</description><pubDate>${new Date(entry.published_at).toUTCString()}</pubDate></item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(feed.name)}</title><link>${xmlEscape(feed.source_url)}</link><description>PicoSvc Web to RSS feed</description>${items}</channel></rss>`;
  return new Response(xml,{headers:{'content-type':'application/rss+xml; charset=utf-8','cache-control':'public, max-age=300'}});
}
