import type { Env } from './types.js';

const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const RESERVED = new Set([
  'PATH', 'HOME', 'PWD', 'OLDPWD', 'SHELL', 'USER', 'LOGNAME', 'HOSTNAME',
  'NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
  'NPM_CONFIG_PREFIX', 'NPM_CONFIG_USERCONFIG', 'BASH_ENV', 'ENV',
]);

export interface DeploymentSecrets {
  values: Record<string, string>;
  names: string[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const encoded = env.DEPLOYMENT_SECRETS_KEY?.trim();
  if (!encoded) throw new Error('DEPLOYMENT_SECRETS_KEY is not configured');
  let raw: Uint8Array;
  try {
    raw = base64ToBytes(encoded);
  } catch {
    throw new Error('DEPLOYMENT_SECRETS_KEY must be base64');
  }
  if (raw.byteLength !== 32) throw new Error('DEPLOYMENT_SECRETS_KEY must decode to exactly 32 bytes');
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function validateSecretName(name: string): string {
  const normalized = name.trim();
  if (!NAME_RE.test(normalized)) throw new Error(`Invalid environment variable name: ${name}`);
  if (RESERVED.has(normalized) || normalized.startsWith('CF_') || normalized.startsWith('WRANGLER_')) {
    throw new Error(`Reserved environment variable name: ${normalized}`);
  }
  return normalized;
}

export async function putDeploymentSecrets(env: Env, serverId: string, input: Record<string, string>): Promise<string[]> {
  const entries = Object.entries(input);
  if (!entries.length) return [];
  if (entries.length > 50) throw new Error('At most 50 secrets may be updated at once');
  const key = await encryptionKey(env);
  const now = new Date().toISOString();
  const names: string[] = [];

  for (const [rawName, rawValue] of entries) {
    const name = validateSecretName(rawName);
    if (typeof rawValue !== 'string') throw new Error(`${name} must be a string`);
    if (rawValue.length > 16_384) throw new Error(`${name} exceeds the 16 KiB value limit`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(rawValue);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    await env.DB.prepare(`
      INSERT INTO server_secrets (server_id,name,iv,ciphertext,updated_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(server_id,name) DO UPDATE SET iv=excluded.iv,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at
    `).bind(serverId, name, bytesToBase64(iv), bytesToBase64(new Uint8Array(encrypted)), now).run();
    names.push(name);
  }
  // Changes the Dynamic Worker identity so a warm isolate can never retain the previous secret set.
  await env.DB.prepare('UPDATE servers SET updated_at=? WHERE id=?').bind(now, serverId).run();
  return names.sort();
}

export async function deleteDeploymentSecret(env: Env, serverId: string, rawName: string): Promise<void> {
  const name = validateSecretName(rawName);
  await env.DB.prepare('DELETE FROM server_secrets WHERE server_id=? AND name=?').bind(serverId, name).run();
  await env.DB.prepare('UPDATE servers SET updated_at=? WHERE id=?').bind(new Date().toISOString(), serverId).run();
}

export async function listDeploymentSecretNames(env: Env, serverId: string): Promise<string[]> {
  const rows = await env.DB.prepare('SELECT name FROM server_secrets WHERE server_id=? ORDER BY name').bind(serverId).all<{ name: string }>();
  return rows.results.map((row) => row.name);
}

export async function loadDeploymentSecrets(env: Env, serverId: string): Promise<DeploymentSecrets> {
  const rows = await env.DB.prepare('SELECT name,iv,ciphertext FROM server_secrets WHERE server_id=? ORDER BY name')
    .bind(serverId).all<{ name: string; iv: string; ciphertext: string }>();
  if (!rows.results.length) return { values: {}, names: [] };
  const key = await encryptionKey(env);
  const values: Record<string, string> = {};
  for (const row of rows.results) {
    const name = validateSecretName(row.name);
    const iv = base64ToBytes(row.iv);
    const encrypted = base64ToBytes(row.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    values[name] = new TextDecoder().decode(plaintext);
  }
  return { values, names: Object.keys(values).sort() };
}
