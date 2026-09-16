import type { Env } from '../types.js';
import { automationManagementRoutes, previewRssFeed } from './automation-services.js';
import { json } from './service-utils.js';

type Created = { id?: unknown; [key: string]: unknown };

/**
 * Do not tell users that a feed is ready when its initial extraction silently failed.
 * Use the existing create handler for authentication, ownership and quota checks;
 * only validate/finish an actual successful creation here.
 */
async function createReadyFeed(request: Request, env: Env): Promise<Response> {
  const response = await automationManagementRoutes(request, env);
  if (!response || response.status !== 201) return response || json({ error: 'RSS creation route unavailable' }, 503);
  const created = await response.clone().json().catch(() => null) as Created | null;
  if (typeof created?.id !== 'string') return response;

  const feed = await env.DB.prepare('SELECT id,owner,source_url,last_checked_at FROM rss_feeds WHERE id=?')
    .bind(created.id).first<{ id: string; owner: string; source_url: string; last_checked_at: string | null }>();
  if (!feed) return json({ error: { code: 'feed_creation_failed', message: 'The new RSS feed could not be loaded.' } }, 502);
  const entries = await env.DB.prepare('SELECT COUNT(*) AS count FROM rss_entries WHERE feed_id=?')
    .bind(feed.id).first<{ count: number }>();
  const count = Number(entries?.count || 0);
  if (feed.last_checked_at && count > 0) {
    return json({ ...created, initialItems: count, initialStatus: 'ready' }, 201);
  }

  // The legacy creation handler intentionally caught its initial fetch error.
  // Reproduce a preview only on failure, so users get an actionable reason.
  let reason = 'No RSS entries could be extracted from the source page.';
  try { await previewRssFeed(env, feed); }
  catch (error) { reason = error instanceof Error ? error.message.slice(0, 240) : 'Unable to retrieve the source page.'; }
  await env.DB.prepare('DELETE FROM rss_feeds WHERE id=? AND owner=?')
    .bind(feed.id, feed.owner).run();
  // An unsuccessful initial extraction should not consume a monthly feed check.
  await env.DB.prepare(`UPDATE product_usage_monthly
    SET quantity=MAX(0,quantity-1),updated_at=?
    WHERE owner=? AND product='rss' AND metric='checks' AND month=? AND quantity>0`)
    .bind(new Date().toISOString(), feed.owner, new Date().toISOString().slice(0, 7)).run();
  return json({ error: { code: 'initial_rss_fetch_failed', message: `RSS feed was not created: ${reason} Check the public URL or CSS selectors, then try again.` } }, 422);
}

/** New monitors use the existing advanced engine, which records fetch failures
 * and change events, instead of the legacy engine that discards fetch errors. */
async function createTrackedMonitor(request: Request, env: Env): Promise<Response> {
  const response = await automationManagementRoutes(request, env);
  if (!response || response.status !== 201) return response || json({ error: 'Monitor creation route unavailable' }, 503);
  const created = await response.clone().json().catch(() => null) as Created | null;
  if (typeof created?.id !== 'string') return response;
  const monitor = await env.DB.prepare('SELECT id,owner FROM monitors WHERE id=?')
    .bind(created.id).first<{ id: string; owner: string }>();
  if (!monitor) return json({ error: { code: 'monitor_creation_failed', message: 'The monitor could not be loaded.' } }, 502);
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO monitor_options(monitor_id,owner,enabled,content_selector,ignore_selector,strip_pattern,created_at,updated_at)
        VALUES (?,?,1,NULL,NULL,NULL,?,?)`).bind(monitor.id, monitor.owner, now, now),
      env.DB.prepare('UPDATE monitors SET enabled=0,updated_at=? WHERE id=? AND owner=?')
        .bind(now, monitor.id, monitor.owner),
    ]);
  } catch {
    await env.DB.prepare('DELETE FROM monitors WHERE id=? AND owner=?').bind(monitor.id, monitor.owner).run();
    return json({ error: { code: 'monitor_setup_unavailable', message: 'Monitor event tracking is unavailable. Apply the monitor database migration and retry.' } }, 503);
  }
  return json({ ...created, monitoringMode: 'tracked', firstCheck: 'next scheduled run' }, 201);
}

export async function reliableOnboardingRoutes(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/picosvc/rss/feeds') return createReadyFeed(request, env);
  if (pathname === '/api/picosvc/monitor') return createTrackedMonitor(request, env);
  return null;
}
