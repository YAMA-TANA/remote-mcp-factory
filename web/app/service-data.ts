export const GENERIC_SERVICE_SLUGS = [
  'mcp', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron', 'functions', 'json', 'files',
  'license', 'flags', 'monitor', 'forms',
] as const;

export type GenericServiceSlug = typeof GENERIC_SERVICE_SLUGS[number];

export const SERVICE_INFO: Record<GenericServiceSlug, { name: string; role: string }> = {
  mcp: { name: 'MCP', role: 'MCP hosting / Remote conversion' },
  rss: { name: 'RSS', role: 'Web → RSS feeds' },
  mail: { name: 'Mail', role: 'Email → Webhook' },
  shot: { name: 'Shot', role: 'Screenshot / PDF' },
  fetch: { name: 'Fetch', role: 'URL → Markdown / metadata' },
  qr: { name: 'QR', role: 'Dynamic QR / redirect' },
  cron: { name: 'Cron', role: 'Scheduled HTTP jobs' },
  functions: { name: 'Functions', role: 'Tiny serverless functions' },
  json: { name: 'JSON', role: 'Token-protected JSON API' },
  files: { name: 'Files', role: 'R2-backed file delivery' },
  license: { name: 'License', role: 'License key validation' },
  flags: { name: 'Flags', role: 'Feature flags / remote config' },
  monitor: { name: 'Monitor', role: 'Web page change monitoring' },
  forms: { name: 'Forms', role: 'Form backend' },
};

export function isGenericServiceSlug(value: string): value is GenericServiceSlug {
  return (GENERIC_SERVICE_SLUGS as readonly string[]).includes(value);
}
