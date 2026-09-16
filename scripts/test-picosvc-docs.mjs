import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  'README.md', 'SECURITY.md', 'web/README.md',
  'docs/README.md', 'docs/PICOSVC_QUICKSTART.md',
  'docs/PICOSVC_API_GUIDE.md', 'docs/PICOSVC_DEPLOYMENT.md',
];
const required = [
  'mcp', 'mock', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr',
  'cron', 'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
];

let linksChecked = 0;
for (const path of pages) {
  const absolute = resolve(root, path);
  assert.ok(existsSync(absolute) && statSync(absolute).isFile(), `Missing document: ${path}`);
  const contents = readFileSync(absolute, 'utf8');
  assert.ok(contents.trim(), `Empty document: ${path}`);
  // The first pass checks relative link targets. It does not attempt to validate external URLs
  // or GitHub's heading-slug algorithm for #anchors.
  for (const match of contents.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
    const original = match[1].trim().replace(/^<|>$/g, '');
    if (!original || original.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(original)) continue;
    const pathname = decodeURIComponent(original.split('#', 1)[0].split('?', 1)[0]);
    if (!pathname) continue;
    const target = resolve(dirname(absolute), pathname);
    const inside = relative(root, target);
    assert.ok(inside !== '..' && !inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(inside), `${path}: link escapes repository: ${original}`);
    assert.ok(existsSync(target), `${path}: broken relative link: ${original}`);
    linksChecked += 1;
  }
}

const guide = readFileSync(resolve(root, 'docs/PICOSVC_API_GUIDE.md'), 'utf8');
const catalog = readFileSync(resolve(root, 'src/picosvc/catalog.ts'), 'utf8');
for (const slug of required) {
  assert.match(catalog, new RegExp(`slug: '${slug}'`), `Missing product in catalog: ${slug}`);
  const heading = slug === 'mcp' ? 'MCP' : slug === 'rss' ? 'RSS' : slug === 'qr' ? 'QR' : slug === 'json' ? 'JSON' : slug === 'mail' ? 'Mail' : slug === 'shot' ? 'Shot' : slug === 'fetch' ? 'Fetch' : slug === 'cron' ? 'Cron' : slug === 'mock' ? 'Mock' : slug === 'hooks' ? 'Hooks' : slug === 'functions' ? 'Functions' : slug === 'files' ? 'Files' : slug === 'license' ? 'License' : slug === 'flags' ? 'Flags' : slug === 'monitor' ? 'Monitor' : 'Forms';
  assert.ok(guide.includes(`| ${heading} |`), `Missing service API entry: ${slug}`);
}
assert.match(readFileSync(resolve(root, 'README.md'), 'utf8'), /docs\/README\.md/, 'Root README must link documentation index');
console.log(`PicoSvc docs checks OK: ${pages.length} documents, ${linksChecked} local links and all ${required.length} product entries.`);
