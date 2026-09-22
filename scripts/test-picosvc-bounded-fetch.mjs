import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedResponse, ResponseLimitError } from '../src/picosvc/bounded-response.ts';

const file = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routes = file('src/picosvc/routes.ts');
const fetchRoute = file('src/picosvc/fetch-reliable.ts');
assert.ok(routes.includes('reliableFetchRoute,'), 'Reliable Fetch must be registered');
assert.ok(routes.indexOf('reliableFetchRoute,') < routes.indexOf('utilityAdvancedManagementRoutes,'), 'Bounded Fetch must intercept legacy unbounded handler');
assert.match(fetchRoute, /acquireBrowserLease\(/, 'Browser runs must acquire an account-wide lease');
assert.match(fetchRoute, /await env\.BROWSER!\.quickAction/, 'Await provider completion before releasing the lease');
assert.match(fetchRoute, /actionTimeout: actionMs/, 'Set a separate provider-side action timeout');
assert.doesNotMatch(fetchRoute, /Promise\.race\(/, 'Never orphan a billable browser action after a response-only timeout');
assert.match(fetchRoute, /readBoundedResponse\(response, MAX_BYTES, controller\.signal\)/, 'Both formats must stream with the same abort signal');
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
console.log('PicoSvc Fetch limits, abortable streaming, and non-orphaning Browser Run behavior OK.');
