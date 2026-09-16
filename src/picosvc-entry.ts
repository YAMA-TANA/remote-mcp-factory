import legacyEntry, { Sandbox } from './entry.js';
import { rssRuntimeRoute, runScheduledServices } from './picosvc/automation-services.js';
import { configRuntimeRoute } from './picosvc/config-service.js';
import {
  picoSvcEmailGuardrails,
  picoSvcPostResponseGuardrails,
  picoSvcRuntimeGuardrails,
  picoSvcScheduledGuardrails,
} from './picosvc/cost-guardrails.js';
import { dataRuntimeRoute } from './picosvc/data-services.js';
import { functionRuntimeRoute } from './picosvc/functions-service.js';
import { hooksRuntimeRoute } from './picosvc/hooks.js';
import { handleIncomingEmail } from './picosvc/mail-service.js';
import { mcpSandboxActiveMinuteGuard } from './picosvc/mcp-sandbox-meter.js';
import { mockRuntimeRoute } from './picosvc/mock.js';
import { picoSvcRoutes } from './picosvc/routes.js';
import { qrRuntimeRoute } from './picosvc/utility-services.js';
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

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
      return Response.redirect('https://picosvc.com/', 302);
    }

    const guardrailResponse = await picoSvcRuntimeGuardrails(request, env);
    if (guardrailResponse) {
      return url.pathname.startsWith('/api/picosvc/')
        ? withCors(guardrailResponse, allowedOrigin(request, env))
        : guardrailResponse;
    }

    const sandboxMeterResponse = await mcpSandboxActiveMinuteGuard(request, env);
    if (sandboxMeterResponse) return sandboxMeterResponse;

    for (const handler of [
      hooksRuntimeRoute,
      mockRuntimeRoute,
      qrRuntimeRoute,
      configRuntimeRoute,
      dataRuntimeRoute,
      functionRuntimeRoute,
      rssRuntimeRoute,
    ]) {
      const response = await handler(request, env);
      if (response) {
        await picoSvcPostResponseGuardrails(request, env, response);
        return response;
      }
    }

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

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        await runScheduledServices(env, new Date(controller.scheduledTime));
      } finally {
        await picoSvcScheduledGuardrails(env);
      }
    })());
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        await handleIncomingEmail(message, env);
      } finally {
        await picoSvcEmailGuardrails(message, env);
      }
    })());
  },
};
