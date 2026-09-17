export type ResourceExportService = 'license' | 'flags';

type Data = Record<string, unknown>;
type Definition = {
  path: (id: string) => string;
  listKey: string;
  filename: (id: string) => string;
  mime: string;
  serialize: (rows: Data[]) => string;
};

const obj = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const formula = /^[\s]*[=+\-@]/;
export function csvCell(value: unknown): string {
  let content = text(value);
  if (formula.test(content)) content = `'${content}`;
  return `"${content.replace(/"/g, '""')}"`;
}
function csv(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${headers.map(csvCell).join(',')}\r\n${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
function licenseCsv(rows: Data[]): string {
  return csv(['id', 'label', 'status', 'created_at', 'expires_at', 'revoked'], rows.map(row => {
    const revoked = row.revoked === true || row.revoked === 1 || row.revoked === '1';
    const expiry = text(row.expires_at ?? row.expiresAt);
    const expired = Boolean(expiry && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) <= Date.now());
    return [row.id, row.label, revoked ? 'revoked' : expired ? 'expired' : 'active', row.created_at ?? row.createdAt, expiry, revoked];
  }));
}
function flagsJson(rows: Data[]): string {
  const flags = rows.map(row => ({
    key: text(row.key),
    value: row.value,
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === '1',
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  })).sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify({ exportedAt: new Date().toISOString(), flags }, null, 2) + '\n';
}

export const RESOURCE_EXPORTS: Record<ResourceExportService, Definition> = {
  license: {
    path: id => `/api/picosvc/license/projects/${encodeURIComponent(id)}/keys`,
    listKey: 'keys', filename: id => `picosvc-license-${id}.csv`, mime: 'text/csv;charset=utf-8', serialize: licenseCsv,
  },
  flags: {
    path: id => `/api/picosvc/flags/projects/${encodeURIComponent(id)}/flags`,
    listKey: 'flags', filename: id => `picosvc-flags-${id}.json`, mime: 'application/json;charset=utf-8', serialize: flagsJson,
  },
};

export function readExportRows(service: ResourceExportService, payload: unknown): Data[] {
  const definition = RESOURCE_EXPORTS[service];
  const root = obj(payload);
  const list = root?.[definition.listKey];
  if (!Array.isArray(list)) throw new Error(`Missing ${definition.listKey} in export response.`);
  return list.map((entry, index) => {
    const row = obj(entry);
    if (!row) throw new Error(`Invalid ${definition.listKey} entry at ${index}.`);
    return row;
  });
}

export function serializeResourceExport(service: ResourceExportService, rows: Data[]): string {
  return RESOURCE_EXPORTS[service].serialize(rows);
}
