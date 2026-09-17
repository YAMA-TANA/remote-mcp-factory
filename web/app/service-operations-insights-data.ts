import type { HistoryService } from './service-history-csv';

type Entry = Record<string, unknown>;
type Outcome = 'positive' | 'negative' | 'waiting' | 'other';
export type DailyObservation = { day: string; count: number };
export type OperationsSummary = {
  total: number;
  positive: number;
  negative: number;
  waiting: number;
  other: number;
  meanDurationMs: number | null;
  measuredDurations: number;
  notificationFailures: number;
  notificationAttempts: number;
  latestAt: string | null;
  daily: DailyObservation[];
};

function httpStatus(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function outcome(service: HistoryService, row: Entry): Outcome {
  if (service === 'mail') {
    switch (row.delivery_status ?? row.deliveryStatus) {
      case 'delivered': return 'positive';
      case 'failed':
      case 'quota_reached': return 'negative';
      case 'pending':
      case 'retry':
      case 'sending': return 'waiting';
      default: return 'other';
    }
  }
  if (service === 'monitor') {
    if (row.event_type === 'change') return 'positive';
    if (row.event_type === 'fetch_error') return 'negative';
    return 'other';
  }
  const error = row.error;
  if (error !== null && error !== undefined && error !== '') return 'negative';
  const status = httpStatus(service === 'cron' ? row.response_status : row.status_code);
  if (status === null) return 'other';
  // Cron considers a configured expected status (including a non-2xx status) successful
  // when its backend error field is empty. Functions use standard HTTP outcome ranges.
  if (service === 'cron') return 'positive';
  if (status >= 400) return 'negative';
  return status >= 200 ? 'positive' : 'waiting';
}

function timestamp(service: HistoryService, row: Entry): string | null {
  const raw = service === 'cron' ? row.ran_at
    : service === 'mail' ? row.received_at ?? row.receivedAt
    : service === 'functions' ? row.occurred_at : row.created_at;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/** A recent-record sample, never an all-time reliability or uptime measurement. */
export function summarizeRecentHistory(service: HistoryService, rows: readonly Entry[], now = new Date()): OperationsSummary {
  const summary: OperationsSummary = {
    total: rows.length, positive: 0, negative: 0, waiting: 0, other: 0,
    meanDurationMs: null, measuredDurations: 0, notificationFailures: 0,
    notificationAttempts: 0, latestAt: null, daily: [],
  };
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: 7 }, (_, index) => new Date(today - (6 - index) * 86_400_000).toISOString().slice(0, 10));
  const counts = new Map(days.map(day => [day, 0]));
  let durationSum = 0;
  for (const row of rows) {
    const classification = outcome(service, row);
    summary[classification] += 1;
    const at = timestamp(service, row);
    if (at) {
      if (!summary.latestAt || at > summary.latestAt) summary.latestAt = at;
      const day = at.slice(0, 10);
      if (counts.has(day)) counts.set(day, (counts.get(day) || 0) + 1);
    }
    // Pending Cron rows are created with duration_ms=0 before execution completes.
    // Do not let those placeholder zeros dilute the measured duration average.
    if ((service === 'cron' || service === 'functions') && (classification === 'positive' || classification === 'negative')) {
      const raw = row.duration_ms;
      const duration = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
      if (Number.isFinite(duration) && duration >= 0 && duration <= 3_600_000) {
        durationSum += duration;
        summary.measuredDurations += 1;
      }
    }
    if (service === 'monitor') {
      const status = httpStatus(row.webhook_status);
      const failed = Boolean(row.webhook_error) || (status !== null && status >= 400);
      if (status !== null || row.webhook_error) {
        summary.notificationAttempts += 1;
        if (failed) summary.notificationFailures += 1;
      }
    }
  }
  summary.meanDurationMs = summary.measuredDurations ? Math.round(durationSum / summary.measuredDurations) : null;
  summary.daily = days.map(day => ({ day, count: counts.get(day) || 0 }));
  return summary;
}
