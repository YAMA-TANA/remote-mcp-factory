import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { captureResponseFormat, resultFilename, shellQuote, shotExamples, validatePublicInput } from '../web/app/fetch-shot-results.ts';

assert.equal(validatePublicInput('https://example.com/a?x=1'), 'https://example.com/a?x=1');
for (const bad of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.com/', 'https://example.com/#secret', 'not a URL']) {
  assert.equal(validatePublicInput(bad), null, `reject invalid or credential-bearing URL: ${bad}`);
}
assert.equal(resultFilename('fetch', 'https://example.com/secret?token=SUPERSECRET', 'md'), 'picosvc-fetch-example.com.md');
assert.equal(resultFilename('capture', 'https://EXAMPLE.COM/path', 'pdf'), 'picosvc-capture-example.com.pdf');
assert.equal(resultFilename('fetch', 'invalid', 'json'), 'picosvc-fetch-result.json');
assert.equal(captureResponseFormat('image/png; charset=binary'), 'png');
assert.equal(captureResponseFormat('application/pdf'), 'pdf');
assert.equal(captureResponseFormat('text/html'), null);
assert.equal(captureResponseFormat('image/png-fake'), null);

const dangerous = `https://example.com/it's-a-path?name=\"quoted\"&x=$HOME`;
const quoted = shellQuote(dangerous);
const echo = spawnSync('sh', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' });
assert.equal(echo.status, 0);
assert.equal(echo.stdout, dangerous, 'shell quoting must preserve apostrophes and shell metacharacters');
const normalized = validatePublicInput(dangerous);
assert.ok(normalized);
const examples = shotExamples('https://api.example.com/api/picosvc/shot', dangerous, 'png', true);
const json = JSON.stringify({ url: normalized, format: 'png', fullPage: true, waitUntil: 'networkidle2', waitMs: 900 });
assert.ok(examples.curl.includes(shellQuote(json)), 'cURL payload must quote the normalized request URL');
assert.ok(examples.javascript.includes(`body: JSON.stringify(${json})`), 'JavaScript uses a JSON literal with the normalized request URL');
assert.ok(examples.javascript.includes('process.env.PICOSVC_SHOT_API_KEY'));
assert.ok(!examples.javascript.includes(`url: '${dangerous}'`));
const pdf = shotExamples('https://api.example.com/api/picosvc/shot', dangerous, 'pdf', true);
assert.ok(pdf.curl.includes('--output capture.pdf'));
assert.ok(pdf.javascript.includes('"fullPage":false'), 'PDF examples must omit PNG-only full-page setting');
const invalid = shotExamples('https://api.example.com/api/picosvc/shot', 'https://user:pass@example.com', 'png', false);
assert.ok(invalid.curl.includes('https://example.com/'), 'Never include credentials in generated examples');

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fetchPage = read('web/app/fetch-workspace.tsx');
const shotPage = read('web/app/shot-workspace.tsx');
assert.match(fetchPage, /downloadTextResult\(resultText\(\)/);
assert.match(fetchPage, /resultFilename\('fetch', result\.source, extension\)/);
assert.match(fetchPage, /const META_KEYS = \[/);
assert.match(fetchPage, /if \(requestSequence\.current === current\) setResult/);
assert.match(fetchPage, /if \(!signedIn\) \{ requestSequence\.current \+= 1; setResult\(null\)/);
assert.match(shotPage, /setCapturedFormat\(returnedFormat\)/);
assert.match(shotPage, /capturedFormat === 'png' \?/);
assert.match(shotPage, /download=\{resultFilename\('capture', capturedSource, capturedFormat\)\}/);
assert.match(shotPage, /shotExamples\(endpoint, url, format, fullPage\)/);
assert.match(shotPage, /captureSequence\.current !== current/);
assert.match(shotPage, /URL\.revokeObjectURL\(fileRef\.current\)/);
assert.match(shotPage, /role="alert"/);
assert.match(shotPage, /shotFormFields" disabled=\{busy\}/);
console.log('PicoSvc Fetch/Shot: safe filenames, MIME, shell/JS examples, result snapshots, lifecycle guards and download UI OK.');
