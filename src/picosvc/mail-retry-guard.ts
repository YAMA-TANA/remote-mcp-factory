import type { Env } from '../types.js';
import { json, requireIdentity } from './service-utils.js';

const MAX_MAIL_ATTEMPTS = 4;

export async function mailManualRetryGuard(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const match = new URL(request.url).pathname.match(/^\/api\/picosvc\/mail\/events\/([0-9a-f-]{36})\/retry$/i);
  if (!match) return null;
  const identity = await requireIdentity(request, env);
  if (identity instanceof Response) return identity;
  const event = await env.DB.prepare('SELECT attempts,delivery_status,payload_r2_key FROM mail_events WHERE id=? AND owner=?')
    .bind(match[1], identity.ownerId).first<{ attempts: number; delivery_status: string; payload_r2_key: string | null }>();
  if (!event) return json({ error: 'Mail event not found' }, 404);
  if (!event.payload_r2_key || event.delivery_status === 'delivered' || event.delivery_status === 'sending') {
    return json({ error: 'Mail event cannot be retried' }, 409);
  }
  if (event.attempts >= MAX_MAIL_ATTEMPTS) {
    return json({ error: 'Mail delivery attempt limit reached', attempts: event.attempts, limit: MAX_MAIL_ATTEMPTS }, 429);
  }
  return null;
}
