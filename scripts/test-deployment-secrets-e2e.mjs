#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FACTORY_URL = (process.env.FACTORY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const BRANCH = process.env.E2E_BRANCH || 'main';
const FIXTURE_SDK = resolve('fixtures/bridge-e2e-mcp/node_modules/@modelcontextprotocol/sdk');
const USER = 'factory-secret-e2e-user';
const SECRET_V1 = 'moon-rabbit-secret-v1';
const SECRET_V2 = 'moon-rabbit-secret-v2';

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

async function waitForDeployment(id) {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const deployments = await api('/api/servers');
    const row = deployments.find((item) => item.id === id);
    if (!row) throw new Error(`Deployment ${id} disappeared`);
    if (row.status === 'ready') return row;
    if (row.status === 'error') throw new Error(`Deployment failed: ${JSON.stringify(row, null, 2)}`);
    await sleep(2500);
  }
  throw new Error(`Timed out waiting for deployment ${id}`);
}

async function mcpClient(id) {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import(pathToFileURL(resolve(FIXTURE_SDK, 'dist/esm/client/index.js')).href),
    import(pathToFileURL(resolve(FIXTURE_SDK, 'dist/esm/client/streamableHttp.js')).href),
  ]);
  const client = new Client({ name: 'factory-secret-e2e', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${FACTORY_URL}/mcp/${id}`));
  await client.connect(transport);
  return client;
}

function textResult(result) {
  const text = Array.isArray(result?.content)
    ? result.content.find((item) => item.type === 'text')?.text
    : null;
  if (!text) throw new Error(`Tool returned no text content: ${JSON.stringify(result)}`);
  return JSON.parse(text);
}

async function readSecretStatus(id) {
  const client = await mcpClient(id);
  try {
    const listed = await client.listTools();
    if (!listed.tools.some((tool) => tool.name === 'secret_status')) {
      throw new Error(`secret_status missing from tools/list: ${JSON.stringify(listed)}`);
    }
    return textResult(await client.callTool({ name: 'secret_status', arguments: {} }));
  } finally {
    await client.close().catch(() => undefined);
  }
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
      subdir: 'fixtures/secret-e2e-mcp',
      visibility: 'public',
      name: 'deployment-secret-e2e',
      secrets: { FACTORY_E2E_SECRET: SECRET_V1 },
    }),
  });
  if (!created?.id) throw new Error(`Create returned no id: ${JSON.stringify(created)}`);
  if (JSON.stringify(created).includes(SECRET_V1)) throw new Error('Create response leaked plaintext secret');
  if (!created.secretNames?.includes('FACTORY_E2E_SECRET')) {
    throw new Error(`Create response did not list secret name: ${JSON.stringify(created)}`);
  }

  const ready = await waitForDeployment(created.id);
  console.log(`deployment ${created.id}: ${ready.status}/${ready.detected_runtime}/${ready.edge_status || '-'}`);
  if (ready.detected_runtime !== 'edge-node') {
    throw new Error(`Secret-dependent fixture should compile to Edge, got ${ready.detected_runtime}: ${JSON.stringify(ready, null, 2)}`);
  }

  const listedV1 = await api(`/api/servers/${created.id}/secrets`);
  if (JSON.stringify(listedV1).includes(SECRET_V1)) throw new Error('Secret list leaked plaintext value');
  if (JSON.stringify(listedV1.names) !== JSON.stringify(['FACTORY_E2E_SECRET'])) {
    throw new Error(`Unexpected secret names: ${JSON.stringify(listedV1)}`);
  }

  const statusV1 = await readSecretStatus(created.id);
  console.log(`runtime secret v1: ${JSON.stringify(statusV1)}`);
  if (!statusV1.present || statusV1.tag !== 'v1' || statusV1.length !== SECRET_V1.length) {
    throw new Error(`Initial secret did not reach Edge runtime: ${JSON.stringify(statusV1)}`);
  }

  const updated = await api(`/api/servers/${created.id}/secrets`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secrets: { FACTORY_E2E_SECRET: SECRET_V2 } }),
  });
  if (JSON.stringify(updated).includes(SECRET_V2)) throw new Error('Secret update response leaked plaintext value');

  const statusV2 = await readSecretStatus(created.id);
  console.log(`runtime secret v2: ${JSON.stringify(statusV2)}`);
  if (!statusV2.present || statusV2.tag !== 'v2' || statusV2.length !== SECRET_V2.length) {
    throw new Error(`Updated secret did not invalidate/reload Edge runtime: ${JSON.stringify(statusV2)}`);
  }

  const removed = await api(`/api/servers/${created.id}/secrets/FACTORY_E2E_SECRET`, { method: 'DELETE' });
  if (!Array.isArray(removed.names) || removed.names.length !== 0) {
    throw new Error(`Secret delete failed: ${JSON.stringify(removed)}`);
  }

  console.log('PASS deployment secrets E2E: encrypted create -> Edge smoke -> runtime injection -> name-only API -> live rotation -> delete');
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
