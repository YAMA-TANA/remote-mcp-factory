import type { Env } from './types.js';

export type BridgeOperation = 'probe' | 'transcode';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signingKey(env: Env): Promise<CryptoKey> {
  if (!env.BRIDGE_SIGNING_KEY) throw new Error('BRIDGE_SIGNING_KEY is not configured');
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.BRIDGE_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function tokenPayload(serverId: string, bundleHash: string, operation: BridgeOperation): string {
  return `v2:${serverId}:${bundleHash}:${operation}`;
}

export async function createBridgeToken(
  env: Env,
  serverId: string,
  bundleHash: string,
  operation: BridgeOperation,
): Promise<string> {
  const key = await signingKey(env);
  const payload = tokenPayload(serverId, bundleHash, operation);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return base64Url(signature);
}

export async function verifyBridgeToken(
  env: Env,
  token: string,
  serverId: string,
  bundleHash: string,
  operation: BridgeOperation,
): Promise<boolean> {
  if (!token || !env.BRIDGE_SIGNING_KEY) return false;
  const expected = await createBridgeToken(env, serverId, bundleHash, operation);
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
