#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FACTORY_URL = (process.env.FACTORY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const BRANCH = process.env.E2E_BRANCH || 'bridge-e2e-proof';
const FIXTURE = resolve('fixtures/bridge-e2e-mcp/node_modules/@modelcontextprotocol/sdk');
const USER = 'factory-bridge-e2e-user';

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

async function waitForDeployment(id) {
  let previous = '';
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const deployments = await api('/api/servers');
    const row = deployments.find((item) => item.id === id);
    if (!row) throw new Error(`Deployment ${id} disappeared`);
    const state = `${row.status}/${row.detected_runtime || '-'}/${row.edge_status || '-'}`;
    if (state !== previous) {
      console.log(`deployment: ${state}`);
      previous = state;
    }
    if (row.status === 'ready') return row;
    if (row.status === 'error' || row.detected_runtime === 'local-bound') {
      throw new Error(`Deployment failed: ${JSON.stringify(row, null, 2)}`);
    }
    await sleep(3000);
  }
  throw new Error('Timed out waiting for deployment');
}

async function main() {
  console.log(`Factory: ${FACTORY_URL}`);
  console.log(`Fixture branch: ${BRANCH}`);

  const created = await api('/api/servers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      repoUrl: 'https://github.com/YAMA-TANA/remote-mcp-factory',
      branch: BRANCH,
      subdir: 'fixtures/bridge-e2e-mcp',
      visibility: 'public',
      name: 'bridge-e2e-proof',
    }),
  });
  if (!created?.id) throw new Error(`Create returned no id: ${JSON.stringify(created)}`);
  console.log(`created deployment: ${created.id}`);

  const row = await waitForDeployment(created.id);
  if (row.detected_runtime !== 'edge-node-bridge') {
    throw new Error(`Expected edge-node-bridge, got ${row.detected_runtime}: ${JSON.stringify(row, null, 2)}`);
  }

  const compatibility = await api(`/api/servers/${created.id}/compatibility`);
  if (compatibility?.compatibility?.runtime !== 'edge-with-bridge') {
    throw new Error(`Expected verified edge-with-bridge compatibility: ${JSON.stringify(compatibility, null, 2)}`);
  }
  console.log(`compatibility: ${compatibility.compatibility.summary}`);

  const bridgeStatus = await api(`/api/servers/${created.id}/bridge-status`);
  if (!bridgeStatus?.capabilities?.ffprobe?.available) {
    throw new Error(`ffprobe is not available in the real Bridge Sandbox: ${JSON.stringify(bridgeStatus, null, 2)}`);
  }
  console.log(`bridge ffprobe: ${bridgeStatus.capabilities.ffprobe.version}`);

  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import(pathToFileURL(resolve(FIXTURE, 'dist/esm/client/index.js')).href),
    import(pathToFileURL(resolve(FIXTURE, 'dist/esm/client/streamableHttp.js')).href),
  ]);
  const client = new Client({ name: 'factory-full-e2e', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${FACTORY_URL}/mcp/${created.id}`));
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    if (!listed.tools.some((tool) => tool.name === 'probe_base64')) {
      throw new Error(`probe_base64 missing from tools/list: ${JSON.stringify(listed)}`);
    }

    const wav = makeWav();
    const result = await client.callTool({
      name: 'probe_base64',
      arguments: { dataBase64: wav.toString('base64') },
    });
    const text = Array.isArray(result.content)
      ? result.content.find((item) => item.type === 'text')?.text
      : null;
    if (!text) throw new Error(`Tool returned no text content: ${JSON.stringify(result)}`);
    const metadata = JSON.parse(text);
    console.log(`tool result: ${JSON.stringify(metadata)}`);

    if (metadata.audioCodec !== 'pcm_s16le') throw new Error(`Unexpected codec: ${metadata.audioCodec}`);
    if (metadata.sampleRate !== 8000) throw new Error(`Unexpected sample rate: ${metadata.sampleRate}`);
    if (!(metadata.duration > 0.20 && metadata.duration < 0.35)) {
      throw new Error(`Unexpected duration: ${metadata.duration}`);
    }
    if (!String(metadata.formatName || '').includes('wav')) {
      throw new Error(`Unexpected format: ${metadata.formatName}`);
    }
  } finally {
    await client.close().catch(() => undefined);
  }

  console.log('PASS full Factory E2E: GitHub clone -> rewrite -> Edge -> signed Binary Bridge -> real ffprobe -> MCP tool result');
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
