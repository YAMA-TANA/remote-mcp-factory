import type { Env } from './types.js';

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

export async function createBridgeToken(env: Env, serverId: string, bundleHash: string): Promise<string> {
  const key = await signingKey(env);
  const payload = `v1:${serverId}:${bundleHash}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return base64Url(signature);
}

export async function verifyBridgeToken(env: Env, token: string, serverId: string, bundleHash: string): Promise<boolean> {
  if (!token || !env.BRIDGE_SIGNING_KEY) return false;
  const expected = await createBridgeToken(env, serverId, bundleHash);
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
