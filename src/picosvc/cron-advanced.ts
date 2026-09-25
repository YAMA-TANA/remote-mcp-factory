import type { Env } from '../types.js';
import { cronMatchesInTimezone, validCronExpression, validTimezone } from './cron-calendar.js';
import { cleanName, consumeUsage, json, requireIdentity, resourceCapacity } from './service-utils.js';
import { safeHeaderObject, safePublicUrl } from './security.js';
import { fetchPicoSvcTarget, type InternalPicoSvcDispatch } from './internal-dispatch.js';

const METHODS = new Set(['GET','POST','PUT','PATCH','DELETE']);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RUN_MS = 10_000;
const RETRY_BACKOFF_MS = [1_000, 3_000, 9_000];

type CronRow = {
  id: string; owner: string; name: string; cron_expression: string; method: string; target_url: string;
  headers_json: string; body: string; enabled: number; last_run_at: string | null;
  timezone: string | null; expected_status: number | null; max_retries: number | null;
  notification_url: string | null; active: number | null;
};

function optionNumber(value: unknown, current: number, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return current;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
function optionalPublicUrl(value: unknown): string | null | false {
  if (value === null || value === '') return null;
  const url = safePublicUrl(value);
  return url ? url.toString() : false;
}
function validatedBody(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_BODY_BYTES) return null;
  return value;
}
function details(job: CronRow) {
  return {
    id: job.id, name: job.name, cron: job.cron_expression, method: job.method, targetUrl: job.target_url,
    enabled: job.active === null ? Boolean(job.enabled) : Boolean(job.active),
    mode: job.active === null ? 'legacy' : 'advanced',
    timezone: job.timezone || 'UTC', expectedStatus: job.expected_status,
    maxRetries: job.max_retries ?? 0, notificationUrl: job.notification_url,
    lastRunAt: job.last_run_at,
  };
}

export async function cronAdvancedManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/cron/')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;
  const select = `SELECT j.*,o.timezone,o.expected_status,o.max_retries,o.notification_url,o.active
    FROM cron_jobs j LEFT JOIN cron_job_options o ON o.job_id=j.id WHERE j.owner=?`;

  if (url.pathname === '/api/picosvc/cron/jobs') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare(`${select} ORDER BY j.created_at DESC LIMIT 500`).bind(owner).all<CronRow>();
      const capacity = await resourceCapacity(env, owner, 'cron', 'jobs', 'cron_jobs');
      return json({ tier: capacity.tier, limit: capacity.limit, jobs: (rows.results || []).map(details) });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'GET,POST' } });
    const capacity = await resourceCapacity(env, owner, 'cron', 'jobs', 'cron_jobs');
    if (!capacity.ok) return json({ error: 'Cron job limit reached', ...capacity }, 402);
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    const target = safePublicUrl(input?.targetUrl);
    const cron = typeof input?.cron === 'string' ? input.cron.trim() : '';
    const timezone = validTimezone(input?.timezone === undefined || input.timezone === '' ? 'UTC' : input.timezone);
    const method = typeof input?.method === 'string' ? input.method.trim().toUpperCase() : 'GET';
    const body = validatedBody(input?.body);
    const expected = input?.expectedStatus === undefined || input?.expectedStatus === null || input?.expectedStatus === '' ? null : optionNumber(input.expectedStatus, 200, 100, 599);
    const retries = optionNumber(input?.maxRetries, 2, 0, 3);
    const notification = optionalPublicUrl(input?.notificationUrl);
    const invalidFields = [
      !target && 'targetUrl', !validCronExpression(cron) && 'cron', !timezone && 'timezone',
      !METHODS.has(method) && 'method', body === null && 'body', retries === null && 'maxRetries',
      notification === false && 'notificationUrl',
      input?.expectedStatus !== undefined && input.expectedStatus !== null && input.expectedStatus !== '' && expected === null && 'expectedStatus',
    ].filter((field): field is string => Boolean(field));
    if (invalidFields.length || !target) return json({ error: `Invalid Cron configuration: ${invalidFields.join(', ') || 'targetUrl'}`, fields: invalidFields }, 400);
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO cron_jobs (id,owner,name,cron_expression,method,target_url,headers_json,body,enabled,last_run_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,0,NULL,?,?)`)
        .bind(id, owner, cleanName(input?.name, 'Cron Job'), cron, method, target.toString(), JSON.stringify(safeHeaderObject(input?.headers)), body, now, now),
      env.DB.prepare(`INSERT INTO cron_job_options (job_id,owner,timezone,expected_status,max_retries,notification_url,active,updated_at)
        VALUES (?,?,?,?,?,?,1,?)`).bind(id, owner, timezone, expected, retries, notification, now),
    ]);
    return json({ id, name: cleanName(input?.name, 'Cron Job'), cron, timezone, method, targetUrl: target.toString(), expectedStatus: expected, maxRetries: retries, notificationUrl: notification, enabled: true, tier: capacity.tier }, 201);
  }

  const match = url.pathname.match(/^\/api\/picosvc\/cron\/jobs\/([0-9a-f-]{36})(?:\/(runs))?$/i);
  if (!match) return null;
  const job = await env.DB.prepare(`${select} AND j.id=?`).bind(owner, match[1]).first<CronRow>();
  if (!job) return json({ error: 'Cron job not found' }, 404);
  if (match[2] === 'runs') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
    const rows = await env.DB.prepare('SELECT * FROM cron_runs WHERE job_id=? AND owner=? ORDER BY ran_at DESC LIMIT 100').bind(job.id, owner).all();
    const attempts = await env.DB.prepare('SELECT a.* FROM cron_run_attempts a JOIN cron_runs r ON a.run_id=r.id WHERE r.job_id=? AND r.owner=? ORDER BY a.attempted_at DESC LIMIT 400')
      .bind(job.id, owner).all();
    const notifications = await env.DB.prepare('SELECT id,run_id,status,response_status,error,sent_at FROM cron_notifications WHERE job_id=? AND owner=? ORDER BY sent_at DESC LIMIT 100')
      .bind(job.id, owner).all();
    return json({ job: details(job), runs: rows.results || [], attempts: attempts.results || [], notifications: notifications.results || [] });
  }
  if (request.method === 'GET') return json(details(job));
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM cron_jobs WHERE id=? AND owner=?').bind(job.id, owner).run();
    return new Response(null, { status: 204 });
  }
  if (request.method !== 'PATCH') return new Response(null, { status: 405, headers: { allow: 'GET,PATCH,DELETE' } });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const target = input?.targetUrl === undefined ? job.target_url : optionalPublicUrl(input.targetUrl);
  const cron = input?.cron === undefined ? job.cron_expression : typeof input.cron === 'string' ? input.cron.trim() : '';
  const timezone = validTimezone(input?.timezone === undefined || input.timezone === '' ? 'UTC' : input.timezone);
  const method = input?.method === undefined ? job.method : typeof input.method === 'string' ? input.method.trim().toUpperCase() : '';
  const body = input?.body === undefined ? job.body : validatedBody(input.body);
  const expected = input?.expectedStatus === undefined ? job.expected_status : input.expectedStatus === null || input.expectedStatus === '' ? null : optionNumber(input.expectedStatus, 200, 100, 599);
  const retries = optionNumber(input?.maxRetries, job.max_retries ?? 2, 0, 3);
  const notification = input?.notificationUrl === undefined ? job.notification_url : optionalPublicUrl(input.notificationUrl);
  const invalidFields = [
    typeof target !== 'string' && 'targetUrl', !validCronExpression(cron) && 'cron', !timezone && 'timezone',
    !METHODS.has(method) && 'method', body === null && 'body', retries === null && 'maxRetries',
    notification === false && 'notificationUrl',
    input?.expectedStatus !== undefined && input.expectedStatus !== null && input.expectedStatus !== '' && expected === null && 'expectedStatus',
  ].filter((field): field is string => Boolean(field));
  if (invalidFields.length) return json({ error: `Invalid Cron configuration: ${invalidFields.join(', ')}`, fields: invalidFields }, 400);
  const active = input?.enabled === undefined ? job.active === null ? Boolean(job.enabled) : Boolean(job.active) : input.enabled === true;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE cron_jobs SET name=?,cron_expression=?,method=?,target_url=?,headers_json=?,body=?,enabled=0,updated_at=? WHERE id=? AND owner=?`)
      .bind(input?.name === undefined ? job.name : cleanName(input.name, job.name), cron, method, target, input?.headers === undefined ? job.headers_json : JSON.stringify(safeHeaderObject(input.headers)), body, now, job.id, owner),
    env.DB.prepare(`INSERT INTO cron_job_options (job_id,owner,timezone,expected_status,max_retries,notification_url,active,updated_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET timezone=excluded.timezone,expected_status=excluded.expected_status,
      max_retries=excluded.max_retries,notification_url=excluded.notification_url,active=excluded.active,updated_at=excluded.updated_at`)
      .bind(job.id, owner, timezone, expected, retries, notification, active ? 1 : 0, now),
  ]);
  return json({ id: job.id, cron, timezone, method, targetUrl: target, expectedStatus: expected, maxRetries: retries, notificationUrl: notification, enabled: active });
}

async function sleep(ms: number): Promise<void> { await new Promise<void>((resolve) => setTimeout(resolve, ms)); }
async function attemptRequest(env: Env, job: CronRow, dispatchInternal?: InternalPicoSvcDispatch): Promise<{ status: number | null; error: string | null; duration: number }> {
  const start = Date.now(); let status: number | null = null; let error: string | null = null;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), MAX_RUN_MS);
  try {
    const headers = new Headers(safeHeaderObject(JSON.parse(job.headers_json || '{}')));
    headers.set('user-agent', 'PicoSvc-Cron/2.0');
    const response = await fetchPicoSvcTarget(job.target_url, { method: job.method, headers, body: job.method === 'GET' || job.method === 'HEAD' ? undefined : job.body, signal: controller.signal }, env, dispatchInternal);
    status = response.status;
    if (job.expected_status !== null && job.expected_status !== undefined ? status !== job.expected_status : status < 200 || status >= 300) error = `Unexpected HTTP ${status}`;
  } catch (err) { error = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500); }
  finally { clearTimeout(timeout); }
  return { status, error, duration: Date.now() - start };
}

async function dispatch(env: Env, job: CronRow, now: Date, dispatchInternal?: InternalPicoSvcDispatch): Promise<void> {
  const minute = now.toISOString().slice(0, 16);
  const claimed = await env.DB.prepare(`INSERT INTO cron_dispatch_claims (job_id,scheduled_minute,claimed_at)
    VALUES (?,?,?) ON CONFLICT(job_id,scheduled_minute) DO NOTHING RETURNING job_id`).bind(job.id, minute, new Date().toISOString()).first();
  if (!claimed) return;
  const usage = await consumeUsage(env, job.owner, 'cron', 'runs');
  if (!usage.ok) {
    await env.DB.prepare('DELETE FROM cron_dispatch_claims WHERE job_id=? AND scheduled_minute=?').bind(job.id, minute).run();
    return;
  }
  const id = crypto.randomUUID(); const timestamp = now.toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO cron_runs (id,job_id,owner,response_status,duration_ms,error,ran_at) VALUES (?,?,?,NULL,0,NULL,?)')
      .bind(id, job.id, job.owner, timestamp),
    env.DB.prepare('UPDATE cron_jobs SET last_run_at=?,updated_at=? WHERE id=? AND owner=?')
      .bind(timestamp, timestamp, job.id, job.owner),
  ]);
  let last: { status: number | null; error: string | null; duration: number } = { status: null, error: 'No attempt', duration: 0 };
  let totalDuration = 0;
  for (let attempt = 1; attempt <= (job.max_retries ?? 0) + 1; attempt += 1) {
    if (attempt > 1) await sleep(RETRY_BACKOFF_MS[attempt - 2]);
    last = await attemptRequest(env, job, dispatchInternal);
    totalDuration += last.duration;
    await env.DB.prepare(`INSERT INTO cron_run_attempts (run_id,job_id,owner,attempt,response_status,duration_ms,error,attempted_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(id, job.id, job.owner, attempt, last.status, last.duration, last.error, new Date().toISOString()).run();
    if (!last.error) break;
  }
  await env.DB.prepare('UPDATE cron_runs SET response_status=?,duration_ms=?,error=? WHERE id=? AND owner=?')
    .bind(last.status, totalDuration, last.error, id, job.owner).run();
  if (!last.error || !job.notification_url) return;
  let notificationStatus: number | null = null; let notificationError: string | null = null;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetchPicoSvcTarget(job.notification_url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'PicoSvc-Cron/2.0' },
      body: JSON.stringify({ jobId: job.id, name: job.name, runId: id, failedAt: new Date().toISOString(), responseStatus: last.status, error: last.error }),
      signal: controller.signal,
    }, env, dispatchInternal);
    notificationStatus = response.status;
    if (!response.ok) notificationError = `HTTP ${response.status}`;
  } catch (err) { notificationError = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500); }
  finally { clearTimeout(timeout); }
  await env.DB.prepare(`INSERT INTO cron_notifications (id,run_id,job_id,owner,status,response_status,error,sent_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, job.id, job.owner, notificationError ? 'failed' : 'delivered', notificationStatus, notificationError, new Date().toISOString()).run();
}

export async function runAdvancedCronJobs(env: Env, now = new Date(), dispatchInternal?: InternalPicoSvcDispatch): Promise<void> {
  const jobs = await env.DB.prepare(`SELECT j.*,o.timezone,o.expected_status,o.max_retries,o.notification_url,o.active
    FROM cron_jobs j JOIN cron_job_options o ON o.job_id=j.id WHERE o.active=1 AND j.enabled=0 ORDER BY j.created_at LIMIT 100`).all<CronRow>();
  const due = (jobs.results || []).filter((job) => cronMatchesInTimezone(job.cron_expression, now, job.timezone || 'UTC'));
  for (let i = 0; i < due.length; i += 5) {
    await Promise.allSettled(due.slice(i, i + 5).map((job) => dispatch(env, job, now, dispatchInternal)));
  }
  // Dispatch claims are only needed to dedupe overlapping runs of a given minute.
  await env.DB.prepare('DELETE FROM cron_dispatch_claims WHERE scheduled_minute<?')
    .bind(new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 16)).run();
}
