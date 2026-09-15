import { clerkIdentity } from './auth.js';
import { binaryBridgeStatus, probeMedia, transcodeMedia } from './binary-bridge.js';
import { verifyBridgeToken, type BridgeOperation } from './bridge-auth.js';
import { compiledBridgeAllows } from './bridge-policy.js';
import { githubRoutes } from './github-routes.js';
import core from './index.js';
import { deleteDeploymentSecret, listDeploymentSecretNames, putDeploymentSecrets } from './secrets.js';
import { stopRuntime } from './runtime.js';
import type { EdgeBuildRow, Env, ServerRow } from './types.js';

export { Sandbox } from '@cloudflare/sandbox';

const MAX_BRIDGE_HTTP_BODY_BYTES = 12 * 1024 * 1024;

class BridgeRequestTooLargeError extends Error {}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && url.hostname.endsWith('.pages.dev')) return origin;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return origin;
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
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function ownedServer(request: Request, env: Env, id: string): Promise<{ row: ServerRow } | { response: Response }> {
  const identity = await clerkIdentity(request, env);
  if (!identity) return { response: json({ error: 'Authentication required', signInUrl: env.CLERK_SIGN_IN_URL || null }, 401) };
  const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?').bind(id, identity.ownerId).first<ServerRow>();
  if (!row) return { response: json({ error: 'Not found' }, 404) };
  return { row };
}

function estimatedBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

async function readBridgeJson(request: Request): Promise<any> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BRIDGE_HTTP_BODY_BYTES) {
    throw new BridgeRequestTooLargeError(`Bridge request exceeds ${MAX_BRIDGE_HTTP_BODY_BYTES} bytes`);
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BRIDGE_HTTP_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BridgeRequestTooLargeError(`Bridge request exceeds ${MAX_BRIDGE_HTTP_BODY_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function runBridgeOperation(request: Request, env: Env, row: ServerRow, operation: BridgeOperation): Promise<Response> {
  const limited = await env.MCP_SERVER_RATE_LIMITER.limit({ key: `bridge:${row.id}` });
  if (!limited.success) return json({ error: 'Bridge rate limit exceeded' }, 429);

  const startedAt = Date.now();
  let inputBytes = 0;
  try {
    const body = await readBridgeJson(request);
    if (!body || typeof body.dataBase64 !== 'string') return json({ error: 'Body must include dataBase64' }, 400);
    inputBytes = estimatedBase64Bytes(body.dataBase64);

    if (operation === 'probe') {
      const result = await probeMedia(env, row, {
        dataBase64: body.dataBase64,
        filename: typeof body.filename === 'string' ? body.filename : undefined,
      });
      console.info(JSON.stringify({ event: 'binary_bridge', serverId: row.id, operation, ok: true, inputBytes, durationMs: Date.now() - startedAt }));
      return json({ serverId: row.id, capability: 'ffprobe', result });
    }

    const result = await transcodeMedia(env, row, {
      dataBase64: body.dataBase64,
      filename: typeof body.filename === 'string' ? body.filename : undefined,
      format: body.format,
    });
    console.info(JSON.stringify({ event: 'binary_bridge', serverId: row.id, operation, ok: true, inputBytes, outputBytes: result.bytes, durationMs: Date.now() - startedAt }));
    return json({ serverId: row.id, capability: 'ffmpeg', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(JSON.stringify({ event: 'binary_bridge', serverId: row.id, operation, ok: false, inputBytes, durationMs: Date.now() - startedAt, error: message.slice(0, 500) }));
    if (error instanceof BridgeRequestTooLargeError) return json({ error: message }, 413);
    return json({ error: message }, /exceeds|must be|valid base64/i.test(message) ? 400 : 422);
  }
}

async function internalBridgeRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/internal\/bridge\/([a-z0-9][a-z0-9-]{5,40})\/(probe|transcode)$/);
  if (!match) return null;
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  if (!env.BRIDGE_SIGNING_KEY) return json({ error: 'Bridge signing is not configured' }, 503);

  const row = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(match[1]).first<ServerRow>();
  if (!row || !row.enabled) return json({ error: 'Not found' }, 404);
  const edge = await env.DB.prepare('SELECT * FROM edge_builds WHERE server_id=?').bind(row.id).first<EdgeBuildRow>();
  if (!edge?.bundle_hash) return json({ error: 'No compiled deployment' }, 409);

  const operation = match[2] as BridgeOperation;
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await verifyBridgeToken(env, token, row.id, edge.bundle_hash, operation))) return json({ error: 'Unauthorized' }, 401);
  if (!compiledBridgeAllows(edge, operation)) return json({ error: 'Compiled deployment does not allow this bridge operation' }, 403);
  return await runBridgeOperation(request, env, row, operation);
}

async function bridgeRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/servers\/([a-z0-9][a-z0-9-]{5,40})\/bridge\/(probe|transcode)$/);
  if (!match) return null;
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });

  const owned = await ownedServer(request, env, match[1]);
  if ('response' in owned) return owned.response;
  return await runBridgeOperation(request, env, owned.row, match[2] as BridgeOperation);
}

async function diagnosticRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/servers\/([a-z0-9][a-z0-9-]{5,40})\/(compatibility|bridge-status)$/);
  if (!match) return null;
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
  const owned = await ownedServer(request, env, match[1]);
  if ('response' in owned) return owned.response;

  if (match[2] === 'bridge-status') {
    const capabilities = await binaryBridgeStatus(env, owned.row);
    return json({ serverId: owned.row.id, capabilities });
  }

  const edge = await env.DB.prepare('SELECT * FROM edge_builds WHERE server_id=?').bind(owned.row.id).first<EdgeBuildRow>();
  if (!edge) return json({ serverId: owned.row.id, status: 'not-analyzed' });
  let compatibility: unknown = {};
  try { compatibility = JSON.parse(edge.compatibility_json || '{}'); } catch {}
  return json({
    serverId: owned.row.id,
    status: edge.status,
    compilerVersion: edge.compiler_version,
    artifact: edge.artifact_key ? 'r2' : edge.bundle ? 'd1-legacy' : null,
    mainModule: edge.main_module,
    moduleCount: edge.module_count,
    sizeBytes: edge.size_bytes,
    toolCount: edge.tool_count,
    compatibility,
    reason: edge.reason,
  });
}

async function secretRoutes(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/servers\/([a-z0-9][a-z0-9-]{5,40})\/secrets(?:\/([A-Z][A-Z0-9_]{0,63}))?$/);
  if (!match) return null;

  const owned = await ownedServer(request, env, match[1]);
  if ('response' in owned) return owned.response;
  const { row } = owned;
  const name = match[2] ? decodeURIComponent(match[2]) : null;

  try {
    if (request.method === 'GET' && !name) {
      const names = await listDeploymentSecretNames(env, row.id);
      return json({ serverId: row.id, names });
    }

    if (request.method === 'PUT' && !name) {
      const body = await request.json().catch(() => null) as { secrets?: Record<string, string> } | null;
      if (!body?.secrets || typeof body.secrets !== 'object' || Array.isArray(body.secrets)) {
        return json({ error: 'Body must be { secrets: { NAME: "value" } }' }, 400);
      }
      const updated = await putDeploymentSecrets(env, row.id, body.secrets);
      ctx.waitUntil(stopRuntime(env, row).catch(() => undefined));
      const names = await listDeploymentSecretNames(env, row.id);
      return json({ serverId: row.id, updated, names });
    }

    if (request.method === 'DELETE' && name) {
      await deleteDeploymentSecret(env, row.id, name);
      ctx.waitUntil(stopRuntime(env, row).catch(() => undefined));
      const names = await listDeploymentSecretNames(env, row.id);
      return json({ serverId: row.id, deleted: name, names });
    }

    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, PUT, DELETE' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const configuration = message.startsWith('DEPLOYMENT_SECRETS_KEY');
    return json({ error: configuration ? 'Deployment secret encryption is not configured' : message }, configuration ? 503 : 400);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const internalBridge = await internalBridgeRoutes(request, env);
    if (internalBridge) return internalBridge;

    const origin = url.pathname.startsWith('/api/') ? allowedOrigin(request, env) : null;
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      if (!origin) return new Response(null, { status: 403 });
      return withCors(new Response(null, { status: 204 }), origin);
    }

    const githubResponse = await githubRoutes(request, env, ctx);
    if (githubResponse) return withCors(githubResponse, origin);
    const bridgeResponse = await bridgeRoutes(request, env);
    if (bridgeResponse) return withCors(bridgeResponse, origin);
    const diagnosticResponse = await diagnosticRoutes(request, env);
    if (diagnosticResponse) return withCors(diagnosticResponse, origin);
    const secretResponse = await secretRoutes(request, env, ctx);
    if (secretResponse) return withCors(secretResponse, origin);
    return withCors(await core.fetch(request, env, ctx), origin);
  },
};