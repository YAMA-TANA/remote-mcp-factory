export type Data = Record<string, unknown>;

export function formConfigSnapshot(raw: Data) {
  const allowedOrigins = Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins.filter(v => typeof v === 'string') : [];
  const requiredFields = Array.isArray(raw.requiredFields) ? raw.requiredFields.filter(v => typeof v === 'string') : [];
  return {
    format: 'picosvc.forms.config.v1',
    allowedOrigins,
    requiredFields,
    honeypotField: typeof raw.honeypotField === 'string' ? raw.honeypotField : '_website',
    successRedirect: typeof raw.successRedirect === 'string' && raw.successRedirect ? raw.successRedirect : null,
    requireTurnstile: raw.requireTurnstile === true,
    webhookConfigured: typeof raw.webhookUrl === 'string' && raw.webhookUrl.length > 0,
    // Deliberately omit webhookUrl: delivery destinations can contain sensitive routing information.
  };
}

function revoked(row: Data): boolean { return row.revoked === true || row.revoked === 1 || row.revoked === '1'; }
export function licenseExpirySummary(rows: readonly Data[], now = new Date()) {
  const current = now.getTime();
  let active = 0, revokedCount = 0, expired = 0, within7Days = 0, within30Days = 0, noExpiry = 0;
  let nextExpiry: string | null = null;
  for (const row of rows) {
    if (revoked(row)) { revokedCount += 1; continue; }
    const raw = row.expires_at ?? row.expiresAt;
    if (!raw) { active += 1; noExpiry += 1; continue; }
    const time = Date.parse(String(raw));
    if (!Number.isFinite(time)) { active += 1; continue; }
    if (time <= current) { expired += 1; continue; }
    active += 1;
    const distance = time - current;
    if (distance <= 7 * 86_400_000) within7Days += 1;
    if (distance <= 30 * 86_400_000) within30Days += 1;
    const iso = new Date(time).toISOString();
    if (!nextExpiry || iso < nextExpiry) nextExpiry = iso;
  }
  return { total: rows.length, active, revoked: revokedCount, expired, within7Days, within30Days, noExpiry, nextExpiry };
}

export function enabledFlagsPayload(rows: readonly Data[]) {
  const flags: Record<string, unknown> = {};
  for (const row of rows) {
    const enabled = row.enabled === true || row.enabled === 1 || row.enabled === '1';
    const key = typeof row.key === 'string' ? row.key : '';
    if (!enabled || !key || !Object.prototype.hasOwnProperty.call(row, 'value')) continue;
    flags[key] = row.value;
  }
  return { flags };
}

export function safeJsonDownload(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
