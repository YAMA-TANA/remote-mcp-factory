import legacyEntry, { Sandbox } from './entry.js';
import { rssRuntimeRoute, runScheduledServices } from './picosvc/automation-services.js';
import { configRuntimeRoute } from './picosvc/config-service.js';
import { runAdvancedCronJobs } from './picosvc/cron-advanced.js';
import {
  picoSvcEmailGuardrails,
  picoSvcPostResponseGuardrails,
  picoSvcRuntimeGuardrails,
  picoSvcScheduledGuardrails,
} from './picosvc/cost-guardrails.js';
import { dataRuntimeRoute } from './picosvc/data-services.js';
import { filesAccessRuntimeRoute } from './picosvc/files-access.js';
import { formsAdvancedRuntimeRoute } from './picosvc/forms-advanced.js';
import { functionsAdvancedRuntimeRoute } from './picosvc/functions-runtime-advanced.js';
import { functionRuntimeRoute } from './picosvc/functions-service.js';
import { hooksAdvancedRuntimeRoute } from './picosvc/hooks-advanced.js';
import { hooksRuntimeRoute } from './picosvc/hooks.js';
import { jsonAdvancedRuntimeRoute } from './picosvc/json-advanced.js';
import { jsonWriteQuotaGuard } from './picosvc/json-write-quota-guard.js';
import { jsonExportQuotaGuard } from './picosvc/json-export-quota-guard.js';
import { licenseAdvancedRuntimeRoute } from './picosvc/license-advanced.js';
import { handleIncomingMailAdvanced, pruneIncomingMailR2, pruneMailR2Owners, runMailRetries } from './picosvc/mail-advanced.js';
import type { InternalPicoSvcDispatch } from './picosvc/internal-dispatch.js';
import { mcpObservedRuntimeRoute } from './picosvc/mcp-observability.js';
import { picoSvcManagementMcpRoute } from './picosvc/management-mcp.js';
import { mcpSandboxActiveMinuteGuard } from './picosvc/mcp-sandbox-meter.js';
import { mockAdvancedRuntimeRoute } from './picosvc/mock-advanced.js';
import { mockRuntimeRoute } from './picosvc/mock.js';
import { runAdvancedMonitorChecks } from './picosvc/monitor-advanced.js';
import { picoSvcRoutes } from './picosvc/routes.js';
import { withInternalIdentity } from './picosvc/service-utils.js';
import { utilityAdvancedRuntimeRoute } from './picosvc/utility-advanced.js';
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
  } catch { return null; }
  const configured = (env.WEB_ORIGINS || '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
  return configured.includes(origin.replace(/\/$/, '')) ? origin : null;
}
function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type,if-match,if-none-match');
  // The Screenshot workspace reads image dimensions and tier from response headers.
  headers.set('access-control-expose-headers', 'etag,x-request-id,x-picosvc-image-size,x-picosvc-tier,x-picosvc-browser-ms-used,retry-after,content-disposition');
  headers.set('access-control-max-age', '86400');
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function runPicoSvcRuntimeRoutes(request: Request, env: Env, dispatchInternal?: InternalPicoSvcDispatch): Promise<Response | null> {
  for (const handler of [
    (incoming: Request, environment: Env) => hooksAdvancedRuntimeRoute(incoming, environment, dispatchInternal),
    hooksRuntimeRoute,
    mockAdvancedRuntimeRoute,
    mockRuntimeRoute,
    utilityAdvancedRuntimeRoute,
    qrRuntimeRoute,
    configRuntimeRoute,
    jsonAdvancedRuntimeRoute,
    licenseAdvancedRuntimeRoute,
    formsAdvancedRuntimeRoute,
    dataRuntimeRoute,
    functionsAdvancedRuntimeRoute,
    functionRuntimeRoute,
    rssRuntimeRoute,
  ]) {
    const response = await handler(request, env);
    if (response) {
      await picoSvcPostResponseGuardrails(request, env, response);
      return response;
    }
  }
  return null;
}

export async function dispatchPicoSvcInternal(request: Request, env: Env, depth = 0): Promise<Response | null> {
  if (depth >= 8) return Response.json({ error: 'PicoSvc internal dispatch depth exceeded' }, { status: 508 });
  const dispatchInternal: InternalPicoSvcDispatch = (nested) => dispatchPicoSvcInternal(nested, env, depth + 1);
  const url = new URL(request.url);
  const filesResponse = await filesAccessRuntimeRoute(request, env);
  if (filesResponse) return filesResponse;
  const jsonWrite = request.method === 'PUT'
    && (url.pathname.startsWith('/json/') || /^\/api\/picosvc\/json\/stores\/[^/]+\/documents\//.test(url.pathname));
  const guardrailResponse = await (jsonWrite ? jsonWriteQuotaGuard(request, env) : picoSvcRuntimeGuardrails(request, env))
    || await jsonExportQuotaGuard(request, env);
  if (guardrailResponse) return guardrailResponse;
  const sandboxMeterResponse = await mcpSandboxActiveMinuteGuard(request, env);
  if (sandboxMeterResponse) return sandboxMeterResponse;
  try {
    return await runPicoSvcRuntimeRoutes(request, env, dispatchInternal);
  } catch (error) {
    if ((url.pathname.startsWith('/json/') || url.pathname.startsWith('/api/picosvc/json/'))
      && error instanceof Error && error.message.includes('json_quota_exceeded')) {
      return Response.json({ error: 'JSON document or storage limit reached' }, { status: 402, headers: { 'cache-control': 'no-store' } });
    }
    throw error;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
      return Response.redirect('https://picosvc.com/', 302);
    }
    const picoApi = url.pathname.startsWith('/api/picosvc/');
    const origin = picoApi ? allowedOrigin(request, env) : null;
    const requestId = picoApi ? crypto.randomUUID() : '';
    const send = (response: Response): Response => picoApi ? withCors(withRequestId(response, requestId), origin) : response;
    try {
      // Preflight must be resolved before service handlers or authentication guards.
      if (picoApi && request.method === 'OPTIONS') {
        return send(new Response(null, { status: origin ? 204 : 403 }));
      }
      const filesResponse = await filesAccessRuntimeRoute(request, env);
      if (filesResponse) return send(filesResponse);
      // The old JSON guard scans every owner document. Route all public/managed
      // JSON PUTs through the indexed counter guard, including scoped tokens.
      const jsonWrite = request.method === 'PUT'
        && (url.pathname.startsWith('/json/') || /^\/api\/picosvc\/json\/stores\/[^/]+\/documents\//.test(url.pathname));
      const guardrailResponse = await (jsonWrite ? jsonWriteQuotaGuard(request, env) : picoSvcRuntimeGuardrails(request, env))
        || await jsonExportQuotaGuard(request, env);
      if (guardrailResponse) return send(guardrailResponse);
      const sandboxMeterResponse = await mcpSandboxActiveMinuteGuard(request, env);
      if (sandboxMeterResponse) return send(sandboxMeterResponse);
      const dispatchInternal: InternalPicoSvcDispatch = (internal) => dispatchPicoSvcInternal(internal, env);
      const runtimeResponse = await runPicoSvcRuntimeRoutes(request, env, dispatchInternal);
      if (runtimeResponse) return send(runtimeResponse);
      const managementMcp = await picoSvcManagementMcpRoute(request, env, ctx, async (internalRequest, identity) => {
        const internal = withInternalIdentity(internalRequest, identity);
        const internalUrl = new URL(internal.url);
        const jsonWrite = internal.method === 'PUT'
          && (internalUrl.pathname.startsWith('/json/') || /^\/api\/picosvc\/json\/stores\/[^/]+\/documents\//.test(internalUrl.pathname));
        const guardrailResponse = await (jsonWrite ? jsonWriteQuotaGuard(internal, env) : picoSvcRuntimeGuardrails(internal, env))
          || await jsonExportQuotaGuard(internal, env);
        if (guardrailResponse) return guardrailResponse;
        const sandboxMeterResponse = await mcpSandboxActiveMinuteGuard(internal, env);
        if (sandboxMeterResponse) return sandboxMeterResponse;
        const runtime = await runPicoSvcRuntimeRoutes(internal, env, dispatchInternal);
        if (runtime) return runtime;
        const management = await picoSvcRoutes(internal, env, dispatchInternal);
        return management || Response.json({ error: { code: 'not_found', message: 'PicoSvc route not found' } }, { status: 404 });
      });
      if (managementMcp) return send(managementMcp);
      if (picoApi) {
        const response = await picoSvcRoutes(request, env, dispatchInternal);
        if (response) return send(response);
        return send(Response.json({ error: { code: 'not_found', message: 'PicoSvc route not found' }, requestId }, { status: 404 }));
      }
      const observedMcp = await mcpObservedRuntimeRoute(request, env, () => legacyEntry.fetch(request, env, ctx));
      if (observedMcp) return observedMcp;
      return legacyEntry.fetch(request, env, ctx);
    } catch (error) {
      // SQLite BEFORE triggers close concurrent PUT races that the optimistic
      // application precheck cannot. Return a quota response rather than 500.
      if ((url.pathname.startsWith('/json/') || url.pathname.startsWith('/api/picosvc/json/'))
        && error instanceof Error && error.message.includes('json_quota_exceeded')) {
        return send(Response.json({ error: 'JSON document or storage limit reached' }, { status: 402, headers: { 'cache-control': 'no-store' } }));
      }
      if (!picoApi) throw error;
      // Do not expose exception details, credentials or provider internals in public responses.
      console.error('PicoSvc API request failed', requestId, url.pathname);
      return send(Response.json({ error: { code: 'internal_error', message: 'The request could not be completed. Contact support with the request ID.' }, requestId }, { status: 500, headers: { 'cache-control': 'no-store' } }));
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        await runScheduledServices(env, new Date(controller.scheduledTime));
        await runAdvancedMonitorChecks(env, new Date(controller.scheduledTime));
        const dispatchInternal: InternalPicoSvcDispatch = (request) => dispatchPicoSvcInternal(request, env);
        await runAdvancedCronJobs(env, new Date(controller.scheduledTime), dispatchInternal);
        await runMailRetries(env, dispatchInternal);
      } finally {
        await pruneMailR2Owners(env);
        await picoSvcScheduledGuardrails(env);
      }
    })());
  },
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try { await handleIncomingMailAdvanced(message, env, (request) => dispatchPicoSvcInternal(request, env)); }
      finally {
        await pruneIncomingMailR2(message, env);
        await picoSvcEmailGuardrails(message, env);
      }
    })());
  },
};
