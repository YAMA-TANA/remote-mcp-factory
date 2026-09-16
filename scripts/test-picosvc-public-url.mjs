import assert from 'node:assert/strict';
import { safePublicUrl, fetchPublic } from '../src/picosvc/security.ts';

for (const target of [
  'http://localhost/', 'http://localhost./', 'http://127.0.0.1/',
  'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/',
  'http://10.1.2.3/', 'http://169.254.169.254/latest/meta-data/',
  'http://172.16.0.1/', 'http://192.168.0.1/', 'http://100.64.0.1/',
  'http://192.0.2.1/', 'http://198.51.100.1/', 'http://203.0.113.1/',
  'http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/',
  'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/',
  'http://[::ffff:10.0.0.1]/', 'http://[64:ff9b::7f00:1]/',
  'http://[2002:7f00:1::]/', 'http://[2001:0:7f00:1::]/',
  'https://user:password@example.com/', 'http://example.com:8080/',
  'file:///etc/passwd', 'https://metadata.google.internal/',
]) {
  assert.equal(safePublicUrl(target), null, `Must reject non-public URL ${target}`);
}
for (const target of [
  'https://example.com/', 'http://1.1.1.1/', 'https://8.8.8.8/',
  'https://[2606:4700:4700::1111]/', 'https://example.com:443/path',
]) {
  assert.ok(safePublicUrl(target), `Public URL should remain allowed ${target}`);
}

const originalFetch = globalThis.fetch;
let requests = 0;
try {
  globalThis.fetch = async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: 'http://[::ffff:127.0.0.1]/private' } });
  };
  await assert.rejects(fetchPublic('https://example.com/'), /Redirect target is not a permitted public URL/);
  assert.equal(requests, 1, 'Never follow redirect to private IP');
  await assert.rejects(fetchPublic('http://[::ffff:10.0.0.1]/'), /URL must be a public HTTP/);
  assert.equal(requests, 1, 'Never dispatch a rejected private IP request');
} finally { globalThis.fetch = originalFetch; }
console.log('PicoSvc URL guard OK: mapped/private addresses and unsafe redirects blocked; public IPv6 preserved.');
