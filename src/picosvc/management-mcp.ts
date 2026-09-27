import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { deploymentCount, incrementUsage, readUsage, resolvePlanForOwner } from '../plans.js';
import { buildServer, stopRuntime } from '../runtime.js';
import {
  deleteDeploymentSecret,
  listDeploymentSecretNames,
  putDeploymentSecrets,
} from '../secrets.js';
import type { AuthIdentity, Env, ServerRow, Visibility } from '../types.js';
import {
  PICOSVC_BILLING_MODEL,
  PICOSVC_BUNDLES,
  PICOSVC_PRODUCTS,
} from './catalog.js';
import { randomSecret, sha256Hex } from './security.js';
import { json, requireIdentity } from './service-utils.js';

const KEY_PATTERN = /^psm_[A-Za-z0-9_-]{32}$/;
const VALID_SCOPES = new Set(['read', 'mcp:manage', 'services:manage', 'secrets:write'] as const);
type ManagementScope = 'read' | 'mcp:manage' | 'services:manage' | 'secrets:write';

interface ManagementPrincipal {
  keyId: string;
  ownerId: string;
  ownerOrg: string | null;
  scopes: Set<ManagementScope>;
}

interface ManagementKeyRow {
  id: string;
  owner: string;
  owner_org: string | null;
  scopes_json: string;
}

const SERVICE_SLUGS = [
  'mock', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron',
  'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
] as const;
type ManagedService = typeof SERVICE_SLUGS[number];

const SERVICE_ENDPOINTS: Record<ManagedService, { prefix: string; entrypoints: string[] }> = {
  mock: { prefix: '/api/picosvc/mock', entrypoints: ['/api/picosvc/mock/endpoints', '/api/picosvc/mock/import/openapi'] },
  hooks: { prefix: '/api/picosvc/hooks', entrypoints: ['/api/picosvc/hooks/inboxes'] },
  rss: { prefix: '/api/picosvc/rss', entrypoints: ['/api/picosvc/rss/feeds'] },
  mail: { prefix: '/api/picosvc/mail', entrypoints: ['/api/picosvc/mail/routes'] },
  shot: { prefix: '/api/picosvc/shot', entrypoints: ['/api/picosvc/shot', '/api/picosvc/shot/keys'] },
  fetch: { prefix: '/api/picosvc/fetch', entrypoints: ['/api/picosvc/fetch'] },
  qr: { prefix: '/api/picosvc/qr', entrypoints: ['/api/picosvc/qr/links'] },
  cron: { prefix: '/api/picosvc/cron', entrypoints: ['/api/picosvc/cron/jobs'] },
  functions: { prefix: '/api/picosvc/functions', entrypoints: ['/api/picosvc/functions/apps'] },
  json: { prefix: '/api/picosvc/json', entrypoints: ['/api/picosvc/json/stores'] },
  files: { prefix: '/api/picosvc/files', entrypoints: ['/api/picosvc/files/spaces'] },
  license: { prefix: '/api/picosvc/license', entrypoints: ['/api/picosvc/license/projects'] },
  flags: { prefix: '/api/picosvc/flags', entrypoints: ['/api/picosvc/flags/projects'] },
  monitor: { prefix: '/api/picosvc/monitor', entrypoints: ['/api/picosvc/monitor'] },
  forms: { prefix: '/api/picosvc/forms', entrypoints: ['/api/picosvc/forms'] },
};

export type PicoSvcManagementDispatch = (request: Request, identity: AuthIdentity) => Promise<Response>;
const MAX_SERVICE_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function endpointFor(env: Env, requestUrl: string, id: string): string {
  const fallback = new URL(requestUrl).origin;
  if (!env.PUBLIC_MCP_ORIGIN) return `${fallback}/mcp/${id}`;
  try {
    const url = new URL(env.PUBLIC_MCP_ORIGIN);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return `${fallback}/mcp/${id}`;
    return `${url.origin}/mcp/${id}`;
  } catch {
    return `${fallback}/mcp/${id}`;
  }
}

function publicGithubRepoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return false;
    const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    return parts.length === 2 && parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part));
  } catch {
    return false;
  }
}

function normalizeScopes(value: unknown): ManagementScope[] {
  const input = value === undefined ? ['read', 'mcp:manage', 'services:manage'] : value;
  if (!Array.isArray(input) || input.length === 0) throw new Error('scopes must be a non-empty array');
  const scopes = [...new Set(input.map((scope) => String(scope)))] as string[];
  for (const scope of scopes) {
    if (!VALID_SCOPES.has(scope as ManagementScope)) throw new Error(`Unsupported scope: ${scope}`);
  }
  if (!scopes.includes('read')) scopes.unshift('read');
  return scopes as ManagementScope[];
}

function scopesFromJson(value: string): Set<ManagementScope> {
  try {
    return new Set(normalizeScopes(JSON.parse(value)));
  } catch {
    return new Set<ManagementScope>(['read']);
  }
}

function requireScope(principal: ManagementPrincipal, scope: ManagementScope): void {
  if (!principal.scopes.has(scope)) throw new Error(`This PicoSvc management key does not have the ${scope} scope`);
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

async function resolveManagementPrincipal(request: Request, env: Env): Promise<ManagementPrincipal | Response> {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (!KEY_PATTERN.test(bearer)) {
    return fail('invalid_management_key', 'Send Authorization: Bearer psm_…', 401);
  }
  try {
    const hash = await sha256Hex(bearer);
    const row = await env.DB.prepare(
      'SELECT id,owner,owner_org,scopes_json FROM picosvc_mcp_keys WHERE token_hash=? AND revoked_at IS NULL',
    ).bind(hash).first<ManagementKeyRow>();
    if (!row) return fail('invalid_management_key', 'PicoSvc management key was not found or has been revoked', 401);
    await env.DB.prepare('UPDATE picosvc_mcp_keys SET last_used_at=? WHERE id=? AND revoked_at IS NULL')
      .bind(new Date().toISOString(), row.id).run();
    return {
      keyId: row.id,
      ownerId: row.owner,
      ownerOrg: row.owner_org,
      scopes: scopesFromJson(row.scopes_json),
    };
  } catch {
    return fail('management_keys_unavailable', 'PicoSvc management MCP keys are not ready. Apply migration 0031.', 503);
  }
}

export async function picoSvcManagementMcpKeyRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const collection = url.pathname === '/api/picosvc/mcp/keys';
  const keyMatch = url.pathname.match(/^\/api\/picosvc\/mcp\/keys\/([0-9a-f-]{36})$/i);
  if (!collection && !keyMatch) return null;

  // Management MCP keys may never mint, list or revoke other management keys.
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;

  try {
    if (collection && request.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT id,name,scopes_json,created_at,last_used_at FROM picosvc_mcp_keys WHERE owner=? AND revoked_at IS NULL ORDER BY created_at DESC',
      ).bind(identity.ownerId).all<{ id: string; name: string; scopes_json: string; created_at: string; last_used_at: string | null }>();
      return json({
        keys: (rows.results || []).map((row) => ({
          id: row.id,
          name: row.name,
          scopes: [...scopesFromJson(row.scopes_json)],
          created_at: row.created_at,
          last_used_at: row.last_used_at,
        })),
      });
    }

    if (collection && request.method === 'POST') {
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM picosvc_mcp_keys WHERE owner=? AND revoked_at IS NULL',
      ).bind(identity.ownerId).first<{ count: number }>();
      if (Number(count?.count || 0) >= 10) {
        return fail('key_limit', 'Maximum 10 active PicoSvc management MCP keys. Revoke an unused key first.', 409);
      }
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
      if (!name) return fail('invalid_name', 'A name is required', 400);
      let scopes: ManagementScope[];
      try {
        scopes = normalizeScopes(body?.scopes);
      } catch (error) {
        return fail('invalid_scopes', error instanceof Error ? error.message : String(error), 400);
      }
      const token = randomSecret('psm');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO picosvc_mcp_keys (id,owner,owner_org,name,token_hash,scopes_json,created_at) VALUES (?,?,?,?,?,?,?)',
      ).bind(id, identity.ownerId, identity.orgId, name, await sha256Hex(token), JSON.stringify(scopes), now).run();
      return json({
        id,
        name,
        scopes,
        token,
        created_at: now,
        endpoint: endpointFor(env, request.url, 'picosvc'),
        note: 'This token is displayed only once. Store it securely.',
      }, 201);
    }

    if (keyMatch && request.method === 'DELETE') {
      const row = await env.DB.prepare(
        'SELECT id FROM picosvc_mcp_keys WHERE id=? AND owner=? AND revoked_at IS NULL',
      ).bind(keyMatch[1], identity.ownerId).first();
      if (!row) return fail('not_found', 'PicoSvc management MCP key not found', 404);
      await env.DB.prepare('UPDATE picosvc_mcp_keys SET revoked_at=? WHERE id=? AND owner=?')
        .bind(new Date().toISOString(), keyMatch[1], identity.ownerId).run();
      return new Response(null, { status: 204 });
    }

    return new Response('Method Not Allowed', {
      status: 405,
      headers: { allow: collection ? 'GET,POST' : 'DELETE' },
    });
  } catch {
    return fail('management_keys_unavailable', 'PicoSvc management MCP keys are not ready. Apply migration 0031.', 503);
  }
}

async function listDeployments(env: Env, owner: string, requestUrl: string): Promise<unknown[]> {
  const rows = await env.DB.prepare(`
    SELECT s.id,s.name,s.repo_url,s.branch,s.subdir,s.status,s.visibility,s.enabled,
           s.detected_runtime,s.detected_command,s.error,s.created_at,s.updated_at,
           e.status AS edge_status,e.size_bytes AS edge_size_bytes,e.tool_count AS edge_tool_count,
           e.reason AS edge_reason,e.compiler_version AS edge_compiler_version
    FROM servers s
    LEFT JOIN edge_builds e ON e.server_id=s.id
    WHERE s.owner=?
    ORDER BY s.created_at DESC
  `).bind(owner).all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({
    ...row,
    enabled: Boolean(row.enabled),
    endpoint: endpointFor(env, requestUrl, String(row.id)),
  }));
}

async function getDeployment(env: Env, owner: string, id: string, requestUrl: string): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(`
    SELECT s.id,s.name,s.repo_url,s.branch,s.subdir,s.status,s.visibility,s.enabled,
           s.detected_runtime,s.detected_command,s.error,s.created_at,s.updated_at,
           e.status AS edge_status,e.size_bytes AS edge_size_bytes,e.tool_count AS edge_tool_count,
           e.reason AS edge_reason,e.compiler_version AS edge_compiler_version,e.tools_json AS edge_tools_json
    FROM servers s
    LEFT JOIN edge_builds e ON e.server_id=s.id
    WHERE s.id=? AND s.owner=?
  `).bind(id, owner).first<Record<string, unknown>>();
  if (!row) throw new Error('MCP deployment not found');
  let tools: unknown = [];
  try { tools = JSON.parse(String(row.edge_tools_json || '[]')); } catch { /* malformed legacy row */ }
  delete row.edge_tools_json;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    endpoint: endpointFor(env, requestUrl, id),
    secretNames: await listDeploymentSecretNames(env, id),
    tools,
  };
}


function serviceRequestUrl(service: ManagedService, path: string, requestUrl: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('://')) {
    throw new Error('path must be an absolute-path reference such as /api/picosvc/mock/endpoints');
  }
  const base = new URL(requestUrl);
  const target = new URL(path, base);
  if (target.origin !== base.origin) throw new Error('Cross-origin service requests are not allowed');
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(target.pathname); } catch { throw new Error('path contains invalid percent-encoding'); }
  if (decodedPath.includes('..')) throw new Error('Path traversal is not allowed');
  const prefix = SERVICE_ENDPOINTS[service].prefix;
  if (decodedPath !== prefix && !decodedPath.startsWith(prefix + '/')) {
    throw new Error(`Path is outside the ${service} management API namespace (${prefix})`);
  }
  return target;
}

function base64Bytes(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

async function serviceResponseResult(response: Response) {
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const headers: Record<string, string> = {};
  for (const name of ['content-type', 'content-disposition', 'etag', 'location', 'retry-after', 'x-request-id', 'x-picosvc-tier']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  if (bytes.byteLength > MAX_SERVICE_RESPONSE_BYTES) {
    return toolResult({
      ok: response.ok,
      status: response.status,
      headers,
      error: `Response body exceeds the management MCP ${MAX_SERVICE_RESPONSE_BYTES}-byte limit`,
      bytes: bytes.byteLength,
    });
  }
  if (!bytes.byteLength) return toolResult({ ok: response.ok, status: response.status, headers, body: null });

  const text = new TextDecoder().decode(bytes);
  if (/application\/(?:[^;]+\+)?json/i.test(contentType)) {
    try { return toolResult({ ok: response.ok, status: response.status, headers, body: JSON.parse(text) }); }
    catch { return toolResult({ ok: response.ok, status: response.status, headers, body: text }); }
  }
  if (/^(?:text\/|application\/(?:xml|javascript|x-www-form-urlencoded))/i.test(contentType)) {
    return toolResult({ ok: response.ok, status: response.status, headers, body: text });
  }
  return toolResult({
    ok: response.ok,
    status: response.status,
    headers,
    bodyBase64: base64Bytes(bytes),
    bytes: bytes.byteLength,
    note: 'Binary response encoded as base64.',
  });
}

function createManagementServer(
  env: Env,
  principal: ManagementPrincipal,
  ctx: ExecutionContext,
  requestUrl: string,
  dispatchManagement?: PicoSvcManagementDispatch,
): McpServer {
  const server = new McpServer(
    { name: 'picosvc-management', version: '0.1.0' },
    {
      instructions:
        'Manage only the authenticated owner\'s PicoSvc resources. Secret values can be written only with secrets:write and are never returned. Deployment bearer tokens are returned only when created or rotated.',
    },
  );

  server.registerTool(
    'list_products',
    {
      description: 'List PicoSvc products, public pricing tiers, quotas and bundle definitions.',
      inputSchema: z.object({}),
    },
    async () => toolResult({
      billing: PICOSVC_BILLING_MODEL,
      products: PICOSVC_PRODUCTS,
      bundles: PICOSVC_BUNDLES,
    }),
  );

  server.registerTool(
    'get_account',
    {
      description: 'Get this key owner\'s PicoSvc MCP plan, MCP usage and PicoSvc entitlements.',
      inputSchema: z.object({}),
    },
    async () => {
      const plan = await resolvePlanForOwner(env, principal.ownerId, principal.ownerOrg);
      const usage = await readUsage(env, principal.ownerId);
      const deployments = await deploymentCount(env, principal.ownerId);
      const entitlements = await env.DB.prepare(
        'SELECT product,tier,source,active,updated_at FROM product_entitlements WHERE owner=? ORDER BY product',
      ).bind(principal.ownerId).all();
      const bundles = await env.DB.prepare(
        'SELECT bundle,product,tier,source,active,updated_at FROM bundle_entitlements WHERE owner=? ORDER BY bundle,product',
      ).bind(principal.ownerId).all().catch(() => ({ results: [] as unknown[] }));
      const productUsage = await env.DB.prepare(
        'SELECT product,metric,quantity,updated_at FROM product_usage_monthly WHERE owner=? AND month=? ORDER BY product,metric',
      ).bind(principal.ownerId, usage.month).all().catch(() => ({ results: [] as unknown[] }));
      return toolResult({
        ownerId: principal.ownerId,
        month: usage.month,
        mcp: { plan, usage: { ...usage, deployments } },
        entitlements: entitlements.results || [],
        bundleEntitlements: bundles.results || [],
        productUsage: productUsage.results || [],
      });
    },
  );

  server.registerTool(
    'list_service_operations',
    {
      description: 'List management API namespaces for all PicoSvc services. MCP hosting uses dedicated first-class tools; the other 15 services use picosvc_service_request.',
      inputSchema: z.object({}),
    },
    async () => toolResult({
      mcp: {
        mode: 'first-class-tools',
        tools: [
          'list_mcp_deployments', 'get_mcp_deployment', 'create_mcp_deployment',
          'update_mcp_deployment', 'rebuild_mcp_deployment', 'rotate_mcp_bearer_token',
          'list_mcp_secret_names', 'put_mcp_secrets', 'delete_mcp_secret',
        ],
      },
      services: Object.fromEntries(SERVICE_SLUGS.map((slug) => [slug, {
        namespace: SERVICE_ENDPOINTS[slug].prefix,
        entrypoints: SERVICE_ENDPOINTS[slug].entrypoints,
        readMethod: 'GET (read scope)',
        writeMethods: 'POST/PATCH/PUT/DELETE (services:manage scope)',
      }])),
    }),
  );

  server.registerTool(
    'picosvc_service_request',
    {
      description: 'Call an authenticated PicoSvc management API for Mock, Hooks, RSS, Mail, Shot, Fetch, QR, Cron, Functions, JSON, Files, License, Flags, Monitor or Forms. The path is constrained to the selected service namespace. Binary responses are returned as base64.',
      inputSchema: z.object({
        service: z.enum(SERVICE_SLUGS),
        method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).default('GET'),
        path: z.string().min(1).max(1000),
        body: z.unknown().optional(),
      }),
    },
    async ({ service, method, path, body }) => {
      if (!dispatchManagement) throw new Error('PicoSvc service dispatch is unavailable');
      if (method === 'GET') requireScope(principal, 'read');
      else requireScope(principal, 'services:manage');

      const target = serviceRequestUrl(service, path, requestUrl);
      const headers = new Headers({ accept: 'application/json, text/plain, */*' });
      const init: RequestInit = { method, headers, redirect: 'manual' };
      if (body !== undefined && method !== 'GET') {
        headers.set('content-type', 'application/json');
        init.body = JSON.stringify(body);
      }
      const internal = new Request(target.toString(), init);
      const response = await dispatchManagement(internal, {
        userId: principal.ownerId,
        orgId: principal.ownerOrg,
        ownerId: principal.ownerId,
      });
      return serviceResponseResult(response);
    },
  );

  server.registerTool(
    'list_mcp_deployments',
    {
      description: 'List MCP deployments owned by this PicoSvc account. Secret values and token hashes are never returned.',
      inputSchema: z.object({}),
    },
    async () => toolResult({ deployments: await listDeployments(env, principal.ownerId, requestUrl) }),
  );

  server.registerTool(
    'get_mcp_deployment',
    {
      description: 'Get one MCP deployment, detected runtime, tools and secret names. Secret values are never returned.',
      inputSchema: z.object({ id: z.string().min(1).max(64) }),
    },
    async ({ id }) => toolResult(await getDeployment(env, principal.ownerId, id, requestUrl)),
  );

  server.registerTool(
    'create_mcp_deployment',
    {
      description: 'Deploy a public GitHub MCP repository. A protected deployment returns its bearer token once. Use the dashboard/GitHub App flow for private repositories.',
      inputSchema: z.object({
        repoUrl: z.string().url().refine(publicGithubRepoUrl, 'repoUrl must be a public https://github.com/<owner>/<repo> repository URL'),
        branch: z.string().min(1).max(200).default('main'),
        subdir: z.string().max(500).default(''),
        command: z.string().max(500).nullable().optional(),
        name: z.string().min(1).max(80).optional(),
        visibility: z.enum(['public', 'token']).default('token'),
        secrets: z.record(z.string(), z.string().max(16_384)).optional(),
      }),
    },
    async ({ repoUrl, branch, subdir, command, name, visibility, secrets }) => {
      requireScope(principal, 'mcp:manage');
      if (secrets && Object.keys(secrets).length) requireScope(principal, 'secrets:write');
      const plan = await resolvePlanForOwner(env, principal.ownerId, principal.ownerOrg);
      const usage = await readUsage(env, principal.ownerId);
      const deployments = await deploymentCount(env, principal.ownerId);
      if (deployments >= plan.deployments) throw new Error(`Deployment limit reached for ${plan.label}`);
      if (usage.builds >= plan.buildsPerMonth) throw new Error(`Monthly build limit reached for ${plan.label}`);

      const token = randomSecret('mcp');
      const slug = `mcp-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const deploymentName = (name || repoUrl.split('/').filter(Boolean).pop() || slug).replace(/\.git$/, '').slice(0, 80);
      await env.DB.prepare(`
        INSERT INTO servers (id,owner,owner_org,name,repo_url,branch,subdir,command,token_hash,visibility,enabled,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        slug, principal.ownerId, principal.ownerOrg, deploymentName, repoUrl, branch, subdir,
        command || null, await sha256Hex(token), visibility, 1, 'queued', now, now,
      ).run();

      try {
        if (secrets && Object.keys(secrets).length) await putDeploymentSecrets(env, slug, secrets);
      } catch (error) {
        await env.DB.prepare('DELETE FROM servers WHERE id=? AND owner=?').bind(slug, principal.ownerId).run();
        throw error;
      }

      await incrementUsage(env, principal.ownerId, 'builds');
      const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?')
        .bind(slug, principal.ownerId).first<ServerRow>();
      if (!row) throw new Error('Failed to create MCP deployment');
      ctx.waitUntil(buildServer(env, row).catch((error) => {
        console.error('PicoSvc management MCP build failed', slug, error instanceof Error ? error.message : String(error));
      }));
      return toolResult({
        id: slug,
        status: 'queued',
        visibility,
        endpoint: endpointFor(env, requestUrl, slug),
        secretNames: await listDeploymentSecretNames(env, slug),
        ...(visibility === 'token' ? {
          bearerToken: token,
          note: 'The deployment bearer token is displayed only now. Store it securely.',
        } : {}),
        plan: plan.publicTier,
      });
    },
  );

  server.registerTool(
    'update_mcp_deployment',
    {
      description: 'Change an MCP deployment visibility and/or enabled state.',
      inputSchema: z.object({
        id: z.string().min(1).max(64),
        visibility: z.enum(['public', 'token']).optional(),
        enabled: z.boolean().optional(),
      }).refine((value) => value.visibility !== undefined || value.enabled !== undefined, 'Provide visibility and/or enabled'),
    },
    async ({ id, visibility, enabled }) => {
      requireScope(principal, 'mcp:manage');
      const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?')
        .bind(id, principal.ownerId).first<ServerRow>();
      if (!row) throw new Error('MCP deployment not found');
      const nextVisibility = (visibility ?? row.visibility) as Visibility;
      const nextEnabled = enabled === undefined ? row.enabled : enabled ? 1 : 0;
      await env.DB.prepare('UPDATE servers SET visibility=?,enabled=?,updated_at=? WHERE id=? AND owner=?')
        .bind(nextVisibility, nextEnabled, new Date().toISOString(), id, principal.ownerId).run();
      return toolResult({
        id,
        visibility: nextVisibility,
        enabled: Boolean(nextEnabled),
        endpoint: endpointFor(env, requestUrl, id),
      });
    },
  );

  server.registerTool(
    'rebuild_mcp_deployment',
    {
      description: 'Queue a rebuild for an existing MCP deployment.',
      inputSchema: z.object({ id: z.string().min(1).max(64) }),
    },
    async ({ id }) => {
      requireScope(principal, 'mcp:manage');
      const plan = await resolvePlanForOwner(env, principal.ownerId, principal.ownerOrg);
      const usage = await readUsage(env, principal.ownerId);
      if (usage.builds >= plan.buildsPerMonth) throw new Error(`Monthly build limit reached for ${plan.label}`);
      const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?')
        .bind(id, principal.ownerId).first<ServerRow>();
      if (!row) throw new Error('MCP deployment not found');
      await incrementUsage(env, principal.ownerId, 'builds');
      ctx.waitUntil(buildServer(env, row).catch((error) => {
        console.error('PicoSvc management MCP rebuild failed', id, error instanceof Error ? error.message : String(error));
      }));
      return toolResult({ id, status: 'building' });
    },
  );

  server.registerTool(
    'rotate_mcp_bearer_token',
    {
      description: 'Rotate the bearer token protecting an MCP deployment. The new token is returned once.',
      inputSchema: z.object({ id: z.string().min(1).max(64) }),
    },
    async ({ id }) => {
      requireScope(principal, 'mcp:manage');
      const row = await env.DB.prepare('SELECT id FROM servers WHERE id=? AND owner=?')
        .bind(id, principal.ownerId).first();
      if (!row) throw new Error('MCP deployment not found');
      const token = randomSecret('mcp');
      await env.DB.prepare('UPDATE servers SET token_hash=?,updated_at=? WHERE id=? AND owner=?')
        .bind(await sha256Hex(token), new Date().toISOString(), id, principal.ownerId).run();
      return toolResult({
        id,
        bearerToken: token,
        note: 'The new deployment bearer token is displayed only now. Store it securely.',
      });
    },
  );

  server.registerTool(
    'list_mcp_secret_names',
    {
      description: 'List environment secret names configured for an MCP deployment. Values are never returned.',
      inputSchema: z.object({ id: z.string().min(1).max(64) }),
    },
    async ({ id }) => {
      const row = await env.DB.prepare('SELECT id FROM servers WHERE id=? AND owner=?')
        .bind(id, principal.ownerId).first();
      if (!row) throw new Error('MCP deployment not found');
      return toolResult({ id, names: await listDeploymentSecretNames(env, id) });
    },
  );

  server.registerTool(
    'put_mcp_secrets',
    {
      description: 'Create or replace encrypted MCP deployment secrets. Values are accepted but never returned.',
      inputSchema: z.object({
        id: z.string().min(1).max(64),
        secrets: z.record(z.string(), z.string().max(16_384)),
      }),
    },
    async ({ id, secrets }) => {
      requireScope(principal, 'secrets:write');
      const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?')
        .bind(id, principal.ownerId).first<ServerRow>();
      if (!row) throw new Error('MCP deployment not found');
      await putDeploymentSecrets(env, id, secrets);
      await stopRuntime(env, row);
      return toolResult({ id, names: await listDeploymentSecretNames(env, id) });
    },
  );

  server.registerTool(
    'delete_mcp_secret',
    {
      description: 'Delete one encrypted MCP deployment secret by name.',
      inputSchema: z.object({
        id: z.string().min(1).max(64),
        name: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
      }),
    },
    async ({ id, name }) => {
      requireScope(principal, 'secrets:write');
      const row = await env.DB.prepare('SELECT * FROM servers WHERE id=? AND owner=?')
        .bind(id, principal.ownerId).first<ServerRow>();
      if (!row) throw new Error('MCP deployment not found');
      await deleteDeploymentSecret(env, id, name);
      await stopRuntime(env, row);
      return toolResult({ id, names: await listDeploymentSecretNames(env, id) });
    },
  );

  return server;
}

export async function picoSvcManagementMcpRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  dispatchManagement?: PicoSvcManagementDispatch,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/mcp/picosvc') return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        allow: 'POST,GET,DELETE,OPTIONS',
        'access-control-allow-methods': 'POST,GET,DELETE,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type,mcp-protocol-version,mcp-method,mcp-name',
      },
    });
  }

  const principal = await resolveManagementPrincipal(request, env);
  if (principal instanceof Response) return principal;

  const handler = createMcpHandler(
    () => createManagementServer(env, principal, ctx, request.url, dispatchManagement),
  );
  return handler.fetch(request);
}
