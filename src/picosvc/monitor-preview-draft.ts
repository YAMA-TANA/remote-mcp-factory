import type { Env } from '../types.js';
import { extractMonitorContent } from './monitor-advanced.js';
import { validStripPattern } from './monitor-text.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { fetchPublic, sha256Hex } from './security.js';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
type Options = { contentSelector: string | null; ignoreSelector: string | null; stripPattern: string | null };

function selector(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 200 || value.includes('\0')) return undefined;
  return value.trim() || null;
}

/** Preview ONLY: never mutate monitor_options or replace the saved comparison baseline. */
export async function monitorDraftPreviewRoute(request: Request, env: Env): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(/^\/api\/picosvc\/monitor\/([0-9a-f-]{36})\/preview$/i);
  if (!match) return null;
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const monitor = await env.DB.prepare('SELECT id,owner,target_url FROM monitors WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ id: string; owner: string; target_url: string }>();
  if (!monitor) return json({ error: { code: 'not_found', message: 'Monitor not found' } }, 404);
  const saved = await env.DB.prepare('SELECT content_selector,ignore_selector,strip_pattern FROM monitor_options WHERE monitor_id=? AND owner=?')
    .bind(monitor.id, identity.ownerId).first<{ content_selector: string | null; ignore_selector: string | null; strip_pattern: string | null }>();

  let draft: Record<string, unknown> | null = null;
  if ((request.headers.get('content-length') || '0') !== '0') {
    const raw = await request.text().catch(() => '');
    if (raw.length > 4_096) return json({ error: { code: 'invalid_options', message: 'Preview options exceed 4 KiB' } }, 413);
    if (raw.trim()) {
      try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid options'); draft = parsed as Record<string, unknown>; }
      catch { return json({ error: { code: 'invalid_options', message: 'Preview requires a JSON object' } }, 400); }
    }
  }
  const contentSelector = selector(draft?.contentSelector === undefined ? saved?.content_selector ?? null : draft.contentSelector);
  const ignoreSelector = selector(draft?.ignoreSelector === undefined ? saved?.ignore_selector ?? null : draft.ignoreSelector);
  const stripRaw = draft?.stripPattern === undefined ? saved?.strip_pattern ?? null : draft.stripPattern;
  const stripPattern = validStripPattern(stripRaw);
  if (contentSelector === undefined || ignoreSelector === undefined || (stripRaw != null && stripRaw !== '' && stripPattern === null)) {
    return json({ error: { code: 'invalid_options', message: 'Selectors must be at most 200 characters; stripPattern must use the supported safe regex subset.' } }, 400);
  }
  const options: Options = { contentSelector, ignoreSelector, stripPattern };
  const usage = await consumeUsage(env, identity.ownerId, 'monitor', 'checks');
  if (!usage.ok) return json({ error: { code: 'quota_reached', message: 'Monitor check quota reached' }, ...usage }, 429);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetchPublic(monitor.target_url, { headers: { 'user-agent': 'PicoSvc-Monitor/2.0' }, signal: controller.signal });
    if (!upstream.ok) return json({ error: { code: 'upstream_error', message: `Target returned HTTP ${upstream.status}.` } }, 422);
    if (Number(upstream.headers.get('content-length') || '0') > MAX_HTML_BYTES) return json({ error: { code: 'page_too_large', message: 'Source page exceeds 2 MiB.' } }, 413);
    if (!upstream.body) return json({ error: { code: 'empty_response', message: 'The target returned no document.' } }, 422);
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_HTML_BYTES) { await reader.cancel(); return json({ error: { code: 'page_too_large', message: 'Source page exceeds 2 MiB.' } }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    const text = await extractMonitorContent(new TextDecoder().decode(bytes), {
      content_selector: options.contentSelector, ignore_selector: options.ignoreSelector, strip_pattern: options.stripPattern,
    });
    if (!text.trim()) return json({ error: { code: 'empty_extraction', message: options.contentSelector
      ? 'The selected element has no extractable text. Check the CSS selector or whether the page requires JavaScript.'
      : 'No text could be extracted. The page may require JavaScript or contain only images.' } }, 422);
    return json({ monitorId: monitor.id, text: text.slice(0, 2_000), hash: await sha256Hex(text), source: draft ? 'draft' : 'saved', options, monthlyChecksUsed: usage.used, note: 'Preview only: saved settings and change-detection baseline were not modified.' });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    return json({ error: { code: timedOut ? 'fetch_timeout' : 'preview_failed', message: timedOut ? 'The target did not respond within 8 seconds.' : 'Could not retrieve or extract the page. Verify its URL and CSS selectors.' }, detail: error instanceof Error ? error.message.slice(0, 180) : undefined }, timedOut ? 504 : 422);
  } finally { clearTimeout(timer); }
}
