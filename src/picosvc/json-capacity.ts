import type { Env } from '../types.js';
import { productLimit } from './entitlements.js';
import { json } from './service-utils.js';

const MAX_JSON_BYTES = 256 * 1024;

/** One indexed counter lookup replaces a full scan of all the owner's documents. */
export async function checkJsonWriteCapacity(
  request: Request,
  env: Env,
  owner: string,
  storeId: string,
  key: string,
): Promise<Response | null> {
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    return json({ error: 'JSON document is limited to 256 KiB' }, 413);
  }
  let valueJson: string;
  try {
    // Limit the streamed body before buffering or parsing it. The real runtime
    // will separately validate malformed JSON and will consume its own body.
    const reader = request.clone().body?.getReader();
    if (!reader) return null;
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_JSON_BYTES) {
          await reader.cancel().catch(() => undefined);
          return json({ error: 'JSON document is limited to 256 KiB' }, 413);
        }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    valueJson = JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return null; } // Let the JSON runtime report malformed JSON.
  const valueBytes = new TextEncoder().encode(valueJson).byteLength;
  if (valueBytes > MAX_JSON_BYTES) return json({ error: 'JSON document is limited to 256 KiB' }, 413);

  const [documentPlan, storagePlan, total, existing] = await Promise.all([
    productLimit(env, owner, 'json', 'documents'),
    productLimit(env, owner, 'json', 'storageBytes'),
    env.DB.prepare('SELECT documents, storage_bytes FROM picosvc_json_totals WHERE owner=?')
      .bind(owner).first<{ documents: number; storage_bytes: number }>(),
    env.DB.prepare('SELECT LENGTH(CAST(value_json AS BLOB)) AS bytes FROM json_documents WHERE store_id=? AND key=?')
      .bind(storeId, key).first<{ bytes: number }>(),
  ]);
  if (!total) throw new Error('JSON capacity counters are not initialized; apply migration 0099');

  // Publish the current entitlement to SQLite triggers. The subsequent document
  // INSERT/UPDATE is checked in the same statement by BEFORE triggers, closing
  // concurrent-PUT races that an application-only precheck cannot prevent.
  await env.DB.prepare(`
    UPDATE picosvc_json_totals SET document_limit=?, byte_limit=? WHERE owner=?
  `).bind(documentPlan.limit, storagePlan.limit, owner).run();

  const documents = Number(total.documents);
  const bytes = Number(total.storage_bytes);
  if (documentPlan.limit !== null && documents + (existing ? 0 : 1) > documentPlan.limit) {
    return json({ error: 'JSON document limit reached', tier: documentPlan.tier, limit: documentPlan.limit, used: documents }, 402);
  }
  if (storagePlan.limit !== null && bytes - Number(existing?.bytes || 0) + valueBytes > storagePlan.limit) {
    return json({ error: 'JSON storage limit reached', tier: storagePlan.tier, limit: storagePlan.limit, used: bytes }, 402);
  }
  return null;
}
