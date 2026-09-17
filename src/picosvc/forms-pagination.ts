const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SUBMISSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Cursor = { timestamp: string; id: string };

function validTimestamp(value: string): boolean {
  if (!TIMESTAMP.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

/** null = first page, undefined = invalid. Plain timestamp cursors remain supported. */
export function parseFormCursor(raw: string | null): Cursor | null | undefined {
  if (raw === null) return null;
  const separator = raw.indexOf('~');
  if (separator === -1) return validTimestamp(raw) ? { timestamp: raw, id: '' } : undefined;
  const timestamp = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  return validTimestamp(timestamp) && SUBMISSION_ID.test(id) ? { timestamp, id: id.toLowerCase() } : undefined;
}

export function formCursor(row: { received_at: string; id: string }): string {
  return `${row.received_at}~${row.id}`;
}

/** SQL LIKE must use an explicit ESCAPE clause for these to be literal. */
export function escapeFormSearch(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
