const MAX_CAPTURE = 16_000;
export function validStripPattern(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 128) return null;
  // A deliberately small regex subset: no repetitions, groups, assertions or backreferences.
  if (/[+*{}()|]/.test(value) || /\\[1-9]/.test(value) || /\(\?/.test(value)) return null;
  try { new RegExp(value, 'gu'); return value; } catch { return null; }
}
export function normalizeMonitorText(input: string, stripPattern: string | null): string {
  let text = input.slice(0, MAX_CAPTURE).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (stripPattern) {
    if (!validStripPattern(stripPattern)) throw new Error('Invalid monitor strip pattern');
    text = text.replace(new RegExp(stripPattern, 'gu'), '').replace(/\s+/g, ' ').trim();
  }
  return text;
}
export function readableMonitorDiff(before: string, after: string): string {
  const a = before.slice(0, MAX_CAPTURE); const b = after.slice(0, MAX_CAPTURE);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let aEnd = a.length; let bEnd = b.length;
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) { aEnd--; bEnd--; }
  const contextStart = Math.max(0, start - 80);
  const beforeSnippet = a.slice(contextStart, Math.min(a.length, aEnd + 80));
  const afterSnippet = b.slice(contextStart, Math.min(b.length, bEnd + 80));
  return `Before: ${beforeSnippet || '(empty)'}\nAfter: ${afterSnippet || '(empty)'}`.slice(0, 1_024);
}
