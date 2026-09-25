export const GENERIC_SERVICE_SLUGS = [
  'mcp', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron', 'functions', 'json', 'files',
  'license', 'flags', 'monitor', 'forms',
] as const;

// Hooks and Mock have dedicated routes and are not included in the generic static export.
export type GenericServiceSlug = typeof GENERIC_SERVICE_SLUGS[number] | 'hooks';

export const SERVICE_INFO: Record<GenericServiceSlug | 'mock', { name: string; role: string }> = {
  mcp: { name: 'MCP', role: 'Edge-first MCP hosting / Remote conversion' },
  mock: { name: 'Mock API', role: 'Configurable HTTP mock endpoints' },
  hooks: { name: 'Webhook Inbox', role: 'Webhook inbox / replay' },
  rss: { name: 'Web → RSS', role: 'Web page change → RSS' },
  mail: { name: 'Email → Webhook', role: 'Inbound email → webhook relay' },
  shot: { name: 'Screenshot', role: 'Browser screenshot / PDF capture' },
  fetch: { name: 'Web Fetch', role: 'Single-URL Markdown / metadata extraction' },
  qr: { name: 'Dynamic QR', role: 'Dynamic QR redirect' },
  cron: { name: 'Cron', role: 'Scheduled HTTP requests' },
  functions: { name: 'Functions', role: 'Tiny edge JavaScript functions' },
  json: { name: 'JSON Store', role: 'Token-protected JSON key/value API' },
  files: { name: 'Files', role: 'Tiny R2 object hosting' },
  license: { name: 'License', role: 'License Key API' },
  flags: { name: 'Remote Config', role: 'Remote Config API' },
  monitor: { name: 'Monitor', role: 'Web page hash-change monitor' },
  forms: { name: 'Forms', role: 'Simple form submission backend' },
};

export function isGenericServiceSlug(value: string): value is typeof GENERIC_SERVICE_SLUGS[number] {
  return (GENERIC_SERVICE_SLUGS as readonly string[]).includes(value);
}
