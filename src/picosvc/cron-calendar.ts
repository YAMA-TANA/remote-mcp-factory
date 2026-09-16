const BOUNDS: Array<[number, number]> = [[0,59],[0,23],[1,31],[1,12],[0,7]];

function atomValid(atom: string, min: number, max: number): boolean {
  if (atom === '*') return true;
  const step = atom.match(/^\*\/(\d+)$/);
  if (step) return Number(step[1]) >= 1 && Number(step[1]) <= max - min + 1;
  const range = atom.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
  if (range) {
    const start = Number(range[1]); const end = Number(range[2]); const stride = Number(range[3] || 1);
    return start >= min && end <= max && start <= end && stride >= 1 && stride <= max - min + 1;
  }
  return /^\d+$/.test(atom) && Number(atom) >= min && Number(atom) <= max;
}

export function validCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  return fields.length === 5 && fields.every((field, i) => field.length <= 80 && field.split(',').every((atom) => atomValid(atom, ...BOUNDS[i])));
}

export function validTimezone(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 80) return null;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone; }
  catch { return null; }
}

function matchesField(expression: string, value: number, min: number, max: number, dayOfWeek = false): boolean {
  return expression.split(',').some((atom) => {
    if (atom === '*') return true;
    const step = atom.match(/^\*\/(\d+)$/);
    if (step) return (value - min) % Number(step[1]) === 0;
    const range = atom.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (range) {
      const start = Number(range[1]); const end = Number(range[2]); const stride = Number(range[3] || 1);
      // Sunday accepts both 0 and 7; preserve 0-6 and 1-7 range meanings.
      const candidates = dayOfWeek && value === 0 ? [0, 7] : [value];
      return candidates.some((candidate) => candidate >= start && candidate <= end && (candidate - start) % stride === 0);
    }
    if (/^\d+$/.test(atom)) return Number(atom) === value || (dayOfWeek && value === 0 && Number(atom) === 7);
    return false;
  });
}

export function cronMatchesInTimezone(expression: string, date: Date, timezone: string): boolean {
  if (!validCronExpression(expression) || !validTimezone(timezone) || !Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, minute: '2-digit', hour: '2-digit', hourCycle: 'h23', day: '2-digit', month: '2-digit', weekday: 'short',
  }).formatToParts(date);
  const get = (name: string) => parts.find((part) => part.type === name)?.value || '';
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  if (weekday < 0) return false;
  const numbers = [Number(get('minute')), Number(get('hour')), Number(get('day')), Number(get('month')), weekday];
  const fields = expression.trim().split(/\s+/);
  // Preserve the legacy scheduler's five-field AND semantics for day-of-month and weekday.
  return fields.every((field, index) => matchesField(field, numbers[index], ...BOUNDS[index], index === 4));
}
