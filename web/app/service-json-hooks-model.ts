export type DataService = 'json' | 'hooks';
export type DataResource = { id: string; name: string; enabled: boolean; publicId: string | null; endpoint: string | null; count: number | null; lastAt: string | null };
export type HookEvent = { id: string; method: string; at: string | null; bytes: number; contentType: string | null };
export type ScopedToken = { id: string; label: string; scope: 'read' | 'write' | 'readwrite'; prefix: string; expiresAt: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ID = /^[0-9a-f]{32}$/i;
const KEY = /^[A-Za-z0-9._:@/-]{1,200}$/;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const timestamp = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function validResourceId(id: string): boolean { return UUID.test(id); }
export function validDocumentKey(key: string): boolean { return KEY.test(key) && !key.includes('..'); }
export function dataPaths(service: DataService, id?: string, child?: string) {
  const list = service === 'json' ? '/api/picosvc/json/stores' : '/api/picosvc/hooks/inboxes';
  if (!id) return { list, item: '', settings: '', tokens: '', events: '', document: '' };
  if (!UUID.test(id)) throw new Error('Invalid resource identifier');
  const item = `${list}/${id}`;
  const document = child === undefined ? '' : `${item}/documents/${encodeURIComponent(child)}`;
  if (child !== undefined && !validDocumentKey(child)) throw new Error('Invalid document key');
  return { list, item, settings: `${item}/settings`, tokens: `${item}/tokens`, events: `${item}/events?limit=50`, document };
}
export function parseResources(raw: unknown, service: DataService): DataResource[] {
  const source = record(raw)?.[service === 'json' ? 'stores' : 'inboxes'];
  if (!Array.isArray(source) || source.length > 500) throw new Error('Invalid inventory');
  const seen = new Set<string>();
  return source.map(value => {
    const row = record(value); const id = row?.id;
    if (typeof id !== 'string' || !UUID.test(id) || seen.has(id) || typeof row?.name !== 'string' || !row.name.trim() || row.name.length > 200) throw new Error('Invalid inventory item');
    seen.add(id);
    const enabled = service === 'json' ? true : row.enabled;
    if (![true, false, 0, 1].includes(enabled as boolean)) throw new Error('Invalid availability');
    const publicId = service === 'json' && typeof row.public_id === 'string' && PUBLIC_ID.test(row.public_id) ? row.public_id.toLowerCase() : null;
    const endpoint = service === 'hooks' && typeof row.endpoint === 'string' && /^https?:\/\//.test(row.endpoint) ? (() => {
      try { const url = new URL(row.endpoint as string); return !url.username && !url.password && /^\/hooks\/[a-f0-9]{32}$/.test(url.pathname) && !url.search && !url.hash ? url.toString() : null; } catch { return null; }
    })() : null;
    return { id, name: row.name, enabled: Boolean(enabled), publicId, endpoint, count: service === 'hooks' ? number(row.eventCount) : null, lastAt: service === 'hooks' ? timestamp(row.latestEventAt) : null };
  });
}
export function parseSettings(raw: unknown): boolean {
  const row = record(raw); if (!row || typeof row.publicRead !== 'boolean') throw new Error('Invalid store settings'); return row.publicRead;
}
export function parseTokens(raw: unknown): ScopedToken[] {
  const input = record(raw)?.tokens; if (!Array.isArray(input) || input.length > 100) throw new Error('Invalid token list');
  const seen = new Set<string>();
  return input.map(value => {
    const row = record(value); const id = row?.id; const scope = row?.scope;
    if (typeof id !== 'string' || !UUID.test(id) || seen.has(id) || !['read','write','readwrite'].includes(scope as string)) throw new Error('Invalid token metadata');
    seen.add(id);
    return { id, label: typeof row?.label === 'string' ? row.label.slice(0, 120) : '', scope: scope as ScopedToken['scope'], prefix: typeof row?.key_prefix === 'string' && row.key_prefix.length <= 200 ? row.key_prefix : '', expiresAt: timestamp(row?.expires_at) };
  });
}
export function parseDocument(raw: unknown, expectedKey: string): { value: unknown; updatedAt: string | null } {
  const row = record(raw); if (!row || row.key !== expectedKey || !('value' in row)) throw new Error('Invalid document');
  const text = JSON.stringify(row.value); if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 262144) throw new Error('Document exceeds 256 KiB');
  return { value: row.value, updatedAt: timestamp(row.updatedAt) };
}
export function prepareDocument(key: string, text: string): { key: string; body: string } {
  if (!validDocumentKey(key)) throw new Error('Document key must contain 1–200 safe characters');
  if (new TextEncoder().encode(text).byteLength > 262144) throw new Error('Document exceeds 256 KiB');
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error('Enter valid JSON'); }
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).byteLength > 262144) throw new Error('Document exceeds 256 KiB');
  return { key, body };
}
export function parseHookEvents(raw: unknown): { events: HookEvent[]; nextBefore: string | null } {
  const payload = record(raw); const input = payload?.events;
  if (!Array.isArray(input) || input.length > 100) throw new Error('Invalid hook history');
  const seen = new Set<string>(); const methods = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
  const events = input.map(value => {
    const row = record(value); const id = row?.id;
    if (typeof id !== 'string' || !UUID.test(id) || seen.has(id)) throw new Error('Invalid event'); seen.add(id);
    const method = typeof row?.method === 'string' && methods.has(row.method.toUpperCase()) ? row.method.toUpperCase() : 'HTTP';
    return { id, method, at: timestamp(row?.receivedAt), bytes: number(row?.sizeBytes) ?? 0, contentType: typeof row?.contentType === 'string' && row.contentType.length <= 120 ? row.contentType : null };
  });
  return { events, nextBefore: timestamp(payload?.nextBefore) };
}
export function publicJsonUrl(api: string, resource: DataResource, key: string): string | null {
  if (!resource.publicId || !validDocumentKey(key)) return null;
  try { const url = new URL(api); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? `${url.origin}/json/${resource.publicId}/${key.split('/').map(encodeURIComponent).join('/')}` : null; } catch { return null; }
}
