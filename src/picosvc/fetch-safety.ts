/** A missing or misleading Content-Type must not turn a binary download into metadata. */
export function appearsBinary(bytes: Uint8Array, contentType: string | null): boolean {
  // UTF-16 and UTF-32 text legitimately contain zero bytes. The decoder in
  // fetch-reliable.ts handles their explicit charset separately.
  if (/charset\s*=\s*["']?utf-(?:16|32)(?:le|be)?\b/i.test(contentType || '')) return false;
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 512));
  if (!sample.byteLength) return false;
  let controls = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0c && byte !== 0x0d) controls += 1;
  }
  return controls / sample.byteLength > 0.05;
}
