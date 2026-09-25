import type { Env } from '../types.js';
import { fetchPublic, safePublicUrl } from './security.js';

export type InternalPicoSvcDispatch = (request: Request) => Promise<Response | null>;

function configuredOrigins(env: Env, requestOrigin?: string): Set<string> {
  const values = [env.PICOSVC_INTERNAL_ORIGINS || '', env.PUBLIC_MCP_ORIGIN || '', requestOrigin || '']
    .flatMap((value) => value.split(','));
  const origins = new Set<string>();
  for (const value of values) {
    const candidate = value.trim();
    try {
      const url = new URL(candidate);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin === candidate.replace(/\/$/, '')) origins.add(url.origin);
    } catch { /* Ignore invalid optional origin configuration. */ }
  }
  return origins;
}

function isPicoSvcRuntimePath(pathname: string): boolean {
  return /^\/(?:hooks|mock|fn|json|files|license|flags|forms|q|rss)(?:\/|$)/i.test(pathname);
}

export async function fetchPicoSvcTarget(
  input: string | URL,
  init: RequestInit,
  env: Env,
  dispatchInternal?: InternalPicoSvcDispatch,
  requestOrigin?: string,
): Promise<Response> {
  const target = safePublicUrl(typeof input === 'string' ? input : input.toString());
  if (!target) throw new Error('URL must be a public HTTP(S) URL on port 80 or 443');

  if (dispatchInternal && isPicoSvcRuntimePath(target.pathname) && configuredOrigins(env, requestOrigin).has(target.origin)) {
    const response = await dispatchInternal(new Request(target, { ...init, redirect: 'manual' }));
    return response || new Response('PicoSvc internal target not found', { status: 404 });
  }
  return fetchPublic(target, init);
}
