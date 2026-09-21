export type OperationsService = 'functions' | 'monitor';
export type OperationsItem = {
  id: string; name: string; enabled: boolean; updatedAt: string | null;
  publicId: string | null; intervalMinutes: number | null; lastCheckedAt: string | null;
  advanced: boolean;
};
export type OperationsEvent = {
  id: string; at: string | null; kind: string; status: number | null; durationMs: number | null;
  revision: number | null;
};
export type FunctionRevision = { revision: number; at: string | null };
export type MonitorOptions = { contentSelector: string; ignoreSelector: string; stripPattern: string; advanced: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ID = /^[0-9a-f]{32}$/i;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const EVENT_TYPES = new Set(['change', 'fetch_error']);
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const date = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const http = (value: unknown): number | null => typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
export function operationsPaths(service: OperationsService, id?: string) {
  const list = service === 'functions' ? '/api/picosvc/functions/apps' : '/api/picosvc/monitor';
  if (!id) return { list, item: '', events: '', revisions: '', rollback: '', preview: '', options: '' };
  if (!UUID.test(id)) throw new Error('Invalid resource ID');
  const item = `${list}/${encodeURIComponent(id)}`;
  return { list, item, events: `${item}/${service === 'functions' ? 'logs' : 'events'}`, revisions: `${item}/revisions`, rollback: `${item}/rollback`, preview: `${item}/preview`, options: `${item}/options` };
}
/** Never copy a backend object or its code, credentials, webhook URL, error or diff into UI state. */
export function parseOperationsItems(raw: unknown, service: OperationsService): OperationsItem[] {
  const source = record(raw)?.[service === 'functions' ? 'apps' : 'monitors'];
  if (!Array.isArray(source) || source.length > 500) throw new Error('Invalid inventory response');
  const seen = new Set<string>();
  return source.map(value => {
    const row = record(value);
    if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || seen.has(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200 || ![true, false, 0, 1].includes(row.enabled as boolean)) throw new Error('Invalid inventory item');
    seen.add(row.id);
    const interval = service === 'monitor' ? count(row.interval_minutes ?? row.intervalMinutes) : null;
    const publicId = service === 'functions' && typeof row.public_id === 'string' && PUBLIC_ID.test(row.public_id) ? row.public_id.toLowerCase() : null;
    return { id: row.id, name: row.name.slice(0, 200), enabled: Boolean(row.enabled), updatedAt: date(row.updated_at ?? row.updatedAt), publicId, intervalMinutes: interval, lastCheckedAt: service === 'monitor' ? date(row.last_checked_at ?? row.lastCheckedAt) : null, advanced: service === 'monitor' && row.advanced === true };
  });
}
export function parseOperationsEvents(raw: unknown, service: OperationsService): OperationsEvent[] {
  const input = record(raw)?.[service === 'functions' ? 'logs' : 'events'];
  if (!Array.isArray(input) || input.length > 200) throw new Error('Invalid history response');
  return input.slice(0, 40).map((value, i) => {
    const row = record(value);
    if (!row) throw new Error('Invalid history event');
    const id = typeof row.id === 'string' && UUID.test(row.id) ? row.id : `event-${i}`;
    if (service === 'monitor') {
      if (typeof row.event_type !== 'string' || !EVENT_TYPES.has(row.event_type)) throw new Error('Invalid monitor event type');
      return { id, at: date(row.created_at), kind: row.event_type, status: http(row.webhook_status), durationMs: null, revision: null };
    }
    const method = typeof row.method === 'string' && METHODS.has(row.method.toUpperCase()) ? row.method.toUpperCase() : 'HTTP';
    return { id, at: date(row.occurred_at), kind: method, status: http(row.status_code), durationMs: count(row.duration_ms), revision: count(row.revision_no) };
  });
}
export function parseFunctionRevisions(raw: unknown): { current: number | null; revisions: FunctionRevision[] } {
  const payload = record(raw);
  if (!payload || !Array.isArray(payload.revisions) || payload.revisions.length > 100) throw new Error('Invalid revision response');
  const seen = new Set<number>();
  const revisions = payload.revisions.map(value => {
    const row = record(value);
    const revision = count(row?.revision_no);
    if (!revision || seen.has(revision)) throw new Error('Invalid revision');
    seen.add(revision);
    return { revision, at: date(row?.created_at) };
  });
  return { current: count(payload.currentRevision), revisions };
}
export function parseMonitorOptions(raw: unknown): MonitorOptions {
  const row = record(raw);
  if (!row || typeof row.advanced !== 'boolean') throw new Error('Invalid monitor options');
  const selector = (value: unknown, max: number) => value === null || value === undefined ? '' : typeof value === 'string' && value.length <= max ? value : (() => { throw new Error('Invalid monitor selector'); })();
  return { advanced: row.advanced, contentSelector: selector(row.contentSelector, 200), ignoreSelector: selector(row.ignoreSelector, 200), stripPattern: selector(row.stripPattern, 200) };
}
export function operationsFilter(items: OperationsItem[], query: string, filter: 'all' | 'enabled' | 'paused'): OperationsItem[] {
  const term = query.trim().toLocaleLowerCase().slice(0, 100);
  return items.filter(item => (filter === 'all' || item.enabled === (filter === 'enabled')) && item.name.toLocaleLowerCase().includes(term));
}
export function validateOperationsEdit(name: string, intervalMinutes?: number): { name: string; intervalMinutes?: number } {
  if (!name.trim() || name.length > 80) throw new Error('Name must be 1–80 characters');
  if (intervalMinutes !== undefined && (!Number.isSafeInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 10080)) throw new Error('Interval must be 5–10080 minutes');
  return intervalMinutes === undefined ? { name: name.trim() } : { name: name.trim(), intervalMinutes };
}
export function publicFunctionEndpoint(api: string, item: OperationsItem): string | null {
  if (!item.publicId) return null;
  try { const url = new URL(api); return ['https:', 'http:'].includes(url.protocol) ? `${url.origin}/fn/${item.publicId}` : null; } catch { return null; }
}
