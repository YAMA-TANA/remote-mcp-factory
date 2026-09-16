export function randomPublicId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export function randomSecret(prefix = 'pico'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${prefix}_${token}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return false;
  const [a, b, c] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes(':')) return false;
  // URL canonicalization rewrites ::ffff:127.0.0.1 to ::ffff:7f00:1.
  // Reject the entire mapped/translated and tunnelling ranges rather than
  // decoding only dotted-decimal literals and missing private IPv4 targets.
  return host === '::'
    || host === '::1'
    || host.startsWith('::ffff:')
    || host.startsWith('64:ff9b:')  // NAT64 well-known IPv4 translation prefix
    || host.startsWith('64:ff9b:1:')
    || host.startsWith('2002:')      // 6to4 embeds an IPv4 endpoint
    || host.startsWith('2001:0:')    // Teredo embeds an IPv4 endpoint
    || host.startsWith('2001:db8:')  // documentation-only range
    || host.startsWith('fc')
    || host.startsWith('fd')
    || host.startsWith('fe8')
    || host.startsWith('fe9')
    || host.startsWith('fea')
    || host.startsWith('feb');
}

export function safePublicUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
  if (hostname === 'metadata' || hostname === 'metadata.google.internal') return null;
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return null;
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (port !== '80' && port !== '443') return null;
  return url;
}

export async function fetchPublic(
  input: string | URL,
  init: RequestInit = {},
  maxRedirects = 3,
): Promise<Response> {
  let current = typeof input === 'string' ? safePublicUrl(input) : safePublicUrl(input.toString());
  if (!current) throw new Error('URL must be a public HTTP(S) URL on port 80 or 443');

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(current.toString(), { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    if (redirects === maxRedirects) throw new Error('Too many redirects');
    const next = safePublicUrl(new URL(location, current).toString());
    if (!next) throw new Error('Redirect target is not a permitted public URL');
    current = next;
  }

  throw new Error('Unexpected redirect state');
}

export function safeHeaderObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  const blocked = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'cookie', 'authorization', 'proxy-authorization']);
  for (const [rawName, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const name = rawName.toLowerCase();
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]{1,80}$/.test(name) || blocked.has(name) || name.startsWith('cf-')) continue;
    if (typeof rawValue !== 'string') continue;
    result[name] = rawValue.slice(0, 8192);
  }
  return result;
}
