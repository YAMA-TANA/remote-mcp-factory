export type WorkspaceResource = Record<string, unknown>;

export function workspaceObject(value: unknown): WorkspaceResource | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as WorkspaceResource : null;
}

export function workspaceString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/** Older endpoints return error: string; newer endpoints return error: {code,message}. */
export function workspaceApiError(payload: unknown, status: number, requestId?: string | null): string {
  const record = workspaceObject(payload);
  const nested = workspaceObject(record?.error);
  const message = [nested?.message, typeof record?.error === 'string' ? record.error : null, record?.message]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined;
  const code = typeof nested?.code === 'string' ? nested.code : typeof record?.code === 'string' ? record.code : '';
  const detail = typeof record?.detail === 'string' ? record.detail : '';
  const id = requestId || (typeof record?.requestId === 'string' ? record.requestId : '');
  const human = message || (typeof payload === 'string' && payload.trim() ? payload.slice(0, 250) : `Request failed (HTTP ${status})`);
  return `${human}${detail && detail !== human ? ` — ${detail.slice(0, 180)}` : ''}${code ? ` [${code}]` : ''} (HTTP ${status})${id ? ` · Request ID: ${id}` : ''}`;
}

export function workspaceIsSecret(key: string): boolean {
  return /(?:token|secret|password|private[_-]?key|api[_-]?key|license[_-]?key|credential)/i.test(key);
}

export function workspaceIsActive(resource: WorkspaceResource): boolean {
  const enabled = resource.enabled;
  return enabled !== false && enabled !== 0 && enabled !== '0'
    && !['error', 'failed', 'disabled', 'paused', 'inactive'].includes(workspaceString(resource.status).toLowerCase());
}

/** Search only identifiers and descriptive fields; never index credentials or request bodies. */
export function workspaceMatches(resource: WorkspaceResource, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || Object.entries(resource).some(([key, value]) =>
    !/(?:token|secret|password|hash|headers|body|code|metadata|payload|credential)/i.test(key)
    && (typeof value === 'string' || typeof value === 'number')
    && String(value).toLocaleLowerCase().includes(normalized));
}
