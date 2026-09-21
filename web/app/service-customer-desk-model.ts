export type CustomerDeskService = 'forms' | 'license';
export type CustomerDeskItem = { id: string; name: string; publicId: string; enabled: boolean; updatedAt: string | null };
export type FormSettings = { allowedOrigins: string[]; requiredFields: string[]; honeypotField: string; requireTurnstile: boolean; webhookUrl: string | null; successRedirect: string | null };
export type FormSubmission = { id: string; receivedAt: string | null };
export type FormDelivery = { id: string; at: string | null; status: number | null; delivered: boolean };
export type LicenseEntry = { id: string; label: string; revoked: boolean; expiresAt: string | null; expired: boolean; createdAt: string | null };
export type ValidationEntry = { id: string; valid: boolean; reason: string; at: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC = /^[0-9a-f]{32}$/i;
const FIELD = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const REASONS = new Set(['valid', 'revoked', 'expired', 'not_found', 'device_id_required', 'activation_limit_reached']);
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const timestamp = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const boolean = (value: unknown): boolean => { if (![true, false, 0, 1].includes(value as boolean)) throw new Error('Invalid status'); return Boolean(value); };
const id = (value: unknown): string => { if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Invalid resource ID'); return value; };
const list = (value: unknown, key: string, max = 500): unknown[] => { const input = object(value)?.[key]; if (!Array.isArray(input) || input.length > max) throw new Error('Invalid response'); return input; };
const safeText = (value: unknown, max = 200): string => typeof value === 'string' ? value.slice(0, max) : '';
export function deskPaths(service: CustomerDeskService, resourceId?: string, childId?: string) {
  const listPath = service === 'forms' ? '/api/picosvc/forms' : '/api/picosvc/license/projects';
  if (!resourceId) return { list: listPath, config: '', search: '', deliveries: '', keys: '', item: '', validations: '', activations: '' };
  const safeId = id(resourceId);
  const root = service === 'forms' ? `${listPath}/${safeId}` : `${listPath}/${safeId}`;
  const key = childId ? id(childId) : null;
  return { list: listPath, config: `${root}/config`, search: `${root}/search`, deliveries: `${root}/deliveries`, keys: `${root}/keys`, item: key ? `/api/picosvc/license/keys/${key}` : root, validations: key ? `/api/picosvc/license/keys/${key}/validations` : '', activations: key ? `/api/picosvc/license/keys/${key}/activations` : '' };
}
/** Allowlist projections: never retain form payloads, headers, webhook destination, license value, metadata or device hashes in event/key lists. */
export function parseDeskItems(raw: unknown, service: CustomerDeskService): CustomerDeskItem[] {
  const seen = new Set<string>();
  return list(raw, service === 'forms' ? 'forms' : 'projects').map(value => {
    const row = object(value); if (!row) throw new Error('Invalid resource');
    const resourceId = id(row.id);
    if (seen.has(resourceId) || typeof row.public_id !== 'string' || !PUBLIC.test(row.public_id) || typeof row.name !== 'string' || !row.name.trim()) throw new Error('Invalid or duplicate resource');
    seen.add(resourceId);
    return { id: resourceId, publicId: row.public_id.toLowerCase(), name: row.name.slice(0, 200), enabled: service === 'forms' ? boolean(row.enabled) : true, updatedAt: timestamp(row.updated_at) };
  });
}
export function filterDeskItems(items: CustomerDeskItem[], query: string, state: 'all'|'enabled'|'paused'): CustomerDeskItem[] {
  const term = query.trim().toLocaleLowerCase().slice(0, 100);
  return items.filter(item => (state === 'all' || item.enabled === (state === 'enabled')) && item.name.toLocaleLowerCase().includes(term));
}
export function parseFormSettings(raw: unknown): FormSettings {
  const row = object(raw);
  if (!row || !Array.isArray(row.allowedOrigins) || row.allowedOrigins.length > 20 || !Array.isArray(row.requiredFields) || row.requiredFields.length > 30) throw new Error('Invalid form settings');
  if (row.allowedOrigins.some(value => typeof value !== 'string') || row.requiredFields.some(value => typeof value !== 'string') || typeof row.honeypotField !== 'string' || typeof row.requireTurnstile !== 'boolean') throw new Error('Invalid form settings');
  return { allowedOrigins: row.allowedOrigins as string[], requiredFields: row.requiredFields as string[], honeypotField: row.honeypotField, requireTurnstile: row.requireTurnstile, webhookUrl: typeof row.webhookUrl === 'string' ? row.webhookUrl : null, successRedirect: typeof row.successRedirect === 'string' ? row.successRedirect : null };
}
export function prepareFormSettings(input: FormSettings): FormSettings {
  const origins = input.allowedOrigins.map(value => value.trim()).filter(Boolean);
  const fields = input.requiredFields.map(value => value.trim()).filter(Boolean);
  if (origins.length > 20 || fields.length > 30 || !FIELD.test(input.honeypotField) || fields.some(value => !FIELD.test(value))) throw new Error('Invalid form field settings');
  if (origins.some(value => { try { const url = new URL(value); return url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.pathname !== '/' || Boolean(url.search || url.hash) || url.origin !== value; } catch { return true; } })) throw new Error('Origins must be exact HTTPS origins');
  return { ...input, allowedOrigins: [...new Set(origins)], requiredFields: [...new Set(fields)] };
}
export function parseFormSubmissions(raw: unknown): { entries: FormSubmission[]; nextBefore: string | null } {
  const rows = list(raw, 'submissions', 100);
  return { entries: rows.map(value => { const row = object(value); if (!row) throw new Error('Invalid submission'); return { id: id(row.id), receivedAt: timestamp(row.receivedAt) }; }), nextBefore: timestamp(object(raw)?.nextBefore) };
}
export function parseFormDeliveries(raw: unknown): FormDelivery[] {
  return list(raw, 'deliveries', 100).map(value => { const row = object(value); if (!row) throw new Error('Invalid delivery'); const code = typeof row.response_status === 'number' && Number.isInteger(row.response_status) && row.response_status >= 100 && row.response_status <= 599 ? row.response_status : null; return { id: id(row.id), at: timestamp(row.delivered_at), status: code, delivered: code !== null && code >= 200 && code < 300 }; });
}
export function parseLicenseKeys(raw: unknown, now = Date.now()): LicenseEntry[] {
  return list(raw, 'keys').map(value => { const row = object(value); if (!row) throw new Error('Invalid license'); const expiresAt = timestamp(row.expires_at); return { id: id(row.id), label: safeText(row.label, 120) || '—', revoked: boolean(row.revoked), expiresAt, expired: expiresAt !== null && Date.parse(expiresAt) <= now, createdAt: timestamp(row.created_at) }; });
}
export function parseValidations(raw: unknown): ValidationEntry[] {
  return list(raw, 'validations', 100).map((value, index) => { const row = object(value); if (!row) throw new Error('Invalid validation'); return { id: `validation-${index}`, valid: boolean(row.valid), reason: typeof row.reason === 'string' && REASONS.has(row.reason) ? row.reason : 'other', at: timestamp(row.checked_at) }; });
}
export function parseActivationCount(raw: unknown): number { return list(raw, 'activations', 100).length; }
export function publicFormEndpoint(api: string, item: CustomerDeskItem): string {
  const url = new URL(api);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) throw new Error('Invalid API origin');
  if (url.username || url.password) throw new Error('Invalid API origin');
  return `${url.origin}/forms/${item.publicId}`;
}
