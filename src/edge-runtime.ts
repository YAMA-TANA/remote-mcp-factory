import { loadDeploymentSecrets } from './secrets.js';
import type { EdgeBuildRow, Env, ServerRow } from './types.js';

const EDGE_CPU_MS_PER_REQUEST = 1_000;
const EDGE_SUBREQUESTS_PER_REQUEST = 64;

function sanitizedEdgeRequest(request: Request<any, any>): Request {
  const url = new URL(request.url);
  url.pathname = '/mcp';
  url.search = '';
  const headers = new Headers(request.headers);
  headers.delete('authorization');
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  return new Request(url.toString(), init);
}

export async function edgeBuildFor(env: Env, serverId: string): Promise<EdgeBuildRow | null> {
  return await env.DB.prepare('SELECT * FROM edge_builds WHERE server_id=?').bind(serverId).first<EdgeBuildRow>();
}

export async function serveEdgeRequest(env: Env, row: ServerRow, request: Request<any, any>): Promise<Response | null> {
  const edge = await edgeBuildFor(env, row.id);
  if (!edge || edge.status !== 'ready' || !edge.bundle || !edge.bundle_hash) return null;
  if (!env.LOADER) throw new Error('Dynamic Worker loader binding is not configured');

  // updated_at changes when secrets/access configuration changes, so a warm isolate never reuses stale credentials.
  const workerId = `mcp:${row.id}:${edge.bundle_hash}:${row.updated_at}`;
  const stub = env.LOADER.get(workerId, async () => {
    const deploymentSecrets = await loadDeploymentSecrets(env, row.id);
    return {
      compatibilityDate: '2026-09-15',
      compatibilityFlags: ['nodejs_compat'],
      mainModule: 'worker.js',
      modules: {
        'worker.js': { js: edge.bundle! },
      },
      env: deploymentSecrets.values,
      limits: {
        cpuMs: EDGE_CPU_MS_PER_REQUEST,
        subRequests: EDGE_SUBREQUESTS_PER_REQUEST,
      },
      // API/SaaS MCPs need outbound fetch. Egress allow/deny policy will be tightened before arbitrary public signup.
    };
  });
  return await stub.getEntrypoint().fetch(sanitizedEdgeRequest(request));
}
