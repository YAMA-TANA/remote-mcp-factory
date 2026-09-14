import { createClerkClient } from '@clerk/backend';
import type { AuthIdentity, Env } from './types.js';

function clerk(env: Env) {
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) {
    throw new Error('Clerk is not configured. Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.');
  }
  return createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
  });
}

export async function clerkIdentity(request: Request, env: Env): Promise<AuthIdentity | null> {
  if (env.ALLOW_DEV_AUTH === 'true') {
    const userId = request.headers.get('x-dev-user')?.trim();
    if (userId) {
      const orgId = request.headers.get('x-dev-org')?.trim() || null;
      return { userId, orgId, ownerId: orgId || userId };
    }
  }

  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) return null;
  try {
    const client = clerk(env);
    const authorizedParties = env.CLERK_AUTHORIZED_PARTIES
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const state = await client.authenticateRequest(request, {
      ...(env.CLERK_JWT_KEY ? { jwtKey: env.CLERK_JWT_KEY } : {}),
      ...(authorizedParties?.length ? { authorizedParties } : {}),
    });
    if (!state.isAuthenticated) return null;
    const auth = state.toAuth();
    if (!auth.userId) return null;
    const orgId = auth.orgId || null;
    return { userId: auth.userId, orgId, ownerId: orgId || auth.userId };
  } catch {
    return null;
  }
}

export function clerkConfigured(env: Env): boolean {
  return Boolean(env.CLERK_SECRET_KEY && env.CLERK_PUBLISHABLE_KEY);
}

export function clerkClientFor(env: Env) {
  return clerk(env);
}
