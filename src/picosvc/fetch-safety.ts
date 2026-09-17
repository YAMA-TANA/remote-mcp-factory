import { readBoundedResponse, ResponseLimitError } from './bounded-response.js';

/** User-controlled request bodies should never be buffered without a hard ceiling. */
export const MAX_FETCH_REQUEST_BYTES = 16 * 1024;

type FetchJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; code: 'request_too_large' | 'invalid_request'; message: string; status: 400 | 413 };

export async function readFetchJson(request: Request): Promise<FetchJsonResult> {
  try {
    const bytes = await readBoundedResponse(request, MAX_FETCH_REQUEST_BYTES, request.signal);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof ResponseLimitError) {
      return {
        ok: false,
        code: 'request_too_large',
        message: 'Fetch request body exceeds the 16 KiB limit.',
        status: 413,
      };
    }
    return { ok: false, code: 'invalid_request', message: 'A valid JSON request body is required.', status: 400 };
  }
}

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
