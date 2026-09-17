type Data = Record<string, unknown>;
const object = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const integer = (value: unknown, max: number): number | null => { const n = Number(value); return value !== null && value !== undefined && value !== '' && Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null; };
const timestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const safeToken = (value: unknown, allowed: readonly string[]): string => typeof value === 'string' && allowed.includes(value) ? value : 'other';
const eventKinds = ['build', 'runtime'] as const;
const eventStatuses = ['ready', 'queued', 'building', 'failed', 'error', 'ok', 'running', 'stopped'] as const;
const deliveryStatuses = ['delivered', 'failed', 'quota_reached', 'pending', 'retry', 'sending'] as const;

/** Only pre-approved operational fields are copied. Never spread a server, event or email object. */
export function mcpSupportSnapshot(status: unknown, logs: unknown, usage: unknown, capturedAt: string) {
  const overview = object(status); const server = object(overview?.server);
  const eventList = object(logs)?.events; const metrics = object(usage); const summary = object(metrics?.summary);
  if (!server || !Array.isArray(eventList) || !summary || metrics?.days !== 30 || eventList.length > 50 || eventList.some(row => !object(row))) throw new Error('Invalid MCP diagnostic response.');
  const events = eventList.map(value => {
    const row = object(value)!;
    return {
      kind: safeToken(row.kind, eventKinds), status: safeToken(row.status, eventStatuses),
      httpStatus: integer(row.http_status, 599), durationMs: integer(row.duration_ms, 3_600_000), at: timestamp(row.created_at),
    };
  });
  return {
    schema: 'picosvc.mcp-support.v1', capturedAt,
    scope: { metricsDays: 30, events: 'latest at most 50; not complete history', sampledEvents: events.length },
    deployment: { status: safeToken(server.status, eventStatuses), enabled: server.enabled === true, runtime: safeToken(server.detectedRuntime, ['edge', 'node', 'python', 'unknown', 'cloudflare', 'docker']), updatedAt: timestamp(server.updatedAt) },
    edge: overview?.edge ? { status: safeToken(object(overview.edge)?.status, eventStatuses), tools: integer(object(overview.edge)?.tool_count, 100_000), bytes: integer(object(overview.edge)?.size_bytes, 1_000_000_000) } : null,
    metrics: { requests: number(summary.requests), errors: number(summary.errors), averageDurationMs: number(summary.averageDurationMs) },
    events,
  };
}

/** Aggregate only: never include mail IDs, addresses, subjects, bodies, headers, URLs or error strings. */
export function mailSupportSnapshot(response: unknown, capturedAt: string) {
  const entries = object(response)?.events;
  if (!Array.isArray(entries) || entries.length > 100 || entries.some(value => !object(value))) throw new Error('Invalid mail diagnostic response.');
  const statuses: Record<string, number> = { delivered: 0, failed: 0, quota_reached: 0, pending: 0, retry: 0, sending: 0, other: 0 };
  let retryable = 0; let latestAt: string | null = null; let maxAttempts = 0;
  for (const entry of entries) {
    const row = object(entry)!;
    const status = safeToken(row.delivery_status ?? row.deliveryStatus, deliveryStatuses);
    statuses[status] += 1;
    const attempts = integer(row.attempts, 4);
    if ((status === 'failed' || status === 'retry') && attempts !== null && attempts < 4) retryable += 1;
    if (attempts !== null) maxAttempts = Math.max(maxAttempts, attempts);
    const at = timestamp(row.received_at ?? row.receivedAt);
    if (at && (!latestAt || at > latestAt)) latestAt = at;
  }
  return { schema: 'picosvc.mail-support.v1', capturedAt, scope: 'latest at most 100 events; not complete history', sampledEvents: entries.length, statuses, retryable, maxAttempts, latestAt };
}

export function supportJson(snapshot: unknown): string { return JSON.stringify(snapshot, null, 2) + '\n'; }
