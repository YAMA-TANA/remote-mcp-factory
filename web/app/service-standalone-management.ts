export type MockSummary = { id: string; name: string; method: string; path: string; statusCode: number; contentType: string; enabled: boolean; updatedAt: string };
export type HookSummary = { id: string; method: string; path: string; contentType: string | null; sizeBytes: number; receivedAt: string };

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Spreadsheet software can execute formulas even with leading whitespace.
  const safe = /^[\s\uFEFF]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/\0/g, '').replace(/"/g, '""')}"`;
}
/** Export only operational metadata, never mock response bodies/headers or webhook request payloads. */
function csv(columns: readonly string[], rows: readonly unknown[][]): string {
  return `\uFEFF${[columns.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n')}\r\n`;
}
export function mockInventoryCsv(items: readonly MockSummary[]): string {
  return csv(['id', 'name', 'method', 'path', 'status_code', 'content_type', 'enabled', 'updated_at'], items.map(item => [item.id, item.name, item.method, item.path, item.statusCode, item.contentType, item.enabled, item.updatedAt]));
}
export function hookInventoryCsv(items: readonly HookSummary[]): string {
  return csv(['id', 'method', 'path', 'content_type', 'size_bytes', 'received_at'], items.map(item => [item.id, item.method, item.path, item.contentType, item.sizeBytes, item.receivedAt]));
}
export function filterMockInventory<T extends MockSummary>(items: readonly T[], query: string, method: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(item => (method === 'all' || item.method === method) && (!needle || `${item.name}\n${item.path}\n${item.contentType}`.toLocaleLowerCase().includes(needle)));
}
export function filterHookInventory<T extends HookSummary>(items: readonly T[], query: string, method: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(item => (method === 'all' || item.method === method) && (!needle || `${item.path}\n${item.contentType || ''}`.toLocaleLowerCase().includes(needle)));
}
export function validReplayDestination(value: string): boolean {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch { return false; }
}
/** Revoke the transient blob URL even if the click itself fails. */
export function downloadManagementCsv(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  try { document.body.append(link); link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
