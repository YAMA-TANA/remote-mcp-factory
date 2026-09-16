export class ResponseLimitError extends Error {
  constructor() { super('Response body exceeds the configured size limit'); this.name = 'ResponseLimitError'; }
}

/** Read at most maxBytes, even when upstream omits or lies about Content-Length. */
export async function readBoundedResponse(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
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
