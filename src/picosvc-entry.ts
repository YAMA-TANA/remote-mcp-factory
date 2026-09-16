import legacyEntry, { Sandbox } from './entry.js';
import { hooksRuntimeRoute } from './picosvc/hooks.js';
import { mockRuntimeRoute } from './picosvc/mock.js';
import { picoSvcRoutes } from './picosvc/routes.js';
import type { Env } from './types.js';

export { Sandbox };

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return origin;
    if (url.protocol === 'https:' && url.hostname.endsWith('.pages.dev')) return origin;
  } catch {
    return null;
  }

  const configured = (env.WEB_ORIGINS || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return configured.includes(origin.replace(/\/$/, '')) ? origin : null;
}

function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type');
  headers.set('access-control-max-age', '86400');
  headers.append('vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const hooksResponse = await hooksRuntimeRoute(request, env);
    if (hooksResponse) return hooksResponse;

    const mockResponse = await mockRuntimeRoute(request, env);
    if (mockResponse) return mockResponse;

    if (url.pathname.startsWith('/api/picosvc/')) {
      const origin = allowedOrigin(request, env);
      if (request.method === 'OPTIONS') {
        if (!origin) return new Response(null, { status: 403 });
        return withCors(new Response(null, { status: 204 }), origin);
      }

      const response = await picoSvcRoutes(request, env);
      if (response) return withCors(response, origin);
      return withCors(Response.json({ error: 'PicoSvc route not found' }, { status: 404 }), origin);
    }

    return legacyEntry.fetch(request, env, ctx);
  },
};
