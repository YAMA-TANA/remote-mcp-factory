export class ResponseLimitError extends Error {
  constructor() { super('Response body exceeds the configured size limit'); this.name = 'ResponseLimitError'; }
}

/** Read at most maxBytes, even when upstream omits or lies about Content-Length. */
export async function readBoundedResponse(response: Pick<Response, 'body' | 'headers'>, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be a positive integer');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new ResponseLimitError();
  }
  if (signal?.aborted) throw new DOMException('Request timed out', 'AbortError');
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Request timed out', 'AbortError');
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new DOMException('Request timed out', 'AbortError');
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new ResponseLimitError();
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return joined;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

/** User-controlled Fetch input must be bounded before JSON parsing or quota work. */
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
