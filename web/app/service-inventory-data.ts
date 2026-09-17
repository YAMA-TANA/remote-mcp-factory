import { csvCell } from './service-history-csv';

export const MAX_BACKUP_PAGES = 10;
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
export const FILE_INVENTORY_LIMIT = 500;
const MAX_DATA_BYTES = MAX_BACKUP_BYTES - 8192;
const encoder = new TextEncoder();

type Entry = Record<string, unknown>;
export type Backup = { content: string; count: number; pages: number; complete: boolean; nextCursor: string | null; bytes: number };
export type FileEntry = { path: string; contentType: string; sizeBytes: number; createdAt: string; updatedAt: string };
export type FileSort = 'recent' | 'path' | 'size';

function record(value: unknown): Entry | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Entry : null;
}

/** Fetch at most ten owner-authenticated 100-document pages. A partial export is explicitly marked. */
export async function collectJsonBackup(storeId: string, api: (path: string) => Promise<{ payload: unknown }>): Promise<Backup> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) throw new Error('Invalid JSON store ID.');
  const documents: Array<{ key: string; value: unknown; updatedAt: string }> = [];
  const seen = new Set<string>();
  let cursor = '';
  let pages = 0;
  let bytes = 0;
  let complete = false;
  for (let page = 0; page < MAX_BACKUP_PAGES; page += 1) {
    const path = `/api/picosvc/json/stores/${encodeURIComponent(storeId)}/export${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`;
    const response = record((await api(path)).payload);
    if (!response || response.storeId !== storeId || !Array.isArray(response.documents) || response.documents.length > 100) throw new Error('Invalid JSON export page.');
    if (response.nextCursor !== null && typeof response.nextCursor !== 'string') throw new Error('Invalid JSON export cursor.');
    const rows = response.documents;
    pages += 1;
    let lastKey = cursor;
    for (const item of rows) {
      const row = record(item);
      if (!row || typeof row.key !== 'string' || !/^[A-Za-z0-9._:@/-]{1,200}$/.test(row.key) || typeof row.updatedAt !== 'string' || !Object.prototype.hasOwnProperty.call(row, 'value') || row.key <= lastKey || seen.has(row.key)) throw new Error('Invalid or repeated JSON document.');
      const entry = { key: row.key, value: row.value, updatedAt: row.updatedAt };
      const serialized = JSON.stringify(entry);
      if (serialized === undefined) throw new Error('Invalid JSON document value.');
      const size = encoder.encode(serialized).byteLength + 1;
      if (bytes + size > MAX_DATA_BYTES) {
        if (!documents.length) throw new Error('JSON export exceeds the 8 MiB limit.');
        return makeBackup(storeId, documents, pages, false, lastKey, bytes);
      }
      documents.push(entry);
      seen.add(row.key);
      bytes += size;
      lastKey = row.key;
    }
    const next = response.nextCursor;
    if (next === null) { complete = true; cursor = ''; break; }
    if (!rows.length || next !== lastKey || next <= cursor) throw new Error('Invalid or non-advancing JSON export cursor.');
    cursor = next;
  }
  return makeBackup(storeId, documents, pages, complete, complete ? null : cursor, bytes);
}

function makeBackup(storeId: string, documents: Array<{ key: string; value: unknown; updatedAt: string }>, pages: number, complete: boolean, nextCursor: string | null, bytes: number): Backup {
  const content = JSON.stringify({ format: 'picosvc-json-backup-v1', storeId, exportedAt: new Date().toISOString(), complete, nextCursor, pages, documents }, null, 2);
  const actualBytes = encoder.encode(content).byteLength;
  // Pretty printing expands the JSON. Never silently exceed the advertised byte limit.
  if (actualBytes > MAX_BACKUP_BYTES) throw new Error('JSON backup is too large. Download individual pages instead.');
  return { content, count: documents.length, pages, complete, nextCursor, bytes: actualBytes };
}

/** The Files API returns at most 500 recent objects; never describe this as a full-space inventory. */
export function readFileInventory(payload: unknown): FileEntry[] {
  const response = record(payload);
  if (!response || !Array.isArray(response.objects) || response.objects.length > FILE_INVENTORY_LIMIT) throw new Error('Invalid Files inventory response.');
  return response.objects.map(value => {
    const row = record(value);
    if (!row || typeof row.path !== 'string' || !row.path || typeof row.content_type !== 'string' || typeof row.size_bytes !== 'number' || !Number.isFinite(row.size_bytes) || row.size_bytes < 0 || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') throw new Error('Invalid Files inventory entry.');
    return { path: row.path, contentType: row.content_type, sizeBytes: row.size_bytes, createdAt: row.created_at, updatedAt: row.updated_at };
  });
}

export function filterFileInventory(rows: readonly FileEntry[], query: string, sort: FileSort): FileEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => !needle || row.path.toLocaleLowerCase().includes(needle) || row.contentType.toLocaleLowerCase().includes(needle));
  return filtered.sort((a, b) => sort === 'path' ? a.path.localeCompare(b.path) : sort === 'size' ? b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path) : b.updatedAt.localeCompare(a.updatedAt) || a.path.localeCompare(b.path));
}

export function fileInventoryCsv(rows: readonly FileEntry[]): string {
  const header = ['path', 'content_type', 'size_bytes', 'created_at', 'updated_at'];
  return `\uFEFF${[header.map(csvCell).join(','), ...rows.map(row => [row.path, row.contentType, row.sizeBytes, row.createdAt, row.updatedAt].map(csvCell).join(','))].join('\r\n')}\r\n`;
}
