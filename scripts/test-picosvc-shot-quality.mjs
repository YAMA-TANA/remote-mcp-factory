import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { inspectShot } from '../src/picosvc/shot-image-quality.ts';

const ROOT = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const BE = (number) => Buffer.from([(number >>> 24) & 255, (number >>> 16) & 255, (number >>> 8) & 255, number & 255]);
const chunk = (kind, bytes) => Buffer.concat([BE(bytes.length), Buffer.from(kind), bytes, Buffer.alloc(4)]);
function screenshot({ width = 128, height = 128, white = true } = {}) {
  const ihdr = Buffer.concat([BE(width), BE(height), Buffer.from([8, 2, 0, 0, 0])]);
  const scan = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) scan[y * (width * 3 + 1)] = 0;
  if (!white) scan[1] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scan)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const white = await inspectShot(screenshot({ white: true }), 'png');
assert.equal(white.ok, true);
assert.equal(white.blank, true, 'Valid white PNG must not be delivered as a successful capture');
assert.equal(white.width, 128);
const content = await inspectShot(screenshot({ white: false }), 'png');
assert.equal(content.ok, true);
assert.equal(content.blank, false, 'A visible pixel means the screenshot is not blank');
assert.equal((await inspectShot(Buffer.alloc(150), 'png')).ok, false, 'Do not return JSON or HTML as a PNG');
assert.equal((await inspectShot(Buffer.from('%PDF-1.7\n'.padEnd(180, ' ')), 'pdf')).ok, true);
assert.equal((await inspectShot(Buffer.from('not a PDF'.padEnd(180, ' ')), 'pdf')).ok, false);

const route = source('src/picosvc/shot-quality.ts');
const router = source('src/picosvc/routes.ts');
const migration = source('migrations/0029_picosvc_shot_api_keys.sql');
const page = source('web/app/[locale]/[service]/page.tsx');
assert.ok(router.indexOf('shotQualityManagementRoutes,') < router.indexOf('utilityAdvancedManagementRoutes,'), 'Quality handler must run before legacy screenshot handler');
assert.match(route, /waitUntil.*networkidle2|networkidle2.*waitUntil/s, 'Screenshot must wait for JavaScript-heavy pages by default');
assert.match(route, /blank_capture/, 'Blank screenshot must return an explicit error');
assert.match(route, /token_hash/, 'Screenshot API keys must be hashed');
assert.match(route, /revoked_at/, 'Screenshot API keys must be revocable');
assert.match(route, /consumeUsage/, 'Automated screenshots must count against the owner quota');
assert.match(migration, /CREATE TABLE IF NOT EXISTS shot_api_keys/, 'API keys require an additive database migration');
assert.match(page, /service === 'shot' \? <ShotWorkspace/, 'Dedicated API-first Screenshot workspace must be linked');
console.log('Screenshot quality OK: blank/visible/invalid PNG, PDF signatures, scoped API keys and routing.');
