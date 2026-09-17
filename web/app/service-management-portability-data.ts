export type FormConfigurationSnapshot = {
  format: 'picosvc.forms.config.v1';
  exportedAt: string;
  settings: {
    allowedOrigins: string[];
    requiredFields: string[];
    honeypotField: string;
    requireTurnstile: boolean;
    webhookUrl?: string | null;
    successRedirect?: string | null;
  };
};

type Row = Record<string, unknown>;
const record = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const field = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

/** Export explicit configuration fields only; never copy form IDs, owner IDs or secret-bearing destinations by default. */
export function formConfigurationSnapshot(payload: unknown, includeDestinations = false, now = new Date()): FormConfigurationSnapshot {
  const source = record(payload);
  if (!source || !Array.isArray(source.allowedOrigins) || source.allowedOrigins.length > 20 ||
    source.allowedOrigins.some(v => typeof v !== 'string' || v.length > 2048) ||
    !Array.isArray(source.requiredFields) || source.requiredFields.length > 30 ||
    source.requiredFields.some(v => typeof v !== 'string' || !field.test(v)) ||
    typeof source.honeypotField !== 'string' || !field.test(source.honeypotField) ||
    typeof source.requireTurnstile !== 'boolean') throw new Error('Invalid Forms configuration response.');
  const settings: FormConfigurationSnapshot['settings'] = {
    allowedOrigins: [...source.allowedOrigins] as string[],
    requiredFields: [...source.requiredFields] as string[],
    honeypotField: source.honeypotField,
    requireTurnstile: source.requireTurnstile,
  };
  if (includeDestinations) {
    for (const key of ['webhookUrl', 'successRedirect'] as const) {
      const value = source[key];
      if (value !== null && value !== undefined && (typeof value !== 'string' || value.length > 4096)) throw new Error('Invalid Forms destination response.');
      settings[key] = typeof value === 'string' ? value : null;
    }
  }
  const snapshot: FormConfigurationSnapshot = { format: 'picosvc.forms.config.v1', exportedAt: now.toISOString(), settings };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 32 * 1024) throw new Error('Forms configuration exceeds the export size limit.');
  return snapshot;
}

function safeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value).replace(/\0/g, '');
  const escaped = /^[\s\uFEFF]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${escaped.replace(/"/g, '""')}"`;
}

/** Exactly the latest 50 returned events; redact message and every unrecognized API field. */
export function mcpEventCsv(payload: unknown): { csv: string; count: number } {
  const source = record(payload);
  if (!source || !Array.isArray(source.events) || source.events.length > 50 || source.events.some(event => !record(event))) {
    throw new Error('Invalid MCP events response.');
  }
  const columns = ['kind', 'status', 'http_status', 'duration_ms', 'created_at'] as const;
  const header = columns.join(',');
  const rows = source.events.map(event => columns.map(key => safeCsvCell((event as Row)[key])).join(','));
  return { csv: '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n', count: rows.length };
}
