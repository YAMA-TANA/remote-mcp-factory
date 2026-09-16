import type { Env } from '../types.js';
import { cleanName, consumeUsage, json, requireIdentity } from './service-utils.js';
import { fetchPublic, safePublicUrl } from './security.js';

const MAX_FORM_BYTES = 128 * 1024;
const MAX_CONFIG_BYTES = 32 * 1024;
const MAX_EXPORT_ROWS = 500;
type FormOptions = {
  allowed_origins_json: string;
  required_fields_json: string;
  honeypot_field: string;
  webhook_url: string | null;
  success_redirect: string | null;
  require_turnstile: number;
};

function validOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
function parseSettings(row: FormOptions) {
  return {
    allowedOrigins: JSON.parse(row.allowed_origins_json) as string[],
    requiredFields: JSON.parse(row.required_fields_json) as string[],
    honeypotField: row.honeypot_field,
    webhookUrl: row.webhook_url,
    successRedirect: row.success_redirect,
    requireTurnstile: Boolean(row.require_turnstile),
  };
}
function csvCell(value: string): string {
  const escaped = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${escaped.replaceAll('"', '""')}"`;
}
async function verifyTurnstile(env: Env, token: unknown, ip: string | null): Promise<boolean> {
  const secret = (env as Env & { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;
  if (!secret || typeof token !== 'string' || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: controller.signal });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean };
    return result.success === true;
  } catch { return false; }
  finally { clearTimeout(timer); }
}
async function readJsonLimit(request: Request, limit: number): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > limit) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function formsAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/picosvc\/forms\/([0-9a-f-]{36})\/(config|search|export|deliveries)$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;
  const form = await env.DB.prepare('SELECT * FROM forms WHERE id=? AND owner=?').bind(match[1], owner).first<any>();
  if (!form) return json({ error: 'Form not found' }, 404);
  const action = match[2].toLowerCase();
  if (action === 'config') {
    if (request.method === 'GET') {
      const options = await env.DB.prepare('SELECT * FROM form_options WHERE form_id=? AND owner=?').bind(form.id, owner).first<FormOptions>();
      return json({ formId: form.id, ...(options ? parseSettings(options) : { allowedOrigins: [], requiredFields: [], honeypotField: '_website', webhookUrl: null, successRedirect: null, requireTurnstile: false }) });
    }
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    const body = await readJsonLimit(request, MAX_CONFIG_BYTES);
    if (!body) return json({ error: 'Configuration must be a JSON object of at most 32 KiB' }, 400);
    const origins = body.allowedOrigins === undefined ? [] : body.allowedOrigins;
    if (!Array.isArray(origins) || origins.length > 20 || origins.some((value) => typeof value !== 'string' || validOrigin(value) !== value)) return json({ error: 'allowedOrigins must be an array of up to 20 exact HTTPS origins' }, 400);
    const fields = body.requiredFields === undefined ? [] : body.requiredFields;
    if (!Array.isArray(fields) || fields.length > 30 || fields.some((value) => typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(value))) return json({ error: 'requiredFields must contain up to 30 field names' }, 400);
    const honeypot = body.honeypotField === undefined ? '_website' : body.honeypotField;
    if (typeof honeypot !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(honeypot)) return json({ error: 'Invalid honeypotField' }, 400);
    const webhook = body.webhookUrl == null || body.webhookUrl === '' ? null : safePublicUrl(body.webhookUrl);
    if (body.webhookUrl && !webhook) return json({ error: 'webhookUrl must be a public HTTP(S) URL' }, 400);
    const redirect = body.successRedirect == null || body.successRedirect === '' ? null : safePublicUrl(body.successRedirect);
    if (body.successRedirect && !redirect) return json({ error: 'successRedirect must be a public HTTP(S) URL' }, 400);
    const turnstile = body.requireTurnstile === true;
    if (turnstile && !(env as Env & { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY) return json({ error: 'TURNSTILE_SECRET_KEY must be configured before enabling verification' }, 503);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO form_options (form_id,owner,allowed_origins_json,required_fields_json,honeypot_field,webhook_url,success_redirect,require_turnstile,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(form_id) DO UPDATE SET allowed_origins_json=excluded.allowed_origins_json,required_fields_json=excluded.required_fields_json,honeypot_field=excluded.honeypot_field,webhook_url=excluded.webhook_url,success_redirect=excluded.success_redirect,require_turnstile=excluded.require_turnstile,updated_at=excluded.updated_at`)
      .bind(form.id, owner, JSON.stringify(origins), JSON.stringify(fields), honeypot, webhook?.toString() || null, redirect?.toString() || null, turnstile ? 1 : 0, now, now).run();
    return json({ formId: form.id, allowedOrigins: origins, requiredFields: fields, honeypotField: honeypot, webhookUrl: webhook?.toString() || null, successRedirect: redirect?.toString() || null, requireTurnstile: turnstile });
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (action === 'deliveries') {
    const rows = await env.DB.prepare('SELECT id,submission_id,destination,response_status,error,delivered_at FROM form_deliveries WHERE form_id=? AND owner=? ORDER BY delivered_at DESC LIMIT 100').bind(form.id, owner).all();
    return json({ formId: form.id, deliveries: rows.results || [] });
  }
  const query = (url.searchParams.get('q') || '').slice(0, 100);
  const before = url.searchParams.get('before') || '9999-12-31T23:59:59.999Z';
  const rows = await env.DB.prepare('SELECT id,payload_json,received_at FROM form_submissions WHERE form_id=? AND owner=? AND received_at<? AND payload_json LIKE ? ORDER BY received_at DESC,id DESC LIMIT ?')
    .bind(form.id, owner, before, `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`, action === 'export' ? MAX_EXPORT_ROWS : 100).all<any>();
  if (action === 'search') return json({ formId: form.id, submissions: (rows.results || []).map((row) => ({ id: row.id, payload: JSON.parse(row.payload_json), receivedAt: row.received_at })), nextBefore: rows.results?.length === 100 ? rows.results.at(-1)?.received_at : null });
  const lines = ['id,received_at,payload_json', ...(rows.results || []).map((row) => [row.id, row.received_at, row.payload_json].map(csvCell).join(','))];
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="picosvc-form-${form.id}.csv"`, 'cache-control': 'no-store' } });
}

export async function formsAdvancedRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/forms\/([a-f0-9]{32})$/i);
  if (!match) return null;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const form = await env.DB.prepare('SELECT * FROM forms WHERE public_id=? AND enabled=1').bind(match[1].toLowerCase()).first<any>();
  if (!form) return json({ error: 'Form not found' }, 404);
  const options = await env.DB.prepare('SELECT * FROM form_options WHERE form_id=?').bind(form.id).first<FormOptions>();
  if (!options) return null; // Legacy forms retain their original behavior until explicitly configured.
  const settings = parseSettings(options);
  const origin = request.headers.get('origin');
  if (settings.allowedOrigins.length && (!origin || !settings.allowedOrigins.includes(origin))) return json({ error: 'Origin not allowed' }, 403);
  if (Number(request.headers.get('content-length') || '0') > MAX_FORM_BYTES) return json({ error: 'Submission is limited to 128 KiB' }, 413);
  const type = (request.headers.get('content-type') || '').toLowerCase();
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_FORM_BYTES) return json({ error: 'Submission is limited to 128 KiB' }, 413);
  let payload: Record<string, unknown>;
  try {
    if (type.includes('application/json')) {
      const candidate: unknown = JSON.parse(text);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('invalid');
      payload = candidate as Record<string, unknown>;
    } else if (type.includes('application/x-www-form-urlencoded')) payload = Object.fromEntries(new URLSearchParams(text).entries());
    else return json({ error: 'Use application/json or application/x-www-form-urlencoded' }, 415);
  } catch { return json({ error: 'Invalid form body' }, 400); }
  if (Object.keys(payload).length > 100) return json({ error: 'Too many form fields' }, 400);
  if (payload[settings.honeypotField]) return json({ accepted: true }, 202); // Do not store or charge obvious bots.
  if (settings.requiredFields.some((field) => payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '')) return json({ error: 'Required fields are missing' }, 422);
  if (Object.values(payload).some((value) => typeof value === 'string' && value.length > 20_000)) return json({ error: 'A field exceeds 20,000 characters' }, 413);
  if (settings.requireTurnstile && !(await verifyTurnstile(env, payload['cf-turnstile-response'], request.headers.get('cf-connecting-ip')))) return json({ error: 'Turnstile verification failed' }, 403);
  delete payload[settings.honeypotField]; delete payload['cf-turnstile-response'];
  const usage = await consumeUsage(env, form.owner, 'forms', 'submissions');
  if (!usage.ok) return json({ error: 'Form submission quota reached', ...usage }, 429);
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const headers = { origin: origin || null, referer: (request.headers.get('referer') || '').slice(0, 1000) };
  await env.DB.prepare('INSERT INTO form_submissions (id,form_id,owner,payload_json,headers_json,received_at) VALUES (?,?,?,?,?,?)')
    .bind(id, form.id, form.owner, JSON.stringify(payload), JSON.stringify(headers), now).run();
  if (settings.webhookUrl) {
    let status: number | null = null; let error: string | null = null;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchPublic(settings.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'PicoSvc-Forms/1.0' }, body: JSON.stringify({ formId: form.id, submissionId: id, receivedAt: now, payload }), signal: controller.signal });
      status = response.status;
      if (!response.ok) error = `Webhook returned HTTP ${response.status}`;
    } catch (err) { error = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300); }
    finally { clearTimeout(timer); }
    await env.DB.prepare('INSERT INTO form_deliveries (id,form_id,submission_id,owner,destination,response_status,error,delivered_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), form.id, id, form.owner, settings.webhookUrl, status, error, new Date().toISOString()).run();
  }
  if (settings.successRedirect && (request.headers.get('accept') || '').includes('text/html')) return Response.redirect(settings.successRedirect, 303);
  return json({ accepted: true, submissionId: id, receivedAt: now }, 202);
}
