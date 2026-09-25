import type { Sandbox } from '@cloudflare/sandbox';

export type Visibility = 'public' | 'token';
/** Legacy billing-cache IDs. Public names are Free/Pico/PicoPlus. */
export type PlanId = 'hobby' | 'pro' | 'team';
export type EdgeBuildStatus = 'ready' | 'failed' | 'incompatible';
export type CompatibilityRuntime = 'edge' | 'edge-with-bridge' | 'edge-with-bridge-candidate' | 'heavy' | 'local-bound';

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface BrowserRunBinding {
  quickAction(action: string, options: Record<string, unknown>): Promise<Response>;
}

export interface DynamicWorkerLimits {
  cpuMs?: number;
  subRequests?: number;
}

export type DynamicWorkerModule =
  | string
  | { js: string }
  | { cjs: string }
  | { py: string }
  | { text: string }
  | { data: ArrayBuffer }
  | { wasm: ArrayBuffer }
  | { json: unknown };

export interface DynamicWorkerCode {
  compatibilityDate: string;
  compatibilityFlags?: string[];
  mainModule: string;
  modules: Record<string, DynamicWorkerModule>;
  env?: Record<string, unknown>;
  globalOutbound?: unknown;
  limits?: DynamicWorkerLimits;
}

export interface DynamicWorkerEntrypoint {
  fetch(request: Request): Promise<Response>;
}

export interface DynamicWorkerStub {
  getEntrypoint(name?: string, options?: { limits?: DynamicWorkerLimits }): DynamicWorkerEntrypoint;
}

export interface WorkerLoader {
  get(id: string, callback: () => Promise<DynamicWorkerCode>): DynamicWorkerStub;
  load(code: DynamicWorkerCode): DynamicWorkerStub;
}

export interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  DB: D1Database;
  ARTIFACTS?: R2Bucket;
  LOADER?: WorkerLoader;
  BROWSER?: BrowserRunBinding;
  MCP_SERVER_RATE_LIMITER: RateLimiter;
  MCP_CLIENT_RATE_LIMITER: RateLimiter;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWT_KEY?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
  CLERK_PICO_PLAN_SLUG?: string;
  CLERK_PICOPLUS_PLAN_SLUG?: string;
  /** Legacy aliases accepted during migration to Pico/PicoPlus. */
  CLERK_PRO_PLAN_SLUG?: string;
  CLERK_TEAM_PLAN_SLUG?: string;
  CLERK_SIGN_IN_URL?: string;
  CLERK_PRICING_URL?: string;
  DEPLOYMENT_SECRETS_KEY?: string;
  BRIDGE_SIGNING_KEY?: string;
  ALLOW_DEV_AUTH?: string;
  PUBLIC_MCP_ORIGIN?: string;
  PICOSVC_INTERNAL_ORIGINS?: string;
  WEB_ORIGINS?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_OAUTH_CALLBACK_URL?: string;
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
  github_installation_id: number | null;
  github_repo_id: number | null;
  github_repo_full_name: string | null;
  auto_deploy: number;
  redeploy_pending: number;
}

export interface EdgeBuildRow {
  server_id: string;
  status: EdgeBuildStatus;
  compiler_version: string;
  bundle_hash: string | null;
  bundle: string | null;
  artifact_key: string | null;
  main_module: string | null;
  module_count: number;
  size_bytes: number;
  tool_count: number;
  tools_json: string;
  compatibility_json: string;
  reason: string | null;
  updated_at: string;
}

export interface NativeDependencyEvidence {
  kind: 'subprocess' | 'binary' | 'browser' | 'local-bound';
  command: string | null;
  file: string;
  line: number;
  tool: string | null;
  bridgeCandidate: boolean;
}

export interface CompatibilityReport {
  runtime: CompatibilityRuntime;
  bridgeCommands: string[];
  evidence: NativeDependencyEvidence[];
  summary: string;
}
