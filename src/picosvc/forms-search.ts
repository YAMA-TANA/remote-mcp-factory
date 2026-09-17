import type { Env } from '../types.js';
import { json, requireIdentity } from './service-utils.js';
import { escapeFormSearch, formCursor, parseFormCursor } from './forms-pagination.js';

const PAGE_SIZE = 100;
const EXPORT_LIMIT = 500;
const MAX_TIMESTAMP = '9999-12-31T23:59:59.999Z';
type Submission = { id: string; payload_json: string; received_at: string };

function csvCell(value: string): string {
  const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Intercepts the existing search/export endpoints without changing form intake or configuration. */
export async function formsSearchManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/picosvc\/forms\/([0-9a-f-]{36})\/(search|export)$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const form = await env.DB.prepare('SELECT id FROM forms WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ id: string }>();
  if (!form) return json({ error: 'Form not found' }, 404);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const cursor = parseFormCursor(url.searchParams.get('before'));
  if (cursor === undefined) return json({ error: 'Invalid before cursor' }, 400);
  const { timestamp, id } = cursor || { timestamp: MAX_TIMESTAMP, id: '~' };
  const query = (url.searchParams.get('q') || '').slice(0, 100);
  const exporting = match[2].toLowerCase() === 'export';
  // Bound both search and export; the extra search row determines whether another page exists.
  const rows = await env.DB.prepare(`SELECT id,payload_json,received_at FROM form_submissions
    WHERE form_id=? AND owner=? AND (received_at < ? OR (received_at = ? AND id < ?))
      AND payload_json LIKE ? ESCAPE '\\'
    ORDER BY received_at DESC,id DESC LIMIT ?`)
    .bind(form.id, identity.ownerId, timestamp, timestamp, id, `%${escapeFormSearch(query)}%`, exporting ? EXPORT_LIMIT : PAGE_SIZE + 1)
    .all<Submission>();
  const values = rows.results || [];
  if (!exporting) {
    const page = values.slice(0, PAGE_SIZE);
    return json({ formId: form.id, submissions: page.map(row => ({ id: row.id, payload: JSON.parse(row.payload_json) as unknown, receivedAt: row.received_at })),
      nextBefore: values.length > PAGE_SIZE ? formCursor(page[page.length - 1]) : null });
  }
  const lines = ['id,received_at,payload_json', ...values.map(row => [row.id, row.received_at, row.payload_json].map(csvCell).join(','))];
  return new Response(lines.join('\r\n') + '\r\n', { headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="picosvc-form-${form.id}.csv"`,
    'cache-control': 'no-store',
  } });
}
