import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_FETCH_REQUEST_BYTES, readBoundedResponse, readFetchJson, ResponseLimitError } from '../src/picosvc/bounded-response.ts';
import { appearsBinary } from '../src/picosvc/fetch-safety.ts';

const file = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routes = file('src/picosvc/routes.ts');
const fetchRoute = file('src/picosvc/fetch-reliable.ts');
assert.ok(routes.includes('reliableFetchRoute,'), 'Reliable Fetch must be registered');
assert.ok(routes.indexOf('reliableFetchRoute,') < routes.indexOf('utilityAdvancedManagementRoutes,'), 'Bounded Fetch must intercept legacy unbounded handler');
assert.match(fetchRoute, /Promise\.race\(\[perform\(\), deadline\]\)/, 'Deadline must cover the complete operation');
assert.match(fetchRoute, /readBoundedResponse\(response, MAX_BYTES, controller\.signal\)/, 'Both formats must stream with the same abort signal');
assert.match(fetchRoute, /readFetchJson\(request\)/, 'Input must pass through the bounded JSON reader');
assert.doesNotMatch(fetchRoute, /request\.json\(\)/, 'Do not buffer unbounded JSON before validation');
assert.match(fetchRoute, /appearsBinary\(bytes, contentType\)/, 'Missing or false MIME types must not turn binary data into metadata');
assert.match(fetchRoute, /unsupported_content_type/, 'Do not treat binary documents as web page metadata');
assert.match(fetchRoute, /empty_content/, 'Do not return successful empty pages');
assert.doesNotMatch(fetchRoute, /response\.arrayBuffer\(\)|response\.text\(\)/, 'Do not buffer the unbounded response first');

const chunks = (...values) => new Response(new ReadableStream({
  start(controller) { for (const value of values) controller.enqueue(new TextEncoder().encode(value)); controller.close(); },
}));
assert.equal(new TextDecoder().decode(await readBoundedResponse(chunks('a', 'bc'), 3)), 'abc', 'Exact limit must work');
assert.equal((await readBoundedResponse(chunks(''), 3)).byteLength, 0, 'Empty response is detectable by the caller');
await assert.rejects(readBoundedResponse(chunks('abc', 'd'), 3), ResponseLimitError, 'Streaming over limit must fail');
await assert.rejects(readBoundedResponse(new Response('abc', { headers: { 'content-length': '9999999' } }), 3), ResponseLimitError, 'Declared oversize must fail before reading');
let cancelled = false;
const controller = new AbortController();
const neverEnding = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
const pending = readBoundedResponse(neverEnding, 3, controller.signal);
controller.abort();
await assert.rejects(pending, { name: 'AbortError' }, 'Abort must interrupt a hung response stream');
assert.equal(cancelled, true, 'Abort must cancel the upstream stream');

const post = (body, headers = {}) => new Request('https://example.com/api/picosvc/fetch', {
  method: 'POST', body, headers: { 'content-type': 'application/json', ...headers },
});
const valid = await readFetchJson(post(JSON.stringify({ url: 'https://example.com/', format: 'metadata' })));
assert.deepEqual(valid, { ok: true, value: { url: 'https://example.com/', format: 'metadata' } });
assert.deepEqual(await readFetchJson(post('{')), {
  ok: false, code: 'invalid_request', message: 'A valid JSON request body is required.', status: 400,
}, 'Malformed JSON must produce a client error');
assert.equal((await readFetchJson(post(''))).ok, false, 'Empty JSON must be rejected');
assert.equal((await readFetchJson(post('"\ufffd"'))).ok, true, 'Valid Unicode JSON is accepted');
const declaredHuge = await readFetchJson(post('{}', { 'content-length': String(MAX_FETCH_REQUEST_BYTES + 1) }));
assert.equal(declaredHuge.ok, false);
assert.equal(declaredHuge.status, 413, 'Oversize Content-Length must return 413');
const streamedHuge = new Request('https://example.com/api/picosvc/fetch', {
  method: 'POST',
  body: new ReadableStream({
    start(stream) {
      stream.enqueue(new TextEncoder().encode('{"data":"'));
      stream.enqueue(new Uint8Array(MAX_FETCH_REQUEST_BYTES).fill(65));
      stream.close();
    },
  }),
  duplex: 'half',
});
assert.equal((await readFetchJson(streamedHuge)).status, 413, 'Chunked input without Content-Length must also be capped');

const encode = text => new TextEncoder().encode(text);
assert.equal(appearsBinary(encode('<html><title>日本語</title></html>'), null), false, 'HTML with UTF-8 must be accepted without a MIME header');
assert.equal(appearsBinary(encode('line 1\nline 2\tvalue'), 'text/plain'), false, 'Normal plain text is allowed');
assert.equal(appearsBinary(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x1a]), null), true, 'MIME-less PNG must be detected');
assert.equal(appearsBinary(Uint8Array.from([0x00, 0x3c, 0x00, 0x68]), 'text/html; charset=utf-16be'), false, 'Declared UTF-16 text is permitted');
console.log('PicoSvc Fetch request/response limits, abortable streaming, and binary detection OK.');
