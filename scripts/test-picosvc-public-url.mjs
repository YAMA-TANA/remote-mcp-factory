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

  // Same-origin redirects must continue to support authenticated Cron targets.
  const sameOrigin = [];
  globalThis.fetch = async (url, options) => {
    sameOrigin.push({ url, options });
    return sameOrigin.length === 1
      ? new Response(null, { status: 307, headers: { location: '/next' } })
      : new Response('ok');
  };
  assert.equal((await fetchPublic('https://example.com/start', {
    method: 'POST', headers: { 'x-api-key': 'same-origin-secret' }, body: 'important-payload',
  })).status, 200);
  assert.equal(sameOrigin.length, 2);
  assert.equal(sameOrigin[1].url, 'https://example.com/next');
  assert.equal(new Headers(sameOrigin[1].options.headers).get('x-api-key'), 'same-origin-secret');
  assert.equal(sameOrigin[1].options.body, 'important-payload');
  assert.equal(sameOrigin[1].options.redirect, 'manual');

  // POST payloads and custom headers must never reach an attacker-controlled origin.
  const postRequests = [];
  globalThis.fetch = async (url, options) => {
    postRequests.push({ url, options });
    return new Response(null, { status: 307, headers: { location: 'https://other.example/collect' } });
  };
  await assert.rejects(fetchPublic('https://example.com/start', {
    method: 'POST', headers: { 'x-api-key': 'do-not-forward' }, body: 'do-not-forward',
  }), /Cross-origin redirect is not permitted/);
  assert.equal(postRequests.length, 1);
  assert.equal(postRequests[0].url, 'https://example.com/start');

  // GET remains usable across public origins, but ALL custom headers are stripped.
  // They must remain stripped even when a subsequent redirect returns home.
  const getRequests = [];
  globalThis.fetch = async (url, options) => {
    getRequests.push({ url, options });
    if (getRequests.length === 1) return new Response(null, { status: 302, headers: { location: 'https://other.example/path' } });
    if (getRequests.length === 2) return new Response(null, { status: 301, headers: { location: 'https://example.com/final' } });
    return new Response('ok');
  };
  const headers = new Headers({ authorization: 'Bearer private', 'x-api-key': 'private', accept: 'text/html' });
  assert.equal((await fetchPublic('https://example.com/start', { headers, credentials: 'include' })).status, 200);
  assert.equal(getRequests.length, 3);
  assert.equal(new Headers(getRequests[0].options.headers).get('x-api-key'), 'private');
  for (const request of getRequests.slice(1)) {
    assert.equal(new Headers(request.options.headers).has('authorization'), false);
    assert.equal(new Headers(request.options.headers).has('x-api-key'), false);
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.redirect, 'manual');
  }

  // Non-redirect 3xx statuses must not be mistaken for navigable redirects.
  requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(null, { status: 304, headers: { location: 'https://other.example/' } });
  };
  assert.equal((await fetchPublic('https://example.com/')).status, 304);
  assert.equal(requests, 1);
} finally { globalThis.fetch = originalFetch; }
console.log('PicoSvc URL guard OK: private targets blocked; redirect bodies/credentials stay on their original origin.');
