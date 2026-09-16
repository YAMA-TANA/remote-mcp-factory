import type { Env } from '../types.js';

/** Public, non-sensitive readiness endpoint. Never reveal account identifiers or secret values. */
export async function picoSvcHealthRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/picosvc/health') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: { code: 'method_not_allowed', message: 'Use GET or HEAD' } }, { status: 405, headers: { allow: 'GET,HEAD', 'cache-control': 'no-store' } });
  }

  const requestId = crypto.randomUUID();
  let databaseReady = false;
  try {
    const probe = await env.DB.prepare('SELECT 1 AS ready').first<{ ready: number }>();
    databaseReady = probe?.ready === 1;
  } catch {
    databaseReady = false;
  }
  const bindingsReady = Boolean(env.ARTIFACTS && env.LOADER && env.BROWSER && env.Sandbox);
  const ready = databaseReady && bindingsReady;
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId, 'content-type': 'application/json; charset=utf-8' };
  if (request.method === 'HEAD') return new Response(null, { status: ready ? 200 : 503, headers });
  return new Response(JSON.stringify({ status: ready ? 'ready' : 'not_ready', requestId, checkedAt: new Date().toISOString() }), { status: ready ? 200 : 503, headers });
}
