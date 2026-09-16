export const GENERIC_SERVICE_SLUGS = [
  'mcp', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron', 'functions', 'json', 'files',
  'license', 'flags', 'monitor', 'forms',
] as const;

export type GenericServiceSlug = typeof GENERIC_SERVICE_SLUGS[number];

export const SERVICE_INFO: Record<GenericServiceSlug, { name: string; role: string }> = {
  mcp: { name: 'MCP', role: 'Edge-first MCP hosting / Remote conversion' },
  rss: { name: 'RSS', role: 'Web page change → RSS' },
  mail: { name: 'Mail', role: 'Inbound email → webhook relay' },
  shot: { name: 'Shot', role: 'Browser screenshot / PDF capture' },
  fetch: { name: 'Fetch', role: 'Single-URL Markdown / metadata extraction' },
  qr: { name: 'QR', role: 'Dynamic QR redirect' },
  cron: { name: 'Cron', role: 'Scheduled HTTP requests' },
  functions: { name: 'Functions', role: 'Tiny edge JavaScript functions' },
  json: { name: 'JSON', role: 'Token-protected JSON key/value API' },
  files: { name: 'Files', role: 'Tiny R2 object hosting' },
  license: { name: 'License', role: 'License Key API' },
  flags: { name: 'Config', role: 'Remote Config API' },
  monitor: { name: 'Monitor', role: 'Web page hash-change monitor' },
  forms: { name: 'Forms', role: 'Simple form submission backend' },
};

export function isGenericServiceSlug(value: string): value is GenericServiceSlug {
  return (GENERIC_SERVICE_SLUGS as readonly string[]).includes(value);
}
