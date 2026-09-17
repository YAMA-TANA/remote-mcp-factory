export type QrMetric = { value: string; scans: number };
export type QrAnalytics = {
  linkId: string;
  days: number;
  since: string;
  daily: QrMetric[];
  countries: QrMetric[];
  devices: QrMetric[];
  referrers: QrMetric[];
  total: number;
};

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const QR_DAYS = [7, 30, 90, 365] as const;
export type QrRange = typeof QR_DAYS[number];
export function validQrRange(value: number): value is QrRange { return QR_DAYS.some(days => days === value); }

function metricRows(value: unknown, key: string, limit: number): QrMetric[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Invalid QR ${key} analytics response.`);
  return value.map((entry: unknown) => {
    if (!isObject(entry) || typeof entry[key] !== 'string' || entry[key].length > 200
      || !Number.isSafeInteger(entry.scans) || Number(entry.scans) < 0) throw new Error(`Invalid QR ${key} analytics row.`);
    if (key === 'day' && !/^\d{4}-\d{2}-\d{2}$/.test(entry[key] as string)) throw new Error('Invalid QR analytics date.');
    return { value: entry[key] as string, scans: entry.scans as number };
  });
}

export function readQrAnalytics(payload: unknown, linkId: string, days: QrRange): QrAnalytics {
  if (!isObject(payload) || payload.linkId !== linkId || payload.days !== days
    || typeof payload.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.since)) throw new Error('Invalid QR analytics response.');
  const daily = metricRows(payload.daily, 'day', 365);
  const countries = metricRows(payload.countries, 'country', 50);
  const devices = metricRows(payload.devices, 'device', 10);
  const referrers = metricRows(payload.referrers, 'referrer', 50);
  const total = daily.reduce((sum, row) => sum + row.scans, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Invalid QR analytics total.');
  return { linkId, days, since: payload.since, daily, countries, devices, referrers, total };
}

function cell(value: unknown): string {
  const text = String(value ?? '').replace(/\0/g, '');
  const guarded = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Aggregate dimensions only. No visitor IPs, user agents or individual scan events. */
export function qrAnalyticsCsv(data: QrAnalytics): string {
  const rows: Array<[string, string, number]> = [
    ...data.daily.map(row => ['day', row.value, row.scans] as [string, string, number]),
    ...data.countries.map(row => ['country', row.value, row.scans] as [string, string, number]),
    ...data.devices.map(row => ['device', row.value, row.scans] as [string, string, number]),
    ...data.referrers.map(row => ['referrer', row.value, row.scans] as [string, string, number]),
  ];
  return `\uFEFF${[['dimension', 'value', 'scans'].map(cell).join(','), ...rows.map(row => row.map(cell).join(','))].join('\r\n')}\r\n`;
}

export function rssSettingsSnapshot(resource: Record<string, unknown>, includeSource: boolean): string {
  const nested = isObject(resource.selectors) ? resource.selectors : {};
  const selectorNames = ['item', 'title', 'link', 'content', 'date'] as const;
  const selectors = Object.fromEntries(selectorNames.map(part => {
    const key = `${part}Selector`;
    const value = resource[key] ?? nested[key] ?? resource[`${part}_selector`];
    return [key, typeof value === 'string' ? value.slice(0, 300) : ''];
  }));
  const source = resource.sourceUrl ?? resource.source_url;
  const feed = {
    name: typeof resource.name === 'string' ? resource.name.slice(0, 200) : '',
    enabled: resource.enabled !== false && resource.enabled !== 0 && resource.enabled !== '0',
    ...(includeSource && typeof source === 'string' ? { sourceUrl: source } : {}),
    selectors,
  };
  return `${JSON.stringify({ schema: 'picosvc.rss.settings.v1', feed }, null, 2)}\n`;
}
