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
  assert.match(svg, /<linearGradient\b/, `${name} must have gradient materials`);
  assert.match(svg, /<radialGradient\b/, `${name} must have the shared soft glow`);
  assert.match(svg, /<title>[^<]+<\/title>/, `${name} must have an accessible title`);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|data:image\/|(?:href|src)="https?:\/\//i, `${name} must not embed scripts, remote references or raster images`);
}
assert.match(iconSource, /\/icons\/\$\{name\}\.svg/, 'UI must use the standalone asset (single source of truth)');
assert.match(read('web/app/icon.svg'), /<linearGradient\b/, 'The site favicon must use the brand gradients');
assert.match(home, /<ServiceIcon name=\{slug\}/, 'Product cards need their icons');
assert.match(nav, /<ServiceIcon name=\{slug\}/, 'Quick navigation needs its icons');
assert.match(servicePage, /icons: \{ icon: `\/icons\/\$\{service\}\.svg`/, 'Service pages should use their own favicon');
assert.match(servicePage, /className="picoProductTheme"/, 'Service pages should show product branding');
assert.match(mockPage, /icons\/mock\.svg/);
assert.match(hooksPage, /icons\/hooks\.svg/);
console.log('PicoSvc rich SVG icons OK: 16 standalone service assets, branded favicon, responsive UI integration.');
