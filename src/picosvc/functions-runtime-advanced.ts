import type { Env } from '../types.js';
import { loadFunctionSecrets, recordFunctionInvocation } from './functions-advanced.js';
import { consumeUsage, json } from './service-utils.js';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_FUNCTION_CPU_MS = 10;
const MAX_FUNCTION_WALL_MS = 5_000;
const MAX_SUBREQUESTS = 32;

type FunctionRow = { id: string; owner: string; name: string; code: string; updated_at: string; current_revision: number };

async function boundedBody(body: ReadableStream<Uint8Array> | null, maximum: number): Promise<ArrayBuffer | null> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel('PicoSvc body limit exceeded').catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } finally { reader.releaseLock(); }
}

export async function functionsAdvancedRuntimeRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/fn\/([a-f0-9]{32})(?:\/(.*))?$/i);
  if (!match) return null;
  const app = await env.DB.prepare('SELECT id,owner,name,code,updated_at,current_revision FROM function_apps WHERE public_id=? AND enabled=1')
    .bind(match[1].toLowerCase()).first<FunctionRow>();
  if (!app) return json({ error: 'Function not found' }, 404);
  if (!env.LOADER) return json({ error: 'Dynamic Worker loader is not configured' }, 503);
  const declared = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(declared) || declared > MAX_REQUEST_BYTES) return json({ error: 'Function request exceeds 1 MiB' }, 413);
  const usage = await consumeUsage(env, app.owner, 'functions', 'invocations');
  if (!usage.ok) return json({ error: 'Function invocation quota reached', ...usage }, 429);
  const started = Date.now();
  let code = 502;
  let error: string | null = null;
  let result: Response;
  try {
    const secrets = await loadFunctionSecrets(env, app.id, app.owner);
    const workerId = `picosvc:function:${app.id}:${app.updated_at}`;
    const stub = env.LOADER.get(workerId, async () => ({
      compatibilityDate: '2026-09-15',
      compatibilityFlags: ['nodejs_compat'],
      mainModule: 'index.js',
      modules: { 'index.js': { js: app.code } },
      env: { ...secrets, PICOSVC_FUNCTION_ID: app.id, PICOSVC_FUNCTION_NAME: app.name },
      limits: { cpuMs: MAX_FUNCTION_CPU_MS, subRequests: MAX_SUBREQUESTS },
    }));
    const target = new URL(request.url);
    target.pathname = `/${match[2] || ''}`;
    const headers = new Headers(request.headers);
    for (const name of ['host','cf-connecting-ip','cf-ray','content-length','connection','transfer-encoding']) headers.delete(name);
    const input = request.method === 'GET' || request.method === 'HEAD' ? null : await boundedBody(request.body, MAX_REQUEST_BYTES);
    if (input === null) {
      code = 413; error = 'Function request exceeds 1 MiB';
      result = json({ error }, code);
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MAX_FUNCTION_WALL_MS);
      try {
        const init: RequestInit = { method: request.method, headers, redirect: 'manual', signal: controller.signal };
        if (input) init.body = input;
        const upstream = await stub.getEntrypoint().fetch(new Request(target.toString(), init));
        const output = await boundedBody(upstream.body, MAX_RESPONSE_BYTES);
        if (output === null) {
          code = 502; error = 'Function output exceeds 1 MiB';
          result = json({ error }, code);
        } else {
          code = upstream.status;
          const outHeaders = new Headers(upstream.headers);
          outHeaders.delete('content-length');
          outHeaders.set('x-picosvc-function-revision', String(app.current_revision));
          result = new Response(upstream.body ? output : null, { status: upstream.status, statusText: upstream.statusText, headers: outHeaders });
        }
      } finally { clearTimeout(timer); }
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message.slice(0, 250) : String(cause).slice(0, 250);
    code = /timeout|abort/i.test(error) ? 504 : 502;
    result = json({ error: code === 504 ? 'Function execution timed out' : 'Function execution failed', limitMs: MAX_FUNCTION_WALL_MS }, code);
  }
  await recordFunctionInvocation(env, app.id, app.owner, app.current_revision, request.method, code, Date.now() - started, error).catch(() => undefined);
  return result;
}
