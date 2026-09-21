export type DataDeskService = 'flags' | 'files';
export type DataProject = { id: string; name: string; publicId: string; enabled: boolean };
export type FlagItem = { key: string; enabled: boolean; value: unknown; updatedAt: string | null };
export type FileItem = { path: string; size: number; contentType: string; updatedAt: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC = /^[a-f0-9]{32}$/i;
const FLAG = /^[A-Za-z0-9._-]{1,100}$/;
const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const timestamp = (v: unknown): string | null => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
const number = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
function boolean(v: unknown): boolean { if (v !== true && v !== false && v !== 0 && v !== 1) throw new Error('Invalid state'); return Boolean(v); }
export function validFilePath(path: string): boolean { return Boolean(path && path.length <= 512 && !path.includes('..') && !path.startsWith('/') && !path.includes('//') && !/[\x00-\x1f]/.test(path)); }
export function dataPaths(service: DataDeskService, id?: string, key?: string) {
  const list = `/api/picosvc/${service}/${service === 'flags' ? 'projects' : 'spaces'}`;
  if (!id) return { list, children: '', flag: '', object: '' };
  if (!UUID.test(id)) throw new Error('Invalid resource ID');
  if (key !== undefined && (service === 'flags' ? !FLAG.test(key) : !validFilePath(key))) throw new Error('Invalid key/path');
  const base = `${list}/${id}`;
  return { list, children: `${base}/${service === 'flags' ? 'flags' : 'objects'}`, flag: `${base}/flags${key === undefined ? '' : `/${encodeURIComponent(key)}`}`, object: `${base}/object${key === undefined ? '' : `?path=${encodeURIComponent(key)}`}` };
}
export function parseDataProjects(raw: unknown, service: DataDeskService): DataProject[] {
  const entries = obj(raw)?.[service === 'flags' ? 'projects' : 'spaces'];
  if (!Array.isArray(entries) || entries.length > 500) throw new Error('Invalid project inventory');
  const seen = new Set<string>();
  return entries.map(value => {
    const row = obj(value);
    if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || seen.has(row.id) || typeof row.public_id !== 'string' || !PUBLIC.test(row.public_id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200) throw new Error('Invalid project');
    seen.add(row.id);
    return { id: row.id, name: row.name, publicId: row.public_id.toLowerCase(), enabled: service === 'flags' ? true : boolean(row.enabled) };
  });
}
export function parseFlags(raw: unknown): FlagItem[] {
  const entries = obj(raw)?.flags;
  if (!Array.isArray(entries) || entries.length > 500) throw new Error('Invalid flag inventory');
  const seen = new Set<string>();
  return entries.map(value => {
    const row = obj(value);
    if (!row || typeof row.key !== 'string' || !FLAG.test(row.key) || seen.has(row.key) || !Object.hasOwn(row, 'value')) throw new Error('Invalid flag');
    const json = JSON.stringify(row.value);
    if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > 32_768) throw new Error('Flag value too large');
    seen.add(row.key);
    return { key: row.key, enabled: boolean(row.enabled), value: JSON.parse(json) as unknown, updatedAt: timestamp(row.updatedAt ?? row.updated_at) };
  });
}
export function parseFiles(raw: unknown): { files: FileItem[]; used: number; limit: number | null } {
  const payload = obj(raw); const entries = payload?.objects;
  if (!Array.isArray(entries) || entries.length > 500) throw new Error('Invalid file inventory');
  const used = number(payload?.storageUsedBytes);
  const limit = payload?.storageLimitBytes === null ? null : number(payload?.storageLimitBytes);
  if (used === null || limit === null && payload?.storageLimitBytes !== null) throw new Error('Invalid storage capacity');
  const seen = new Set<string>();
  const files = entries.map(value => {
    const row = obj(value); const size = number(row?.size_bytes);
    if (!row || typeof row.path !== 'string' || !validFilePath(row.path) || seen.has(row.path) || typeof row.content_type !== 'string' || row.content_type.length > 200 || size === null) throw new Error('Invalid file metadata');
    seen.add(row.path);
    return { path: row.path, size, contentType: row.content_type, updatedAt: timestamp(row.updated_at) };
  });
  return { files, used, limit };
}
export function prepareFlag(key: string, text: string, enabled: boolean): { key: string; value: unknown; enabled: boolean } {
  if (!FLAG.test(key)) throw new Error('Invalid flag key (1–100 letters, numbers, dot, underscore or hyphen)');
  if (new TextEncoder().encode(text).byteLength > 32_768) throw new Error('Flag value exceeds 32 KiB');
  let value: unknown; try { value = JSON.parse(text) as unknown; } catch { throw new Error('Flag value must be valid JSON'); }
  if (value === null) throw new Error('Null is not supported by the current API: it would become false');
  return { key, value, enabled };
}
export function publicDataUrl(service: DataDeskService, api: string, publicId: string, path?: string): string {
  if (!PUBLIC.test(publicId) || service === 'files' && (path === undefined || !validFilePath(path))) throw new Error('Invalid public resource');
  const url = new URL(api);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid API URL');
  return service === 'flags' ? `${url.origin}/flags/${publicId}` : `${url.origin}/files/${publicId}/${path!.split('/').map(encodeURIComponent).join('/')}`;
}
