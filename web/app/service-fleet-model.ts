/** Safe projection of owner-authenticated Cron/Mail APIs for dedicated fleet consoles. */
export type FleetService = 'cron' | 'mail';
export type FleetItem = {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  secondary: string;
  lastActivity: string | null;
};
export type FleetEvent = {
  id: string;
  status: 'ok' | 'failed' | 'pending';
  label: string;
  occurredAt: string | null;
  responseStatus: number | null;
  attempts: number | null;
  durationMs: number | null;
};
export type FleetFilter = 'all' | 'enabled' | 'paused';
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const MAIL_STATUSES = new Set(['delivered', 'failed', 'retry', 'pending', 'sending', 'quota_reached']);
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}
function statusCode(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}
function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function hostname(value: unknown): string {
  try {
    if (typeof value !== 'string') return '—';
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.hostname.slice(0, 255) : '—';
  } catch { return '—'; }
}
/** Never pass through raw headers, bodies, webhook URLs or mail message content. */
export function readFleetItems(raw: unknown, service: FleetService): FleetItem[] {
  const response = record(raw);
  const input = response?.[service === 'cron' ? 'jobs' : 'routes'];
  if (!Array.isArray(input) || input.length > 500) throw new Error('Invalid fleet response.');
  const seen = new Set<string>();
  return input.map(value => {
    const item = record(value);
    if (!item || typeof item.id !== 'string' || !UUID.test(item.id) || seen.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200
      || !(typeof item.enabled === 'boolean' || item.enabled === 0 || item.enabled === 1)) throw new Error('Invalid fleet resource.');
    seen.add(item.id);
    if (service === 'cron') {
      return {
        id: item.id, name: item.name, enabled: Boolean(item.enabled),
        description: text(item.cron, 400) || text(item.cron_expression, 400) || '—',
        secondary: `${text(item.timezone, 80) || 'UTC'} · ${text(item.method, 12) || 'GET'} · ${hostname(item.targetUrl ?? item.target_url)}`,
        lastActivity: date(item.lastRunAt ?? item.last_run_at),
      };
    }
    const address = typeof item.address === 'string' && /^[a-z0-9]{32}@picosvc\.com$/.test(item.address)
      ? item.address : '—';
    return { id: item.id, name: item.name, enabled: Boolean(item.enabled), description: address,
      secondary: '', lastActivity: date(item.updatedAt ?? item.updated_at) };
  });
}
/** Event projections intentionally discard message subjects, senders, payloads, errors and response bodies. */
export function readFleetEvents(raw: unknown, service: FleetService): FleetEvent[] {
  const response = record(raw);
  const input = response?.[service === 'cron' ? 'runs' : 'events'];
  if (!Array.isArray(input) || input.length > 200) throw new Error('Invalid fleet history response.');
  return input.slice(0, 30).map((value, index) => {
    const item = record(value);
    if (!item) throw new Error('Invalid fleet history event.');
    const id = typeof item.id === 'string' && UUID.test(item.id) ? item.id : `record-${index}`;
    const responseStatus = statusCode(item.response_status ?? item.responseStatus);
    if (service === 'cron') {
      const failed = item.error !== null && item.error !== undefined && item.error !== '';
      const status = failed ? 'failed' : responseStatus === null ? 'pending' : 'ok';
      return { id, status, label: status, occurredAt: date(item.ran_at ?? item.ranAt),
        responseStatus, attempts: null, durationMs: integer(item.duration_ms ?? item.durationMs) };
    }
    const delivery = text(item.delivery_status ?? item.deliveryStatus, 40);
    if (!MAIL_STATUSES.has(delivery)) throw new Error('Invalid mail delivery status.');
    const status = delivery === 'delivered' ? 'ok' : ['failed', 'quota_reached'].includes(delivery) ? 'failed' : 'pending';
    return { id, status, label: delivery, occurredAt: date(item.received_at ?? item.receivedAt),
      responseStatus, attempts: integer(item.attempts), durationMs: null };
  });
}
export function filterFleet(items: FleetItem[], query: string, filter: FleetFilter): FleetItem[] {
  const term = query.trim().toLocaleLowerCase().slice(0, 100);
  return items.filter(item => (filter === 'all' || (filter === 'enabled') === item.enabled)
    && `${item.name} ${item.description} ${item.secondary}`.toLocaleLowerCase().includes(term));
}
export function fleetPaths(service: FleetService, id?: string): { list: string; detail: string | null; toggle: string | null } {
  const list = service === 'cron' ? '/api/picosvc/cron/jobs' : '/api/picosvc/mail/routes';
  if (!id) return { list, detail: null, toggle: null };
  if (!UUID.test(id)) throw new Error('Invalid resource ID.');
  return { list, detail: `${list}/${encodeURIComponent(id)}/${service === 'cron' ? 'runs' : 'events'}`, toggle: `${list}/${encodeURIComponent(id)}` };
}
