/** Explicitly allowlist owner-scoped MCP operation fields; never propagate tokens or logs' message bodies. */
export type McpFleetItem = { id: string; name: string; enabled: boolean; status: string; runtime: string; branch: string; updatedAt: string | null };
export type McpFleetEvent = { kind: 'runtime' | 'build' | 'other'; status: string; httpStatus: number | null; durationMs: number | null; createdAt: string | null };
export type McpFleetMetrics = { requests: number; errors: number; averageDurationMs: number; errorRate: number; days: number };
export type McpFleetFilter = 'all' | 'running' | 'attention' | 'paused';
export const MCP_ID = /^[a-z0-9][a-z0-9-]{5,40}$/;
function obj(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function plain(value: unknown, length = 120): string { return typeof value === 'string' ? value.slice(0, length) : ''; }
function timestamp(value: unknown): string | null { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null; }
function nonnegative(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function http(value: unknown): number | null { return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null; }
export function mcpPaths(id?: string): { list: string; toggle: string | null; metrics: string | null; logs: string | null } {
  if (!id) return { list: '/api/servers', toggle: null, metrics: null, logs: null };
  if (!MCP_ID.test(id)) throw new Error('Invalid MCP ID.');
  const base = `/api/picosvc/mcp/servers/${encodeURIComponent(id)}`;
  return { list: '/api/servers', toggle: `/api/servers/${encodeURIComponent(id)}`, metrics: `${base}/metrics?days=30`, logs: `${base}/logs?limit=30` };
}
export function parseMcpFleet(raw: unknown): McpFleetItem[] {
  if (!Array.isArray(raw) || raw.length > 500) throw new Error('Invalid MCP listing.');
  const seen = new Set<string>();
  return raw.map(value => {
    const item = obj(value);
    if (!item || typeof item.id !== 'string' || !MCP_ID.test(item.id) || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || !(item.enabled === 0 || item.enabled === 1 || typeof item.enabled === 'boolean')) throw new Error('Invalid MCP deployment.');
    seen.add(item.id);
    const status = plain(item.status, 40);
    const runtime = plain(item.detected_runtime ?? item.detectedRuntime, 60);
    return { id: item.id, name: item.name, enabled: Boolean(item.enabled), status: /^[a-z-]{1,40}$/.test(status) ? status : 'unknown', runtime: /^[a-z0-9-]{1,60}$/i.test(runtime) ? runtime : '—', branch: /^[a-zA-Z0-9._/-]{1,100}$/.test(plain(item.branch, 110)) ? plain(item.branch, 100) : '—', updatedAt: timestamp(item.updated_at ?? item.updatedAt) };
  });
}
export function filterMcpFleet(items: McpFleetItem[], query: string, filter: McpFleetFilter): McpFleetItem[] {
  const term = query.trim().toLocaleLowerCase().slice(0, 100);
  return items.filter(item => (filter === 'all' || filter === 'paused' && !item.enabled || filter === 'running' && item.enabled && item.status === 'ready' || filter === 'attention' && item.enabled && item.status !== 'ready') && `${item.name} ${item.status} ${item.runtime} ${item.branch}`.toLocaleLowerCase().includes(term));
}
export function parseMcpMetrics(raw: unknown): McpFleetMetrics {
  const body = obj(raw); const summary = obj(body?.summary);
  const requests = nonnegative(summary?.requests), errors = nonnegative(summary?.errors), average = nonnegative(summary?.averageDurationMs);
  const days = nonnegative(body?.days);
  if (requests === null || errors === null || average === null || days === null || !Number.isSafeInteger(days) || days < 1 || days > 90 || errors > requests) throw new Error('Invalid MCP metrics.');
  return { requests, errors, averageDurationMs: average, errorRate: requests ? errors / requests : 0, days };
}
export function parseMcpEvents(raw: unknown): McpFleetEvent[] {
  const body = obj(raw);
  if (!Array.isArray(body?.events) || body.events.length > 200) throw new Error('Invalid MCP logs.');
  return body.events.slice(0, 30).map(value => {
    const item = obj(value);
    if (!item) throw new Error('Invalid MCP log entry.');
    const kind = item.kind === 'runtime' || item.kind === 'build' ? item.kind : 'other';
    const status = plain(item.status, 40);
    return { kind, status: /^[a-z-]{1,40}$/.test(status) ? status : 'unknown', httpStatus: http(item.http_status), durationMs: nonnegative(item.duration_ms), createdAt: timestamp(item.created_at) };
  });
}
