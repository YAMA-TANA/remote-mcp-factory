import type { Env } from './types.js';

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2026-03-10';

export interface GitHubInstallation {
  id: number;
  account: { login: string; type: string };
  repository_selection?: string;
  suspended_at?: string | null;
}

export interface GitHubRepository {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

function configured(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is not configured`);
  return result;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemBytes(pem: string): { label: string; bytes: Uint8Array } {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const match = normalized.match(/^-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+)-----END \1-----$/);
  if (!match) throw new Error('GITHUB_APP_PRIVATE_KEY must be a PEM private key');
  const binary = atob(match[2].replace(/\s+/g, ''));
  return { label: match[1], bytes: Uint8Array.from(binary, (ch) => ch.charCodeAt(0)) };
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, content: Uint8Array): Uint8Array {
  const length = derLength(content.length);
  const out = new Uint8Array(1 + length.length + content.length);
  out[0] = tag;
  out.set(length, 1);
  out.set(content, 1 + length.length);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  // PrivateKeyInfo ::= SEQUENCE { version INTEGER, algorithm AlgorithmIdentifier, privateKey OCTET STRING }
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaEncryptionAlgorithm = new Uint8Array([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);
  return der(0x30, concat(version, rsaEncryptionAlgorithm, der(0x04, pkcs1)));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function appPrivateKey(env: Env): Promise<CryptoKey> {
  const parsed = pemBytes(configured(env.GITHUB_APP_PRIVATE_KEY, 'GITHUB_APP_PRIVATE_KEY'));
  let bytes: Uint8Array;
  if (parsed.label === 'RSA PRIVATE KEY') bytes = pkcs1ToPkcs8(parsed.bytes);
  else if (parsed.label === 'PRIVATE KEY') bytes = parsed.bytes;
  else throw new Error(`Unsupported GitHub App private key format: ${parsed.label}`);
  return crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(bytes),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export function githubAppConfigured(env: Env): boolean {
  return Boolean(
    env.GITHUB_APP_ID?.trim()
    && env.GITHUB_APP_CLIENT_ID?.trim()
    && env.GITHUB_APP_CLIENT_SECRET?.trim()
    && env.GITHUB_APP_PRIVATE_KEY?.trim()
    && env.GITHUB_APP_SLUG?.trim()
    && env.GITHUB_WEBHOOK_SECRET?.trim(),
  );
}

export async function githubAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: configured(env.GITHUB_APP_ID, 'GITHUB_APP_ID'),
  });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await appPrivateKey(env),
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function githubFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-GitHub-Api-Version', API_VERSION);
  headers.set('User-Agent', 'remote-mcp-factory');
  return fetch(url, { ...init, headers });
}

async function githubJson<T>(response: Response, context: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${context} failed (${response.status}): ${text.slice(0, 1000)}`);
  return JSON.parse(text) as T;
}

export async function createInstallationAccessToken(env: Env, installationId: number, repositoryId?: number): Promise<string> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new Error('Invalid GitHub installation id');
  const jwt = await githubAppJwt(env);
  const body = repositoryId === undefined ? {} : { repository_ids: [repositoryId] };
  const response = await githubFetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, jwt, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await githubJson<{ token: string }>(response, 'GitHub installation token request');
  if (!result.token) throw new Error('GitHub installation token response did not include a token');
  return result.token;
}

export async function getInstallationRepository(env: Env, installationId: number, repositoryId: number): Promise<GitHubRepository> {
  const token = await createInstallationAccessToken(env, installationId, repositoryId);
  const response = await githubFetch(`${GITHUB_API}/repositories/${repositoryId}`, token);
  return githubJson<GitHubRepository>(response, 'GitHub repository lookup');
}

export async function listInstallationRepositories(env: Env, installationId: number): Promise<GitHubRepository[]> {
  const token = await createInstallationAccessToken(env, installationId);
  const repositories: GitHubRepository[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await githubFetch(`${GITHUB_API}/installation/repositories?per_page=100&page=${page}`, token);
    const payload = await githubJson<{ repositories: GitHubRepository[] }>(response, 'GitHub installation repository list');
    repositories.push(...payload.repositories);
    if (payload.repositories.length < 100) break;
  }
  return repositories;
}

export function githubInstallUrl(env: Env): string {
  return `https://github.com/apps/${encodeURIComponent(configured(env.GITHUB_APP_SLUG, 'GITHUB_APP_SLUG'))}/installations/new`;
}

export function githubAuthorizeUrl(env: Env, callbackUrl: string, state: string, codeChallenge: string): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', configured(env.GITHUB_APP_CLIENT_ID, 'GITHUB_APP_CLIENT_ID'));
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeGitHubUserCode(env: Env, code: string, callbackUrl: string, codeVerifier: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'remote-mcp-factory',
    },
    body: new URLSearchParams({
      client_id: configured(env.GITHUB_APP_CLIENT_ID, 'GITHUB_APP_CLIENT_ID'),
      client_secret: configured(env.GITHUB_APP_CLIENT_SECRET, 'GITHUB_APP_CLIENT_SECRET'),
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    }),
  });
  const payload = await githubJson<{ access_token?: string; error?: string; error_description?: string }>(response, 'GitHub OAuth code exchange');
  if (!payload.access_token) throw new Error(payload.error_description || payload.error || 'GitHub OAuth response did not include an access token');
  return payload.access_token;
}

export async function listUserInstallations(userAccessToken: string): Promise<GitHubInstallation[]> {
  const installations: GitHubInstallation[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await githubFetch(`${GITHUB_API}/user/installations?per_page=100&page=${page}`, userAccessToken);
    const payload = await githubJson<{ installations: GitHubInstallation[] }>(response, 'GitHub user installation list');
    installations.push(...payload.installations);
    if (payload.installations.length < 100) break;
  }
  return installations;
}

function signatureBytes(header: string): Uint8Array | null {
  if (!/^sha256=[0-9a-f]{64}$/i.test(header)) return null;
  const hex = header.slice('sha256='.length);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function verifyGitHubWebhook(env: Env, payload: Uint8Array, signatureHeader: string | null): Promise<boolean> {
  const signature = signatureHeader ? signatureBytes(signatureHeader) : null;
  if (!signature) return false;
  const secret = configured(env.GITHUB_WEBHOOK_SECRET, 'GITHUB_WEBHOOK_SECRET');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, toArrayBuffer(signature), toArrayBuffer(payload));
}

export function randomUrlToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}