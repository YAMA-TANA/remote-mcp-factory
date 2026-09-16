import type { Env } from '../types.js';
import { cleanName, json, requireIdentity, resourceCapacity } from './service-utils.js';
import { safeHeaderObject, safePublicUrl } from './security.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

type FieldSpec = { min: number; max: number };
const SPECS: FieldSpec[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
];

function validAtom(atom: string, spec: FieldSpec): boolean {
  if (atom === '*') return true;
  const stepOnly = atom.match(/^\*\/(\d+)$/);
  if (stepOnly) {
    const step = Number(stepOnly[1]);
    return step >= 1 && step <= spec.max - spec.min + 1;
  }
  const range = atom.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    const step = Number(range[3] || '1');
    return start >= spec.min && end <= spec.max && start <= end && step >= 1 && step <= spec.max - spec.min + 1;
  }
  if (/^\d+$/.test(atom)) {
    const value = Number(atom);
    return value >= spec.min && value <= spec.max;
  }
  return false;
}

export function validCronExpressionStrict(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => field.length <= 80 && field.split(',').every((atom) => validAtom(atom, SPECS[index])));
}

export async function cronManagementRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/picosvc/cron')) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const owner = identity.ownerId;

  if (url.pathname === '/api/picosvc/cron/jobs') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM cron_jobs WHERE owner=? ORDER BY created_at DESC').bind(owner).all();
      const capacity = await resourceCapacity(env, owner, 'cron', 'jobs', 'cron_jobs');
      return json({ tier: capacity.tier, limit: capacity.limit, jobs: rows.results || [] });
    }
    if (request.method === 'POST') {
      const capacity = await resourceCapacity(env, owner, 'cron', 'jobs', 'cron_jobs');
      if (!capacity.ok) return json({ error: 'Cron job limit reached', ...capacity }, 402);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const target = safePublicUrl(body?.targetUrl);
      if (!target) return json({ error: 'targetUrl must be a public HTTP(S) URL' }, 400);
      const cron = typeof body?.cron === 'string' ? body.cron.trim() : '';
      if (!validCronExpressionStrict(cron)) return json({ error: 'cron must be a valid five-field UTC expression' }, 400);
      const method = typeof body?.method === 'string' ? body.method.toUpperCase() : 'GET';
      if (!METHODS.has(method)) return json({ error: 'invalid method' }, 400);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO cron_jobs (id,owner,name,cron_expression,method,target_url,headers_json,body,enabled,last_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,NULL,?,?)')
        .bind(
          id,
          owner,
          cleanName(body?.name, 'Cron Job'),
          cron,
          method,
          target.toString(),
          JSON.stringify(safeHeaderObject(body?.headers)),
          typeof body?.body === 'string' ? body.body.slice(0, 256 * 1024) : '',
          now,
          now,
        ).run();
      return json({ id, name: cleanName(body?.name, 'Cron Job'), cron, method, targetUrl: target.toString(), tier: capacity.tier }, 201);
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET,POST' } });
  }

  const match = url.pathname.match(/^\/api\/picosvc\/cron\/jobs\/([0-9a-f-]{36})(?:\/(runs))?$/i);
  if (!match) return null;
  const job = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id=? AND owner=?').bind(match[1], owner).first<any>();
  if (!job) return json({ error: 'Cron job not found' }, 404);

  if (match[2] === 'runs') {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    const rows = await env.DB.prepare('SELECT * FROM cron_runs WHERE job_id=? AND owner=? ORDER BY ran_at DESC LIMIT 100').bind(job.id, owner).all();
    return json({ job: { id: job.id, name: job.name }, runs: rows.results || [] });
  }

  if (request.method === 'PATCH') {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const target = body?.targetUrl === undefined ? null : safePublicUrl(body.targetUrl);
    if (body?.targetUrl !== undefined && !target) return json({ error: 'targetUrl must be a public HTTP(S) URL' }, 400);
    const cron = body?.cron === undefined ? job.cron_expression : String(body.cron).trim();
    if (!validCronExpressionStrict(cron)) return json({ error: 'invalid cron expression' }, 400);
    const method = body?.method === undefined ? job.method : String(body.method).toUpperCase();
    if (!METHODS.has(method)) return json({ error: 'invalid method' }, 400);
    const enabled = body?.enabled === undefined ? job.enabled : body.enabled ? 1 : 0;
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE cron_jobs SET name=?,cron_expression=?,method=?,target_url=?,headers_json=?,body=?,enabled=?,updated_at=? WHERE id=? AND owner=?')
      .bind(
        body?.name === undefined ? job.name : cleanName(body.name, job.name),
        cron,
        method,
        target?.toString() || job.target_url,
        body?.headers === undefined ? job.headers_json : JSON.stringify(safeHeaderObject(body.headers)),
        body?.body === undefined ? job.body : String(body.body).slice(0, 256 * 1024),
        enabled,
        now,
        job.id,
        owner,
      ).run();
    return json({ id: job.id, cron, method, targetUrl: target?.toString() || job.target_url, enabled: Boolean(enabled) });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM cron_jobs WHERE id=? AND owner=?').bind(job.id, owner).run();
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'PATCH,DELETE' } });
}
