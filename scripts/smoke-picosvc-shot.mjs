// Run against a deployed Worker with a dedicated Screenshot API key.
// Usage: PICOSVC_SHOT_API_KEY=pss_... PICOSVC_API_URL=https://your-worker.example node --experimental-strip-types scripts/smoke-picosvc-shot.mjs
import assert from 'node:assert/strict';
import { inspectShot } from '../src/picosvc/shot-image-quality.ts';

const token = process.env.PICOSVC_SHOT_API_KEY || '';
const origin = (process.env.PICOSVC_API_URL || '').replace(/\/$/, '');
const target = process.env.PICOSVC_SHOT_TEST_URL || 'https://example.com/';
if (!/^pss_[A-Za-z0-9_-]{32}$/.test(token) || !origin.startsWith('https://')) {
  console.error('Set PICOSVC_SHOT_API_KEY and PICOSVC_API_URL (https://...).');
  process.exitCode = 2;
} else {
  async function capture(format) {
    const response = await fetch(`${origin}/api/picosvc/shot`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: target, format, width: 1280, height: 720, fullPage: false, waitUntil: 'networkidle2', waitMs: 900 }),
      signal: AbortSignal.timeout(100_000),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`${format.toUpperCase()} smoke returned HTTP ${response.status}: ${message.slice(0, 400)}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const inspection = await inspectShot(bytes, format);
    assert.ok(inspection.ok, `${format.toUpperCase()} response is not a valid ${format.toUpperCase()} file: ${inspection.reason || 'unknown error'}`);
    assert.equal(inspection.blank, false, `${format.toUpperCase()} response is entirely white`);
    console.log(`${format.toUpperCase()} OK: ${bytes.byteLength} bytes${inspection.width ? `, ${inspection.width}x${inspection.height}` : ''}`);
  }
  try {
    await capture('png');
    if (process.env.PICOSVC_SHOT_SMOKE_PDF === '1') await capture('pdf');
    console.log('Live Screenshot API smoke passed.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
