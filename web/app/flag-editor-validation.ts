export const FLAG_KEY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
export const MAX_FLAG_VALUE_BYTES = 64 * 1024;

/** Keep the editor in sync with the management API's key format. */
export function parseFlagDraft(key: string, source: string): { key: string; value: unknown } {
  if (!FLAG_KEY_PATTERN.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) {
    throw new Error('Flag keys must contain 1–100 letters, digits, dots, underscores or hyphens and cannot be reserved names.');
  }
  let value: unknown;
  try { value = JSON.parse(source) as unknown; }
  catch { throw new Error('Enter a valid JSON value (for example true, "hello", 3, null, or an object).'); }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_FLAG_VALUE_BYTES) {
    throw new Error('Flag values must be at most 64 KiB in UTF-8.');
  }
  return { key, value };
}
