#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FACTORY_URL = (process.env.FACTORY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const BRANCH = process.env.E2E_BRANCH || 'main';
const FIXTURE_SDK = resolve('fixtures/bridge-e2e-mcp/node_modules/@modelcontextprotocol/sdk');
let USER = 'factory-bridge-e2e-probe-user';

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function api(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('x-dev-user', USER);
  const response = await fetch(`${FACTORY_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${text}`);
  return body;
}

function makeWav({ sampleRate = 8000, durationSeconds = 0.25, frequency = 440 } = {}) {
  const samples = Math.round(sampleRate * durationSeconds);
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataBytes = samples * blockAlign;
  const out = Buffer.alloc(44 + dataBytes);
  let o = 0;
  out.write('RIFF', o); o += 4;
  out.writeUInt32LE(36 + dataBytes, o); o += 4;
  out.write('WAVE', o); o += 4;
  out.write('fmt ', o); o += 4;
  out.writeUInt32LE(16, o); o += 4;
  out.writeUInt16LE(1, o); o += 2;
  out.writeUInt16LE(channels, o); o += 2;
  out.writeUInt32LE(sampleRate, o); o += 4;
  out.writeUInt32LE(byteRate, o); o += 4;
  out.writeUInt16LE(blockAlign, o); o += 2;
  out.writeUInt16LE(bitsPerSample, o); o += 2;
  out.write('data', o); o += 4;
  out.writeUInt32LE(dataBytes, o); o += 4;
  for (let i = 0; i < samples; i++) {
    const value = Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.25 * 32767);
    out.writeInt16LE(value, o);
    o += 2;
  }
  return out;
}

function textResult(result) {
  const text = Array.isArray(result?.content)
    ? result.content.find((item) => item.type === 'text')?.text
    : null;
  if (!text) throw new Error(`Tool returned no text content: ${JSON.stringify(result)}`);
  return JSON.parse(text);
}

async function waitForDeployment(id) {
  let previous = '';
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const deployments = await api('/api/servers');
    const row = deployments.find((item) => item.id === id);
    if (!row) throw new Error(`Deployment ${id} disappeared`);
    const state = `${row.status}/${row.detected_runtime || '-'}/${row.edge_status || '-'}`;
    if (state !== previous) {
      console.log(`deployment ${id}: ${state}`);
      previous = state;
    }
    if (row.status === 'ready') return row;
    if (row.status === 'error' || row.detected_runtime === 'local-bound') {
      throw new Error(`Deployment failed: ${JSON.stringify(row, null, 2)}`);
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for deployment ${id}`);
}

async function createDeployment(subdir, name) {
  const created = await api('/api/servers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      repoUrl: 'https://github.com/YAMA-TANA/remote-mcp-factory',
      branch: BRANCH,
      subdir,
      visibility: 'public',
      name,
    }),
  });
  if (!created?.id) throw new Error(`Create returned no id: ${JSON.stringify(created)}`);
  console.log(`created deployment: ${created.id} (${subdir})`);
  const row = await waitForDeployment(created.id);
  if (row.detected_runtime !== 'edge-node-bridge') {
    throw new Error(`Expected edge-node-bridge, got ${row.detected_runtime}: ${JSON.stringify(row, null, 2)}`);
  }
  return { created, row };
}

async function assertCompatibility(id, expectedCommand) {
  const compatibility = await api(`/api/servers/${id}/compatibility`);
  if (compatibility?.compatibility?.runtime !== 'edge-with-bridge') {
    throw new Error(`Expected verified edge-with-bridge compatibility: ${JSON.stringify(compatibility, null, 2)}`);
  }
  const commands = compatibility?.compatibility?.bridgeCommands;
  if (!Array.isArray(commands) || commands.length !== 1 || commands[0] !== expectedCommand) {
    throw new Error(`Expected ${expectedCommand} bridge command: ${JSON.stringify(compatibility, null, 2)}`);
  }
  console.log(`compatibility ${id}: ${compatibility.compatibility.summary}`);
}

async function mcpClient(id) {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import(pathToFileURL(resolve(FIXTURE_SDK, 'dist/esm/client/index.js')).href),
    import(pathToFileURL(resolve(FIXTURE_SDK, 'dist/esm/client/streamableHttp.js')).href),
  ]);
  const client = new Client({ name: 'factory-full-e2e', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${FACTORY_URL}/mcp/${id}`));
  await client.connect(transport);
  return client;
}

async function testProbe(wavBase64) {
  USER = 'factory-bridge-e2e-probe-user';
  const { created } = await createDeployment('fixtures/bridge-e2e-mcp', 'bridge-ffprobe-e2e');
  await assertCompatibility(created.id, 'ffprobe');

  const bridgeStatus = await api(`/api/servers/${created.id}/bridge-status`);
  if (!bridgeStatus?.capabilities?.ffprobe?.available) {
    throw new Error(`ffprobe is not available in the real Bridge Sandbox: ${JSON.stringify(bridgeStatus, null, 2)}`);
  }
  console.log(`bridge ffprobe: ${bridgeStatus.capabilities.ffprobe.version}`);

  const client = await mcpClient(created.id);
  try {
    const listed = await client.listTools();
    for (const expected of ['probe_base64', 'attempt_transcode_scope']) {
      if (!listed.tools.some((tool) => tool.name === expected)) {
        throw new Error(`${expected} missing from tools/list: ${JSON.stringify(listed)}`);
      }
    }

    const metadata = textResult(await client.callTool({
      name: 'probe_base64',
      arguments: { dataBase64: wavBase64 },
    }));
    console.log(`probe tool result: ${JSON.stringify(metadata)}`);

    if (metadata.audioCodec !== 'pcm_s16le') throw new Error(`Unexpected codec: ${metadata.audioCodec}`);
    if (metadata.sampleRate !== 8000) throw new Error(`Unexpected sample rate: ${metadata.sampleRate}`);
    if (!(metadata.duration > 0.20 && metadata.duration < 0.35)) {
      throw new Error(`Unexpected duration: ${metadata.duration}`);
    }
    if (!String(metadata.formatName || '').includes('wav')) {
      throw new Error(`Unexpected format: ${metadata.formatName}`);
    }

    const scopeAttempt = textResult(await client.callTool({
      name: 'attempt_transcode_scope',
      arguments: { dataBase64: wavBase64 },
    }));
    console.log(`probe scope isolation: ${JSON.stringify(scopeAttempt)}`);
    if (scopeAttempt.configured !== true || scopeAttempt.status !== 401) {
      throw new Error(`Probe-scoped token unexpectedly reached transcode: ${JSON.stringify(scopeAttempt)}`);
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function testTranscode(wavBase64) {
  USER = 'factory-bridge-e2e-transcode-user';
  const { created } = await createDeployment('fixtures/bridge-ffmpeg-e2e-mcp', 'bridge-ffmpeg-e2e');
  await assertCompatibility(created.id, 'ffmpeg');

  const bridgeStatus = await api(`/api/servers/${created.id}/bridge-status`);
  if (!bridgeStatus?.capabilities?.ffmpeg?.available) {
    throw new Error(`ffmpeg is not available in the real Bridge Sandbox: ${JSON.stringify(bridgeStatus, null, 2)}`);
  }
  console.log(`bridge ffmpeg: ${bridgeStatus.capabilities.ffmpeg.version}`);

  const client = await mcpClient(created.id);
  try {
    const listed = await client.listTools();
    for (const expected of ['transcode_base64', 'attempt_probe_scope']) {
      if (!listed.tools.some((tool) => tool.name === expected)) {
        throw new Error(`${expected} missing from tools/list: ${JSON.stringify(listed)}`);
      }
    }

    const output = textResult(await client.callTool({
      name: 'transcode_base64',
      arguments: { dataBase64: wavBase64 },
    }));
    console.log(`transcode tool result: mime=${output.mimeType} bytes=${output.bytes}`);
    if (output.mimeType !== 'audio/mpeg') throw new Error(`Unexpected transcode mime: ${output.mimeType}`);
    if (!Number.isInteger(output.bytes) || output.bytes <= 100) throw new Error(`Unexpected transcode size: ${output.bytes}`);
    if (typeof output.dataBase64 !== 'string' || output.dataBase64.length < 100) throw new Error('Transcode returned no MP3 data');

    const verified = await api(`/api/servers/${created.id}/bridge/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataBase64: output.dataBase64, filename: 'output.mp3' }),
    });
    const audio = Array.isArray(verified?.result?.streams)
      ? verified.result.streams.find((stream) => stream.codec_type === 'audio')
      : null;
    console.log(`transcoded MP3 verified codec=${audio?.codec_name || '-'} format=${verified?.result?.format?.format_name || '-'}`);
    if (audio?.codec_name !== 'mp3') throw new Error(`Transcoded output is not MP3: ${JSON.stringify(verified)}`);

    const scopeAttempt = textResult(await client.callTool({
      name: 'attempt_probe_scope',
      arguments: { dataBase64: wavBase64 },
    }));
    console.log(`transcode scope isolation: ${JSON.stringify(scopeAttempt)}`);
    if (scopeAttempt.configured !== true || scopeAttempt.status !== 401) {
      throw new Error(`Transcode-scoped token unexpectedly reached probe: ${JSON.stringify(scopeAttempt)}`);
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function main() {
  console.log(`Factory: ${FACTORY_URL}`);
  console.log(`Fixture branch: ${BRANCH}`);
  const wavBase64 = makeWav().toString('base64');

  await testProbe(wavBase64);
  await testTranscode(wavBase64);

  console.log('PASS full Factory E2E: ffprobe + ffmpeg source rewrite -> Edge -> operation-scoped Binary Bridge -> real binaries -> cross-operation denial -> MCP tool results');
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
