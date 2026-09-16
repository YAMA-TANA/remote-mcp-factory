import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICE_SEARCH_ALIASES, normalizeServiceSearch, matchesServiceSearch } from '../web/app/service-search.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('web/app/home-v2.tsx');
const palette = read('web/app/components/QuickNavigator.tsx');
const css = read('web/app/home-discovery.css');
const layout = read('web/app/layout.tsx');
const slugs = [
  'mock', 'mcp', 'hooks', 'rss', 'mail', 'shot', 'fetch', 'qr', 'cron',
  'functions', 'json', 'files', 'license', 'flags', 'monitor', 'forms',
];
assert.deepEqual(Object.keys(SERVICE_SEARCH_ALIASES).sort(), [...slugs].sort(), 'All 16 services need searchable aliases');
assert.equal(normalizeServiceSearch('  ＱＲ  '), 'qr', 'Full-width search should normalize');
for (const [slug, term] of [
  ['shot', 'スクショ'], ['monitor', '監視'], ['hooks', 'ウェブフック'],
  ['qr', '二维码'], ['forms', '表单'], ['mcp', 'ホスティング'],
]) {
  assert.equal(matchesServiceSearch(slug, normalizeServiceSearch(term)), true, `${term} must find ${slug}`);
}
assert.equal(matchesServiceSearch('shot', normalizeServiceSearch('ライセンス')), false);
assert.equal(matchesServiceSearch('shot', '', 'Screenshot'), true);
assert.match(home, /matchesServiceSearch\(slug, normalized/);
assert.match(palette, /matchesServiceSearch\(slug, normalized/);
assert.match(home, /className="homeFilterCount"/);
assert.match(home, /onClick=\{resetDiscovery\}/);
assert.match(home, /className="homeProductTitleLink"/);
assert.match(css, /\.homeProductTitleLink::after/);
assert.match(css, /\.homeProductTitleLink:focus-visible::after/);
assert.match(palette, /event\.key === 'ArrowDown'/);
assert.match(palette, /event\.key === 'ArrowUp'/);
assert.match(palette, /event\.key === 'Enter' && event\.target === inputRef\.current/);
assert.match(palette, /document\.body\.style\.overflow = 'hidden'/);
assert.match(palette, /document\.body\.style\.overflow = previousOverflow/);
assert.match(palette, /event\.nativeEvent\.isComposing/);
assert.match(layout, /import '\.\/home-discovery\.css'/);
console.log('PicoSvc discovery checks OK: multilingual aliases, full-card links, reset, keyboard navigation and scroll restoration.');
