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
      { key: 'repoUrl', label: 'GitHub repository URL', kind: 'url', required: true, placeholder: 'https://github.com/owner/repository', help: 'Use a repository URL, not a file or branch URL.' },
      { key: 'branch', label: 'Branch', initial: 'main', required: true, help: 'Change main if the repository uses a different branch.' },
      { key: 'visibility', label: 'Access', kind: 'select', initial: 'token', options: ['token', 'public'], help: 'Token access is recommended. Public access exposes the MCP endpoint to anyone with its URL.' },
    ],
  },
  hooks: {
    title: 'Webhook inboxes', description: 'Receive, inspect, and replay webhook requests.',
    listPath: '/api/picosvc/hooks/inboxes', collection: 'inboxes', createPath: '/api/picosvc/hooks/inboxes', createLabel: 'Create inbox',
    empty: 'No inboxes yet.', fields: [{ key: 'name', label: 'Inbox name', initial: 'Development webhook', required: true, help: 'Create an inbox, then copy its public receiving URL from the resource details.' }],
  },
  rss: {
    title: 'RSS feeds', description: 'Turn a page into a feed and use its published URL in an RSS reader.',
    listPath: '/api/picosvc/rss/feeds', collection: 'feeds', createPath: '/api/picosvc/rss/feeds', createLabel: 'Create feed',
    empty: 'No feeds yet. Add a page to start tracking its updates.',
    fields: [
      { key: 'name', label: 'Feed name', initial: 'My feed', required: true },
      { key: 'sourceUrl', label: 'Source page URL', kind: 'url', required: true, placeholder: 'https://example.com/blog', help: 'Use a public HTML page with visible article links.' },
      { key: 'itemSelector', label: 'Article CSS selector (optional)', placeholder: 'article', help: 'Match each article separately. If you specify this, creation fails when no articles match instead of publishing an unrelated feed.' },
      { key: 'titleSelector', label: 'Title selector (optional)', placeholder: 'h2, h3', help: 'Relative to each article; leave blank for automatic title extraction.' },
      { key: 'linkSelector', label: 'Link selector (optional)', placeholder: 'a[href]', help: 'Relative to each article; leave blank for automatic link extraction.' },
      { key: 'contentSelector', label: 'Content selector (optional)', placeholder: '.summary', help: 'Relative to each article; leave blank for automatic summary extraction.' },
      { key: 'dateSelector', label: 'Date selector (optional)', placeholder: 'time[datetime]', help: 'Relative to each article; leave blank when no publication date is available.' },
    ],
  },
  mail: {
    title: 'Email routes', description: 'Forward incoming mail to your webhook. Use an actual reachable HTTPS destination.',
    listPath: '/api/picosvc/mail/routes', collection: 'routes', createPath: '/api/picosvc/mail/routes', createLabel: 'Create route',
    empty: 'No email routes yet.',
    fields: [{ key: 'name', label: 'Route name', initial: 'Inbound mail', required: true }, { key: 'webhookUrl', label: 'Destination webhook URL', kind: 'url', required: true, placeholder: 'https://your-app.example/webhook', help: 'Your endpoint should accept POST requests and return a 2xx response.' }],
  },
  shot: {
    title: 'Screenshot & PDF', description: 'Capture a public URL. View or download the resulting image or PDF here.',
    createPath: '/api/picosvc/shot', createLabel: 'Capture page', empty: '',
    fields: [{ key: 'url', label: 'Page URL', kind: 'url', required: true, placeholder: 'https://example.com/' }, { key: 'format', label: 'Output format', kind: 'select', initial: 'png', options: ['png', 'pdf'] }, { key: 'fullPage', label: 'Full page', kind: 'checkbox', initial: 'true' }],
  },
  fetch: {
    title: 'URL extraction', description: 'Extract Markdown or metadata from a public URL.',
    createPath: '/api/picosvc/fetch', createLabel: 'Extract URL', empty: '',
    fields: [{ key: 'url', label: 'Page URL', kind: 'url', required: true, placeholder: 'https://example.com/', help: 'Use a public page; authenticated or private pages cannot be extracted.' }, { key: 'format', label: 'Output format', kind: 'select', initial: 'markdown', options: ['markdown', 'metadata'], help: 'Markdown extracts page text; metadata returns title, description and URL information.' }],
  },
  qr: {
    title: 'Dynamic QR links', description: 'Create a QR link whose destination you can change without reprinting its code.',
    listPath: '/api/picosvc/qr/links', collection: 'links', createPath: '/api/picosvc/qr/links', createLabel: 'Create QR link',
    empty: 'No QR links yet.',
    fields: [{ key: 'name', label: 'QR name', initial: 'My QR', required: true }, { key: 'targetUrl', label: 'Destination URL', kind: 'url', required: true, placeholder: 'https://your-site.example/', help: 'You can change this destination later without replacing the printed QR code.' }],
  },
  cron: {
    title: 'Scheduled jobs', description: 'Schedule HTTP requests with a cron expression.',
    listPath: '/api/picosvc/cron/jobs', collection: 'jobs', createPath: '/api/picosvc/cron/jobs', createLabel: 'Create job',
    empty: 'No scheduled jobs yet.',
    fields: [
      { key: 'name', label: 'Job name', initial: 'Health check', required: true },
      { key: 'cron', label: 'Cron expression (UTC)', initial: '*/15 * * * *', required: true, help: 'Five fields: minute hour day month weekday. For example, */15 * * * * runs every 15 minutes UTC.' },
      { key: 'method', label: 'HTTP method', kind: 'select', initial: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'targetUrl', label: 'Request URL', kind: 'url', required: true, placeholder: 'https://your-app.example/health' },
      { key: 'headers', label: 'Request headers (JSON object)', kind: 'json', initial: '{}', placeholder: '{"content-type":"application/json"}', help: 'Optional headers as a JSON object. Do not paste secrets into screenshots or support messages.' },
      { key: 'body', label: 'Request body (optional)', kind: 'code', initial: '', placeholder: '{"event":"tick"}', help: 'Sent for POST, PUT, PATCH and DELETE. GET requests do not send a body.' },
    ],
  },
  functions: {
    title: 'Edge functions', description: 'Publish a small JavaScript function and use its live endpoint.',
    listPath: '/api/picosvc/functions/apps', collection: 'apps', createPath: '/api/picosvc/functions/apps', createLabel: 'Create function',
    empty: 'No functions yet.',
    fields: [{ key: 'name', label: 'Function name', initial: 'Hello function', required: true }, { key: 'code', label: 'JavaScript source', kind: 'code', required: true, initial: "export default { async fetch(request) { return Response.json({ hello: 'world', url: request.url }); } };", help: 'Export a default object with an async fetch(request) handler returning a Response.' }],
  },
  json: {
    title: 'JSON stores', description: 'Create a private JSON key/value store, then manage documents with its bearer token.',
    listPath: '/api/picosvc/json/stores', collection: 'stores', createPath: '/api/picosvc/json/stores', createLabel: 'Create store',
    empty: 'No JSON stores yet.', fields: [{ key: 'name', label: 'Store name', initial: 'App data', required: true, help: 'Save the bearer token displayed after creation; it cannot be recovered later.' }],
  },
  files: {
    title: 'File spaces', description: 'Create a space and upload files to R2-backed public URLs.',
    listPath: '/api/picosvc/files/spaces', collection: 'spaces', createPath: '/api/picosvc/files/spaces', createLabel: 'Create space',
    empty: 'No file spaces yet.', fields: [{ key: 'name', label: 'Space name', initial: 'Public assets', required: true, help: 'Only upload files intended for the configured access level. Review sharing settings before publishing.' }],
  },
  license: {
    title: 'License projects', description: 'Issue and validate license keys for your applications.',
    listPath: '/api/picosvc/license/projects', collection: 'projects', createPath: '/api/picosvc/license/projects', createLabel: 'Create project',
    empty: 'No license projects yet.', fields: [{ key: 'name', label: 'Project name', initial: 'Desktop app', required: true, help: 'Create a project first, then issue and validate keys in its management panel.' }],
  },
  flags: {
    title: 'Remote config projects', description: 'Manage feature flags and remote configuration for your app.',
    listPath: '/api/picosvc/flags/projects', collection: 'projects', createPath: '/api/picosvc/flags/projects', createLabel: 'Create project',
    empty: 'No config projects yet.', fields: [{ key: 'name', label: 'Project name', initial: 'Production flags', required: true, help: 'Use separate projects for production and development configurations.' }],
  },
  monitor: {
    title: 'Page monitors', description: 'Check a URL at regular intervals for changes.',
    listPath: '/api/picosvc/monitor', collection: 'monitors', createPath: '/api/picosvc/monitor', createLabel: 'Create monitor',
    empty: 'No monitors yet.',
    fields: [
      { key: 'name', label: 'Monitor name', initial: 'Homepage', required: true },
      { key: 'targetUrl', label: 'Page URL', kind: 'url', required: true, placeholder: 'https://example.com/' },
      { key: 'intervalMinutes', label: 'Interval (minutes)', kind: 'number', initial: '60', required: true, help: 'Free: at least 60 minutes; Pico: 15; PicoPlus: 5. Shorter intervals may be raised to your plan minimum.' },
      { key: 'webhookUrl', label: 'Change notification webhook (optional)', kind: 'url', placeholder: 'https://your-app.example/changes', help: 'Receive a POST when a page changes. Leave blank to monitor without notifications.' },
    ],
  },
  forms: {
    title: 'Form backends', description: 'Receive form submissions without building a server.',
    listPath: '/api/picosvc/forms', collection: 'forms', createPath: '/api/picosvc/forms', createLabel: 'Create form',
    empty: 'No forms yet.', fields: [{ key: 'name', label: 'Form name', initial: 'Contact form', required: true, help: 'After creation, use the form endpoint in your HTML form or application.' }],
  },
};

export function initialServiceForm(service: GenericServiceSlug): Record<string, string> {
  return Object.fromEntries(SERVICE_UI[service].fields.map((field) => [field.key, field.initial ?? '']));
}

const CRON_BOUNDS: ReadonlyArray<readonly [number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
function validCronAtom(atom: string, min: number, max: number): boolean {
  if (atom === '*') return true;
  const step = atom.match(/^\*\/(\d+)$/);
  if (step) return Number(step[1]) >= 1 && Number(step[1]) <= max - min + 1;
  const range = atom.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
  if (range) {
    const start = Number(range[1]); const end = Number(range[2]); const stride = Number(range[3] || 1);
    return start >= min && end <= max && start <= end && stride >= 1 && stride <= max - min + 1;
  }
  return /^\d+$/.test(atom) && Number(atom) >= min && Number(atom) <= max;
}
function validCron(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  return parts.length === 5 && parts.every((part, index) => part.length <= 80 && part.split(',').every(atom => validCronAtom(atom, ...CRON_BOUNDS[index])));
}

export function serviceRequestBody(service: GenericServiceSlug, values: Record<string, string>): Record<string, unknown> {
  const body = Object.fromEntries(SERVICE_UI[service].fields.map((field) => {
    const raw = values[field.key] ?? '';
    if (field.required && !raw.trim()) throw new Error(`${field.label} is required.`);
    if (field.kind === 'number') {
      const number = Number(raw);
      if (!raw.trim() || !Number.isSafeInteger(number)) throw new Error(`${field.label} must be a whole number.`);
      if (service === 'monitor' && field.key === 'intervalMinutes' && (number < 5 || number > 10080)) throw new Error(`${field.label} must be between 5 and 10080.`);
      return [field.key, number];
    }
    if (field.kind === 'checkbox') return [field.key, raw === 'true'];
    if (field.kind === 'json') {
      if (!raw.trim() && !field.required) return [field.key, {}];
      let parsed: unknown;
      try { parsed = JSON.parse(raw) as unknown; }
      catch { throw new Error(`${field.label} must contain valid JSON.`); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${field.label} must be a JSON object.`);
      return [field.key, parsed];
    }
    if (field.kind === 'select' && field.options && !field.options.includes(raw)) throw new Error(`${field.label} has an invalid choice.`);
    if (field.kind === 'url' && raw.trim()) {
      let parsed: URL;
      try { parsed = new URL(raw); } catch { throw new Error(`${field.label} must be a valid URL.`); }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error(`${field.label} must use HTTP or HTTPS.`);
      if (parsed.username || parsed.password) throw new Error(`${field.label} must not contain credentials.`);
      if (service === 'mcp' && field.key === 'repoUrl' && (parsed.hostname !== 'github.com' || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(parsed.pathname))) throw new Error('Enter a GitHub repository URL, not a file, branch or search URL.');
    }
    if (field.key.endsWith('Selector') && raw.length > 300) throw new Error(`${field.label} must be at most 300 characters.`);
    return [field.key, raw];
  }));
  if (service === 'cron') {
    if (!validCron(String(body.cron || ''))) throw new Error('Cron expression must contain five valid UTC fields.');
    if (body.method === 'GET' && String(body.body || '').trim()) throw new Error('GET jobs cannot send a request body. Select POST, PUT, PATCH or DELETE.');
  }
  return body;
}
