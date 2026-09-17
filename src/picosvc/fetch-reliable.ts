import type { Env } from '../types.js';
import { readBoundedResponse, readFetchJson, ResponseLimitError } from './bounded-response.js';
import { appearsBinary } from './fetch-safety.js';
import { consumeUsage, json, requireIdentity } from './service-utils.js';
import { fetchPublic, safePublicUrl } from './security.js';

const MAX_BYTES = 2 * 1024 * 1024;
const TEXT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);

function fail(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function decode(bytes: Uint8Array, contentType: string | null): string {
  const charset = contentType?.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return new TextDecoder().decode(bytes); }
}

function htmlEntityDecode(value: string): string {
  return value.replace(/&(?:amp|quot|#39|lt|gt);/gi, entity => ({
    '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>',
  }[entity.toLowerCase()] || entity));
}

function metadata(html: string, url: string, readable: boolean) {
  const cleaned = readable
    ? html.replace(/<(script|style|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    : html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)?.[1] || '';
  const canonicalValue = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i)?.[1];
  let canonical: string | null = null;
  if (canonicalValue) {
    try {
      const candidate = new URL(htmlEntityDecode(canonicalValue), url);
      if ((candidate.protocol === 'https:' || candidate.protocol === 'http:') && !candidate.username && !candidate.password) canonical = candidate.toString();
    } catch { /* Invalid canonical links must not turn successful fetches into 502 errors. */ }
  }
  return {
    title: htmlEntityDecode(title.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
    description: htmlEntityDecode(description.trim()),
    canonical,
    textPreview: htmlEntityDecode(cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4_000)),
  };
}

/** This route runs before the former unbounded utility Fetch implementation. */
export async function reliableFetchRoute(request: Request, env: Env): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/picosvc/fetch') return null;
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const parsed = await readFetchJson(request);
  if (!parsed.ok) return fail(parsed.code, parsed.message, parsed.status);
  const input = parsed.value;
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null;
  if (!body) return fail('invalid_request', 'A JSON request body is required.', 400);
  const target = safePublicUrl(body.url);
  if (!target) return fail('invalid_url', 'url must be a public HTTP(S) URL on port 80 or 443.', 400);
  if (body.format !== undefined && body.format !== 'markdown' && body.format !== 'metadata') return fail('invalid_format', 'format must be markdown or metadata.', 400);
  const format = body.format === 'metadata' ? 'metadata' : 'markdown';
  if (format === 'markdown' && !env.BROWSER) return fail('browser_unavailable', 'Browser Run is not configured.', 503);
  const timeoutMs = typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs)
    ? Math.max(1_000, Math.min(20_000, Math.trunc(body.timeoutMs))) : 15_000;
  const readable = body.readable === true;
  const usage = await consumeUsage(env, identity.ownerId, 'fetch', 'requests');
  if (!usage.ok) return json({ error: { code: 'quota_reached', message: 'Fetch quota reached.' }, ...usage }, 429);

  // The same deadline covers browser navigation, upstream redirects AND body streaming.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('fetch_timeout')); }, timeoutMs + 2_000);
  });
  try {
    const perform = async (): Promise<Response> => {
      if (format === 'markdown') {
        const waitUntil = body.waitUntil === 'networkidle0' ? 'networkidle0'
          : body.waitUntil === 'networkidle2' ? 'networkidle2' : 'domcontentloaded';
        const response = await env.BROWSER!.quickAction('markdown', {
          url: target.toString(), gotoOptions: { timeout: timeoutMs, waitUntil },
        });
        if (!response.ok) return fail('browser_error', `Browser Run returned HTTP ${response.status}.`, 502);
        const bytes = await readBoundedResponse(response, MAX_BYTES, controller.signal);
        const markdown = decode(bytes, response.headers.get('content-type'));
        if (!markdown.trim()) return fail('empty_content', 'No readable markdown was returned. The page may require authentication or JavaScript.', 422);
        return json({ schema: 'picosvc.fetch.v1', url: target.toString(), format, readable, markdown, bytes: bytes.byteLength, tier: usage.tier });
      }

      const response = await fetchPublic(target, {
        headers: { 'user-agent': 'PicoSvc-Fetch/2.0', accept: 'text/html,application/xhtml+xml,text/plain;q=0.8' },
        signal: controller.signal,
      });
      if (!response.ok) return fail('upstream_http', `Upstream returned HTTP ${response.status}.`, 502);
      const contentType = response.headers.get('content-type');
      const type = contentType?.split(';', 1)[0].trim().toLowerCase();
      if (type && !TEXT_TYPES.has(type)) {
        void response.body?.cancel().catch(() => undefined);
        return fail('unsupported_content_type', `Metadata requires HTML or plain text, but upstream returned ${type}.`, 415);
      }
      const bytes = await readBoundedResponse(response, MAX_BYTES, controller.signal);
      if (!bytes.byteLength) return fail('empty_content', 'Upstream returned an empty document.', 422);
      if (appearsBinary(bytes, contentType)) return fail('unsupported_content_type', 'Metadata requires text, but upstream returned binary content.', 415);
      const html = decode(bytes, contentType);
      const actualUrl = safePublicUrl(response.url)?.toString() || target.toString();
      const details = metadata(html, actualUrl, readable);
      if (!details.title && !details.description && !details.textPreview) return fail('empty_content', 'No readable content was found in the document.', 422);
      return json({ schema: 'picosvc.fetch.v1', url: actualUrl, format, readable, bytes: bytes.byteLength, contentType, ...details, tier: usage.tier });
    };
    return await Promise.race([perform(), deadline]);
  } catch (error) {
    if (error instanceof ResponseLimitError) return fail('output_too_large', 'Fetch response exceeds the 2 MiB limit.', 413);
    if (controller.signal.aborted || (error instanceof Error && /timeout|abort/i.test(error.message))) return fail('timeout', 'Fetching or reading the response timed out.', 504);
    return fail('fetch_failed', 'Could not fetch this page. Confirm the URL is publicly accessible.', 502);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
