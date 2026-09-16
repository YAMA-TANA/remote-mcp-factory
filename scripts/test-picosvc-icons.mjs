import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const iconSource = read('web/app/components/ServiceIcon.tsx');
const home = read('web/app/home-v2.tsx');
const nav = read('web/app/components/QuickNavigator.tsx');
const servicePage = read('web/app/[locale]/[service]/page.tsx');
const mockPage = read('web/app/[locale]/mock/page.tsx');
const hooksPage = read('web/app/[locale]/hooks/page.tsx');
const names = iconSource.match(/export const SERVICE_ICON_NAMES = \[([\s\S]*?)\] as const;/)?.[1]?.match(/'([a-z]+)'/g)?.map(name => name.slice(1, -1)) || [];
assert.equal(names.length, 16, 'All sixteen product icons must exist');
assert.equal(new Set(names).size, 16, 'Service icons must be unique');
for (const name of ['picosvc', ...names]) {
  const svg = read(`web/public/icons/${name}.svg`);
  assert.match(svg, /<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${name} must be a standalone SVG`);
  assert.match(svg, /viewBox="0 0 64 64"/, `${name} must use the common icon grid`);
  assert.match(svg, /<rect\b/, `${name} must have the shared tile`);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|data:image\//i, `${name} must not embed scripts or raster images`);
  if (name !== 'picosvc') assert.match(iconSource, new RegExp(`case '${name}': return`), `${name} needs an inline SVG glyph`);
}
assert.match(read('web/app/icon.svg'), /<svg\b/, 'The site favicon must be SVG');
assert.match(home, /<ServiceIcon name=\{slug\}/, 'Product cards need their icons');
assert.match(nav, /<ServiceIcon name=\{slug\}/, 'Quick navigation needs its icons');
assert.match(servicePage, /icons: \{ icon: `\/icons\/\$\{service\}\.svg`/, 'Service pages should use their own favicon');
assert.match(mockPage, /icons\/mock\.svg/);
assert.match(hooksPage, /icons\/hooks\.svg/);
console.log('PicoSvc icons OK: 16 standalone service SVGs, suite logo, favicon and UI integration.');
