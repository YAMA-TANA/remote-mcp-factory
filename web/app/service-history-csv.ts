export type HistoryService = 'cron' | 'mail' | 'functions' | 'monitor';

type Entry = Record<string, unknown>;
type Column = { header: string; keys: readonly string[] };
type Definition = { path: (id: string) => string; listKey: string; limit: number; columns: readonly Column[] };

// Allowlist only the operational fields needed for troubleshooting. Never export
// request bodies, message MIME, webhook headers, function source, or secrets.
export const HISTORY_DEFINITIONS: Record<HistoryService, Definition> = {
  cron: {
    path: id => `/api/picosvc/cron/jobs/${encodeURIComponent(id)}/runs`, listKey: 'runs', limit: 100,
    columns: [
      { header: 'ran_at', keys: ['ran_at'] },
      { header: 'http_status', keys: ['response_status'] },
      { header: 'duration_ms', keys: ['duration_ms'] },
      { header: 'failed', keys: ['error'] },
    ],
  },
  mail: {
    path: id => `/api/picosvc/mail/routes/${encodeURIComponent(id)}/events`, listKey: 'events', limit: 200,
    columns: [
      { header: 'received_at', keys: ['received_at', 'receivedAt'] },
      { header: 'delivery_status', keys: ['delivery_status', 'deliveryStatus'] },
      { header: 'from_address', keys: ['from_address', 'fromAddress'] },
      { header: 'to_address', keys: ['to_address', 'toAddress'] },
      { header: 'subject', keys: ['subject'] },
      { header: 'raw_size', keys: ['raw_size', 'rawSize'] },
    ],
  },
  functions: {
    path: id => `/api/picosvc/functions/apps/${encodeURIComponent(id)}/logs`, listKey: 'logs', limit: 200,
    columns: [
      { header: 'occurred_at', keys: ['occurred_at'] },
      { header: 'method', keys: ['method'] },
      { header: 'http_status', keys: ['status_code'] },
      { header: 'duration_ms', keys: ['duration_ms'] },
      { header: 'revision', keys: ['revision_no'] },
    ],
  },
  monitor: {
    path: id => `/api/picosvc/monitor/${encodeURIComponent(id)}/events`, listKey: 'events', limit: 100,
    columns: [
      { header: 'created_at', keys: ['created_at'] },
      { header: 'event_type', keys: ['event_type'] },
      { header: 'webhook_status', keys: ['webhook_status'] },
    ],
  },
};

export function readHistoryRows(service: HistoryService, payload: unknown): Entry[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid history response.');
  const definition = HISTORY_DEFINITIONS[service];
  const entries = (payload as Entry)[definition.listKey];
  if (!Array.isArray(entries)) throw new Error(`Missing ${definition.listKey} in history response.`);
  if (entries.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid history entry.');
  // Never represent a partial page as an exhaustive export.
  return (entries as Entry[]).slice(0, definition.limit);
}

export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Excel and similar spreadsheet apps may evaluate formula-looking CSV cells.
  // Prefix an apostrophe even when whitespace precedes the formula operator.
  const safe = /^[\s\uFEFF]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/\0/g, '').replace(/"/g, '""')}"`;
}

export function historyToCsv(service: HistoryService, rows: readonly Entry[]): string {
  const columns = HISTORY_DEFINITIONS[service].columns;
  const lines = [columns.map(column => csvCell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map(column => {
      const value = column.keys.map(key => row[key]).find(item => item !== undefined && item !== null);
      // An error can include arbitrary upstream details; export only a boolean.
      return csvCell(column.header === 'failed' ? Boolean(value) : value);
    }).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
