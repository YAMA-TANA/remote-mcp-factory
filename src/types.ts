import type { Sandbox } from '@cloudflare/sandbox';

export type Visibility = 'public' | 'token';
export type PlanId = 'hobby' | 'pro' | 'team';

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  DB: D1Database;
  MCP_SERVER_RATE_LIMITER: RateLimiter;
  MCP_CLIENT_RATE_LIMITER: RateLimiter;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWT_KEY?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
  CLERK_PRO_PLAN_SLUG?: string;
  CLERK_TEAM_PLAN_SLUG?: string;
  CLERK_SIGN_IN_URL?: string;
  CLERK_PRICING_URL?: string;
  ALLOW_DEV_AUTH?: string;
  PUBLIC_MCP_ORIGIN?: string;
}

export interface AuthIdentity {
  userId: string;
  orgId: string | null;
  ownerId: string;
}

export interface ServerRow {
  id: string;
  owner: string;
  owner_org: string | null;
  name: string;
  repo_url: string;
  branch: string;
  subdir: string;
  command: string | null;
  token_hash: string;
  visibility: Visibility;
  enabled: number;
  status: string;
  detected_runtime: string | null;
  detected_command: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}
