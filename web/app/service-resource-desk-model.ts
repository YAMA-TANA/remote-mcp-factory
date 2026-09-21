/* Parse only fields used by owner-authenticated QR / RSS resource management. */
export type DeskService = 'qr' | 'rss';
export type Selectors = { itemSelector: string; titleSelector: string; linkSelector: string; contentSelector: string; dateSelector: string };
export type DeskResource = {
  id: string; name: string; publicId: string; enabled: boolean; targetUrl: string;
  updatedAt: string | null; checkedAt: string | null; scans: number; selectors: Selectors;
};
export type FeedPreview = { mode: string; used: number | null; items: { title: string; hostname: string }[] };
export type FeedRefresh = { changed: boolean; extracted: number; inserted: number; used: number | null };
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const PUBLIC = /^[a-f\d]{32}$/i;
const KEYS = ['itemSelector', 'titleSelector', 'linkSelector', 'contentSelector', 'dateSelector'] as const;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function time(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
function natural(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function publicUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Invalid destination URL.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error('Invalid destination URL.');
  return value;
}
function hostname(value: unknown): string {
  try { return new URL(publicUrl(value)).hostname.slice(0, 255); } catch { return '—'; }
}
function selectors(row: Record<string, unknown>): Selectors {
  return Object.fromEntries(KEYS.map(key => {
    const snake = key.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`);
    const raw = row[key] ?? row[snake];
    if (raw !== null && raw !== undefined && (typeof raw !== 'string' || raw.length > 300)) throw new Error('Invalid feed selectors.');
    return [key, raw || ''];
  })) as Selectors;
}
export function parseDeskResources(payload: unknown, service: DeskService): DeskResource[] {
  const rows = object(payload)?.[service === 'qr' ? 'links' : 'feeds'];
  if (!Array.isArray(rows) || rows.length > 500) throw new Error('Invalid resource inventory.');
  const seen = new Set<string>();
  return rows.map(raw => {
    const row = object(raw);
    if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || seen.has(row.id)
      || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200
      || typeof row.public_id !== 'string' || !PUBLIC.test(row.public_id)
      || ![true, false, 0, 1].includes(row.enabled as boolean)) throw new Error('Invalid resource record.');
    seen.add(row.id);
    const targetUrl = publicUrl(row[service === 'qr' ? 'target_url' : 'source_url']);
    const scans = service === 'qr' ? natural(row.scans) : 0;
    if (scans === null) throw new Error('Invalid scan count.');
    return {
      id: row.id, name: row.name, publicId: row.public_id.toLowerCase(), enabled: Boolean(row.enabled), targetUrl,
      updatedAt: time(row.updated_at), checkedAt: service === 'rss' ? time(row.last_checked_at) : null,
      scans, selectors: service === 'rss' ? selectors(row) : selectors({}),
    };
  });
}
export function resourcePaths(service: DeskService, id?: string): { list: string; item: string | null; preview: string | null; refresh: string | null } {
  const list = service === 'qr' ? '/api/picosvc/qr/links' : '/api/picosvc/rss/feeds';
  if (!id) return { list, item: null, preview: null, refresh: null };
  if (!UUID.test(id)) throw new Error('Invalid resource ID.');
  const item = `${list}/${encodeURIComponent(id)}`;
  return { list, item, preview: service === 'rss' ? `${item}/preview` : null, refresh: service === 'rss' ? `${item}/refresh` : null };
}
export function resourcePublicUrl(service: DeskService, apiOrigin: string, publicId: string, svg = false): string {
  if (!PUBLIC.test(publicId)) throw new Error('Invalid public resource ID.');
  const url = new URL(apiOrigin);
  if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))) throw new Error('Invalid API origin.');
  return `${url.origin}/${service === 'qr' ? `q/${publicId}${svg ? '.svg' : ''}` : `rss/${publicId}.xml`}`;
}
export function parseFeedPreview(payload: unknown): FeedPreview {
  const row = object(payload);
  if (!row || !Array.isArray(row.items) || row.items.length > 20) throw new Error('Invalid preview response.');
  return {
    mode: typeof row.mode === 'string' ? row.mode.slice(0, 40) : '—',
    used: natural(row.monthlyChecksUsed),
    items: row.items.map(raw => {
      const item = object(raw);
      if (!item) throw new Error('Invalid preview item.');
      return { title: typeof item.title === 'string' ? item.title.slice(0, 160) : '—', hostname: hostname(item.link) };
    }),
  };
}
export function parseFeedRefresh(payload: unknown): FeedRefresh {
  const row = object(payload);
  if (!row || typeof row.changed !== 'boolean' || natural(row.extracted) === null || natural(row.inserted) === null) throw new Error('Invalid refresh response.');
  return { changed: row.changed, extracted: natural(row.extracted)!, inserted: natural(row.inserted)!, used: natural(row.monthlyChecksUsed) };
}
export function filterDeskResources(items: DeskResource[], query: string, status: 'all' | 'enabled' | 'paused'): DeskResource[] {
  const search = query.trim().toLocaleLowerCase().slice(0, 100);
  return items.filter(item => (status === 'all' || item.enabled === (status === 'enabled'))
    && `${item.name} ${hostname(item.targetUrl)}`.toLocaleLowerCase().includes(search));
}
export function patchDeskResource(service: DeskService, name: string, targetUrl: string, settings: Selectors): Record<string, unknown> {
  const clean = name.trim();
  if (!clean || clean.length > 80) throw new Error('Name must contain 1–80 characters.');
  publicUrl(targetUrl);
  const payload: Record<string, unknown> = { name: clean, [service === 'qr' ? 'targetUrl' : 'sourceUrl']: targetUrl };
  if (service === 'rss') for (const key of KEYS) {
    if (settings[key].length > 300) throw new Error('Selectors must be at most 300 characters.');
    payload[key] = settings[key] || null;
  }
  return payload;
}
