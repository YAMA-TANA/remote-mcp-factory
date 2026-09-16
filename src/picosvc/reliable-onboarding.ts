import type { Env } from '../types.js';
import { automationManagementRoutes, previewRssFeed } from './automation-services.js';
import { json } from './service-utils.js';

type Created = { id?: unknown; [key: string]: unknown };

/** Do not report a feed as ready when its initial fetch or configured item extraction failed. */
async function createReadyFeed(request: Request, env: Env): Promise<Response> {
  const response = await automationManagementRoutes(request, env);
  if (!response || response.status !== 201) return response || json({ error: 'RSS creation route unavailable' }, 503);
  const created = await response.clone().json().catch(() => null) as Created | null;
  if (typeof created?.id !== 'string') return response;

  const feed = await env.DB.prepare('SELECT id,owner,source_url,item_selector,last_checked_at FROM rss_feeds WHERE id=?')
    .bind(created.id).first<{ id: string; owner: string; source_url: string; item_selector: string | null; last_checked_at: string | null }>();
  if (!feed) return json({ error: 'The new RSS feed could not be loaded.', code: 'feed_creation_failed' }, 502);
  const entries = await env.DB.prepare('SELECT COUNT(*) AS count FROM rss_entries WHERE feed_id=?')
    .bind(feed.id).first<{ count: number }>();
  const count = Number(entries?.count || 0);
  let selectorFailure = '';
  if (feed.item_selector && feed.last_checked_at && count > 0) {
    // The extractor can silently replace an empty explicit selection with a
    // synthetic whole-page item. Confirm an explicit selector really found items.
    try {
      const preview = await previewRssFeed(env, feed);
      if (preview.mode !== 'selectors' || preview.items.length === 0) {
        selectorFailure = `The item selector "${feed.item_selector.slice(0, 80)}" did not produce any valid articles.`;
      }
    } catch (error) {
      selectorFailure = `Could not verify the item selector: ${error instanceof Error ? error.message.slice(0, 180) : 'source is unavailable'}.`;
    }
  }
  if (feed.last_checked_at && count > 0 && !selectorFailure) {
    return json({ ...created, initialItems: count, initialStatus: 'ready' }, 201);
  }

  // The legacy creation handler catches initial fetch errors. Use a preview
  // only on failure to offer a useful reason instead of leaving a ghost feed.
  let reason = selectorFailure || 'No RSS entries could be extracted from the source page.';
  if (!selectorFailure) {
    try { await previewRssFeed(env, feed); }
    catch (error) { reason = error instanceof Error ? error.message.slice(0, 240) : 'Unable to retrieve the source page.'; }
  }
  await env.DB.prepare('DELETE FROM rss_feeds WHERE id=? AND owner=?')
    .bind(feed.id, feed.owner).run();
  // The attempted fetch may incur provider costs, and another request may have
  // incremented shared usage concurrently. Never blindly refund a shared quota.
  return json({
    error: `RSS feed was not created: ${reason} Check the public URL or CSS selectors, then try again.`,
    code: selectorFailure ? 'rss_selector_no_items' : 'initial_rss_fetch_failed',
  }, 422);
}

/** New monitors use the advanced engine, which records fetch failures and
 * change events, instead of the legacy engine that discards fetch errors. */
async function createTrackedMonitor(request: Request, env: Env): Promise<Response> {
  const response = await automationManagementRoutes(request, env);
  if (!response || response.status !== 201) return response || json({ error: 'Monitor creation route unavailable' }, 503);
  const created = await response.clone().json().catch(() => null) as Created | null;
  if (typeof created?.id !== 'string') return response;
  const monitor = await env.DB.prepare('SELECT id,owner FROM monitors WHERE id=?')
    .bind(created.id).first<{ id: string; owner: string }>();
  if (!monitor) return json({ error: 'The monitor could not be loaded.', code: 'monitor_creation_failed' }, 502);
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
    return json({ error: 'Monitor event tracking is unavailable. Apply the monitor database migration and retry.', code: 'monitor_setup_unavailable' }, 503);
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
