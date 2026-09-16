import type { GenericServiceSlug } from './service-data';

export type Field = {
  key: string;
  label: string;
  kind?: 'text' | 'url' | 'number' | 'code' | 'json' | 'select' | 'checkbox';
  initial?: string;
  placeholder?: string;
  required?: boolean;
  options?: readonly string[];
  help?: string;
};

export type ServiceUI = {
  title: string;
  description: string;
  listPath?: string;
  collection?: string;
  createPath: string;
  createLabel: string;
  empty: string;
  fields: readonly Field[];
};

export const SERVICE_UI: Record<GenericServiceSlug, ServiceUI> = {
  mcp: {
    title: 'MCP deployments', description: 'Deploy a GitHub MCP server and manage its remote endpoint.',
    listPath: '/api/servers', collection: 'servers', createPath: '/api/servers', createLabel: 'Deploy MCP',
    empty: 'No MCP deployments yet. Deploy a GitHub repository to get started.',
    fields: [
      { key: 'repoUrl', label: 'GitHub repository URL', kind: 'url', required: true, placeholder: 'https://github.com/owner/repository' },
      { key: 'branch', label: 'Branch', initial: 'main', required: true },
      { key: 'visibility', label: 'Access', kind: 'select', initial: 'token', options: ['token', 'public'] },
    ],
  },
  hooks: {
    title: 'Webhook inboxes', description: 'Receive, inspect, and replay webhook requests.',
    listPath: '/api/picosvc/hooks/inboxes', collection: 'inboxes', createPath: '/api/picosvc/hooks/inboxes', createLabel: 'Create inbox',
    empty: 'No inboxes yet.', fields: [{ key: 'name', label: 'Inbox name', initial: 'Development webhook', required: true }],
  },
  rss: {
    title: 'RSS feeds', description: 'Turn a page into a feed and use its published URL in an RSS reader.',
    listPath: '/api/picosvc/rss/feeds', collection: 'feeds', createPath: '/api/picosvc/rss/feeds', createLabel: 'Create feed',
    empty: 'No feeds yet. Add a page to start tracking its updates.',
    fields: [{ key: 'name', label: 'Feed name', initial: 'My feed', required: true }, { key: 'sourceUrl', label: 'Source page URL', kind: 'url', required: true, placeholder: 'https://example.com/blog' }],
  },
  mail: {
    title: 'Email routes', description: 'Forward incoming mail to your webhook. Use an actual reachable HTTPS destination.',
    listPath: '/api/picosvc/mail/routes', collection: 'routes', createPath: '/api/picosvc/mail/routes', createLabel: 'Create route',
    empty: 'No email routes yet.',
    fields: [{ key: 'name', label: 'Route name', initial: 'Inbound mail', required: true }, { key: 'webhookUrl', label: 'Destination webhook URL', kind: 'url', required: true, placeholder: 'https://your-app.example/webhook' }],
  },
  shot: {
    title: 'Screenshot & PDF', description: 'Capture a public URL. View or download the resulting image or PDF here.',
    createPath: '/api/picosvc/shot', createLabel: 'Capture page', empty: '',
    fields: [{ key: 'url', label: 'Page URL', kind: 'url', required: true, placeholder: 'https://example.com/' }, { key: 'format', label: 'Output format', kind: 'select', initial: 'png', options: ['png', 'pdf'] }, { key: 'fullPage', label: 'Full page', kind: 'checkbox', initial: 'true' }],
  },
  fetch: {
    title: 'URL extraction', description: 'Extract Markdown or metadata from a public URL.',
    createPath: '/api/picosvc/fetch', createLabel: 'Extract URL', empty: '',
    fields: [{ key: 'url', label: 'Page URL', kind: 'url', required: true, placeholder: 'https://example.com/' }, { key: 'format', label: 'Output format', kind: 'select', initial: 'markdown', options: ['markdown', 'metadata'] }],
  },
  qr: {
    title: 'Dynamic QR links', description: 'Create a QR link whose destination you can change without reprinting its code.',
    listPath: '/api/picosvc/qr/links', collection: 'links', createPath: '/api/picosvc/qr/links', createLabel: 'Create QR link',
    empty: 'No QR links yet.',
    fields: [{ key: 'name', label: 'QR name', initial: 'My QR', required: true }, { key: 'targetUrl', label: 'Destination URL', kind: 'url', required: true, placeholder: 'https://your-site.example/' }],
  },
  cron: {
    title: 'Scheduled jobs', description: 'Schedule HTTP requests with a cron expression.',
    listPath: '/api/picosvc/cron/jobs', collection: 'jobs', createPath: '/api/picosvc/cron/jobs', createLabel: 'Create job',
    empty: 'No scheduled jobs yet.',
    fields: [{ key: 'name', label: 'Job name', initial: 'Health check', required: true }, { key: 'cron', label: 'Cron expression', initial: '*/15 * * * *', required: true }, { key: 'method', label: 'HTTP method', kind: 'select', initial: 'GET', options: ['GET', 'POST'] }, { key: 'targetUrl', label: 'Request URL', kind: 'url', required: true, placeholder: 'https://your-app.example/health' }],
  },
  functions: {
    title: 'Edge functions', description: 'Publish a small JavaScript function and use its live endpoint.',
    listPath: '/api/picosvc/functions/apps', collection: 'apps', createPath: '/api/picosvc/functions/apps', createLabel: 'Create function',
    empty: 'No functions yet.',
    fields: [{ key: 'name', label: 'Function name', initial: 'Hello function', required: true }, { key: 'code', label: 'JavaScript source', kind: 'code', required: true, initial: "export default { async fetch(request) { return Response.json({ hello: 'world', url: request.url }); } };" }],
  },
  json: {
    title: 'JSON stores', description: 'Create a private JSON key/value store, then manage documents with its bearer token.',
    listPath: '/api/picosvc/json/stores', collection: 'stores', createPath: '/api/picosvc/json/stores', createLabel: 'Create store',
    empty: 'No JSON stores yet.', fields: [{ key: 'name', label: 'Store name', initial: 'App data', required: true }],
  },
  files: {
    title: 'File spaces', description: 'Create a space and upload files to R2-backed public URLs.',
    listPath: '/api/picosvc/files/spaces', collection: 'spaces', createPath: '/api/picosvc/files/spaces', createLabel: 'Create space',
    empty: 'No file spaces yet.', fields: [{ key: 'name', label: 'Space name', initial: 'Public assets', required: true }],
  },
  license: {
    title: 'License projects', description: 'Issue and validate license keys for your applications.',
    listPath: '/api/picosvc/license/projects', collection: 'projects', createPath: '/api/picosvc/license/projects', createLabel: 'Create project',
    empty: 'No license projects yet.', fields: [{ key: 'name', label: 'Project name', initial: 'Desktop app', required: true }],
  },
  flags: {
    title: 'Remote config projects', description: 'Manage feature flags and remote configuration for your app.',
    listPath: '/api/picosvc/flags/projects', collection: 'projects', createPath: '/api/picosvc/flags/projects', createLabel: 'Create project',
    empty: 'No config projects yet.', fields: [{ key: 'name', label: 'Project name', initial: 'Production flags', required: true }],
  },
  monitor: {
    title: 'Page monitors', description: 'Check a URL at regular intervals for changes.',
    listPath: '/api/picosvc/monitor', collection: 'monitors', createPath: '/api/picosvc/monitor', createLabel: 'Create monitor',
    empty: 'No monitors yet.',
    fields: [{ key: 'name', label: 'Monitor name', initial: 'Homepage', required: true }, { key: 'targetUrl', label: 'Page URL', kind: 'url', required: true, placeholder: 'https://example.com/' }, { key: 'intervalMinutes', label: 'Interval (minutes)', kind: 'number', initial: '15', required: true }],
  },
  forms: {
    title: 'Form backends', description: 'Receive form submissions without building a server.',
    listPath: '/api/picosvc/forms', collection: 'forms', createPath: '/api/picosvc/forms', createLabel: 'Create form',
    empty: 'No forms yet.', fields: [{ key: 'name', label: 'Form name', initial: 'Contact form', required: true }],
  },
};

export function initialServiceForm(service: GenericServiceSlug): Record<string, string> {
  return Object.fromEntries(SERVICE_UI[service].fields.map((field) => [field.key, field.initial ?? '']));
}

export function serviceRequestBody(service: GenericServiceSlug, values: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(SERVICE_UI[service].fields.map((field) => {
    const raw = values[field.key] ?? '';
    if (field.kind === 'number') {
      const number = Number(raw);
      if (!raw.trim() || !Number.isFinite(number)) throw new Error(`${field.label} must be a valid number.`);
      return [field.key, number];
    }
    if (field.kind === 'checkbox') return [field.key, raw === 'true'];
    if (field.kind === 'json') {
      try { return [field.key, JSON.parse(raw) as unknown]; }
      catch { throw new Error(`${field.label} must contain valid JSON.`); }
    }
    if (field.required && !raw.trim()) throw new Error(`${field.label} is required.`);
    if (field.kind === 'url' && raw.trim()) {
      let parsed: URL;
      try { parsed = new URL(raw); } catch { throw new Error(`${field.label} must be a valid URL.`); }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${field.label} must use HTTP or HTTPS.`);
    }
    return [field.key, raw];
  }));
}
