#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';

const FACTORY_URL = (process.env.FACTORY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const REPORT_DIR = process.env.REPORT_DIR || 'reports';
const TIMEOUT_MS = Number(process.env.REPO_TIMEOUT_MS || 10 * 60_000);

const CASES = [
  {
    id: 'spaces-v1',
    repoUrl: 'https://github.com/neltomw/spaces-mcp-server',
    branch: 'main',
    note: 'Small real Node MCP previously proven convertible from MCP SDK v1.',
  },
  {
    id: 'egoist-ffmpeg',
    repoUrl: 'https://github.com/egoist/ffmpeg-mcp',
    branch: 'main',
    note: 'Real TypeScript ffmpeg MCP using tinyexec; exercises unsupported/native-process fallback behavior.',
  },
  {
    id: 'beambuilder-ffmpeg',
    repoUrl: 'https://github.com/beambuilder/ffmpeg-mcp-server',
    branch: 'main',
    note: 'Real Node ffmpeg MCP with local filesystem and background process semantics; should never be unsafely Edge-promoted.',
  },
  {
    id: 'video-creator-ffmpeg',
    repoUrl: 'https://github.com/video-creator/ffmpeg-mcp',
    branch: 'main',
    note: 'Real Python FastMCP + ffmpeg project; exercises non-Node Sandbox path.',
  },
  {
    id: 'kevinwatt-ffmpeg-lite',
    repoUrl: 'https://github.com/kevinwatt/ffmpeg-mcp-lite',
    branch: 'main',
    note: 'Real Python ffmpeg MCP with multiple media tools; exercises heavier Sandbox classification.',
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(user, path, init = {}, { allowFailure = false } = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('x-dev-user', user);
  const response = await fetch(`${FACTORY_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok && !allowFailure) {
    throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${text}`);
  }
  return { ok: response.ok, status: response.status, body };
}

async function safeGet(user, path) {
  try {
    return await request(user, path, {}, { allowFailure: true });
  } catch (error) {
    return { ok: false, status: 0, body: { error: String(error) } };
  }
}

function terminal(row) {
  return row?.status === 'ready' || row?.status === 'error' || row?.detected_runtime === 'local-bound';
}

async function waitForDeployment(user, id) {
  const started = Date.now();
  let lastState = '';
  while (Date.now() - started < TIMEOUT_MS) {
    const listing = await request(user, '/api/servers');
    const row = Array.isArray(listing.body) ? listing.body.find((item) => item.id === id) : null;
    if (!row) throw new Error(`Deployment ${id} disappeared`);
    const state = `${row.status}/${row.detected_runtime || '-'}/${row.edge_status || '-'}`;
    if (state !== lastState) {
      console.log(`[${user}] ${id}: ${state}`);
      lastState = state;
    }
    if (terminal(row)) return row;
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for deployment ${id}`);
}

function normalizeCompatibility(payload) {
  return payload?.compatibility || payload?.body?.compatibility || payload || null;
}

function safetyFindings(item) {
  const findings = [];
  const runtime = String(item.row?.detected_runtime || '');
  const compatibilityRuntime = String(item.compatibility?.runtime || '');
  const bridgeCommands = Array.isArray(item.compatibility?.bridgeCommands) ? item.compatibility.bridgeCommands : [];

  if (runtime.startsWith('edge') && item.row?.edge_status !== 'ready') {
    findings.push(`unsafe state: Edge runtime without ready Edge build (${item.row?.edge_status || 'none'})`);
  }
  if (runtime === 'edge-node-bridge' && compatibilityRuntime !== 'edge-with-bridge') {
    findings.push(`unsafe state: edge-node-bridge without verified edge-with-bridge compatibility (${compatibilityRuntime || 'none'})`);
  }
  if (runtime === 'edge-node-bridge' && bridgeCommands.some((command) => !['ffprobe', 'ffmpeg'].includes(command))) {
    findings.push(`unsafe state: unexpected bridge command ${bridgeCommands.join(', ')}`);
  }
  if (item.case.id === 'beambuilder-ffmpeg' && runtime.startsWith('edge')) {
    findings.push('unsafe state: local-filesystem/background-process ffmpeg MCP was Edge-promoted');
  }
  return findings;
}

async function runCase(testCase, index) {
  const user = `factory-real-corpus-${index + 1}`;
  const startedAt = new Date().toISOString();
  console.log(`\n=== ${testCase.id} ===`);
  console.log(`${testCase.repoUrl}#${testCase.branch}`);

  try {
    const createdResponse = await request(user, '/api/servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoUrl: testCase.repoUrl,
        branch: testCase.branch,
        subdir: '',
        visibility: 'public',
        name: `corpus-${testCase.id}`,
      }),
    });
    const created = createdResponse.body;
    if (!created?.id) throw new Error(`Create returned no deployment id: ${JSON.stringify(created)}`);

    const row = await waitForDeployment(user, created.id);
    const compatibilityResponse = await safeGet(user, `/api/servers/${created.id}/compatibility`);
    const compatibility = compatibilityResponse.ok ? normalizeCompatibility(compatibilityResponse.body) : null;
    const bridgeResponse = await safeGet(user, `/api/servers/${created.id}/bridge-status`);

    const result = {
      case: testCase,
      deploymentId: created.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      row,
      compatibility,
      compatibilityHttpStatus: compatibilityResponse.status,
      bridgeStatus: bridgeResponse.ok ? bridgeResponse.body : null,
      bridgeHttpStatus: bridgeResponse.status,
      error: null,
    };
    result.safetyFindings = safetyFindings(result);
    console.log(`${testCase.id}: ${row.status} runtime=${row.detected_runtime || '-'} edge=${row.edge_status || '-'} compat=${compatibility?.runtime || '-'}`);
    if (result.safetyFindings.length) console.error(`${testCase.id}: ${result.safetyFindings.join('; ')}`);
    return result;
  } catch (error) {
    const result = {
      case: testCase,
      deploymentId: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      row: null,
      compatibility: null,
      compatibilityHttpStatus: null,
      bridgeStatus: null,
      bridgeHttpStatus: null,
      error: error?.stack || String(error),
      safetyFindings: [],
    };
    console.error(`${testCase.id}: ERROR ${result.error}`);
    return result;
  }
}

function markdown(results) {
  const rows = results.map((result) => {
    const runtime = result.row?.detected_runtime || (result.error ? 'test-error' : '-');
    const status = result.row?.status || '-';
    const edge = result.row?.edge_status || '-';
    const compat = result.compatibility?.runtime || '-';
    const bridge = Array.isArray(result.compatibility?.bridgeCommands) && result.compatibility.bridgeCommands.length
      ? result.compatibility.bridgeCommands.join(', ')
      : '-';
    const finding = result.safetyFindings?.length ? `FAIL: ${result.safetyFindings.join('; ')}` : (result.error ? 'repo/deploy error' : 'OK');
    return `| ${result.case.id} | ${status} | ${runtime} | ${edge} | ${compat} | ${bridge} | ${finding.replace(/\|/g, '\\|')} |`;
  });
  return [
    '# Real Repository Factory Corpus',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'This report deploys unchanged public MCP repositories through the real Factory create/build/classify pipeline. External repository failures are recorded as observations; only Factory safety invariants fail the run.',
    '',
    '| Repository | Status | Runtime | Edge build | Compatibility | Bridge commands | Safety |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Cases',
    '',
    ...results.flatMap((result) => [
      `### ${result.case.id}`,
      '',
      `- Repository: ${result.case.repoUrl}#${result.case.branch}`,
      `- Why included: ${result.case.note}`,
      `- Runtime: ${result.row?.detected_runtime || '-'}`,
      `- Status: ${result.row?.status || '-'}`,
      `- Edge status: ${result.row?.edge_status || '-'}`,
      `- Compatibility: ${result.compatibility?.runtime || '-'}`,
      `- Compatibility summary: ${result.compatibility?.summary || '-'}`,
      `- Bridge commands: ${Array.isArray(result.compatibility?.bridgeCommands) ? result.compatibility.bridgeCommands.join(', ') || '-' : '-'}`,
      `- Error: ${result.error ? String(result.error).replace(/\n/g, ' ') : '-'}`,
      `- Safety findings: ${result.safetyFindings?.length ? result.safetyFindings.join('; ') : 'none'}`,
      '',
    ]),
  ].join('\n');
}

async function main() {
  console.log(`Factory: ${FACTORY_URL}`);
  console.log(`Testing ${CASES.length} unchanged public MCP repositories`);

  const results = [];
  for (let i = 0; i < CASES.length; i++) {
    results.push(await runCase(CASES[i], i));
  }

  await mkdir(REPORT_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    factoryUrl: FACTORY_URL,
    cases: results,
    summary: {
      total: results.length,
      ready: results.filter((r) => r.row?.status === 'ready').length,
      edge: results.filter((r) => String(r.row?.detected_runtime || '').startsWith('edge')).length,
      sandbox: results.filter((r) => String(r.row?.detected_runtime || '').startsWith('sandbox')).length,
      localBound: results.filter((r) => r.row?.detected_runtime === 'local-bound').length,
      deployErrors: results.filter((r) => Boolean(r.error) || r.row?.status === 'error').length,
      safetyFailures: results.reduce((sum, r) => sum + (r.safetyFindings?.length || 0), 0),
    },
  };
  await writeFile(`${REPORT_DIR}/real-repo-corpus.json`, JSON.stringify(payload, null, 2));
  await writeFile(`${REPORT_DIR}/real-repo-corpus.md`, markdown(results));

  console.log(`\nSummary: ${JSON.stringify(payload.summary)}`);
  console.log(`Reports: ${REPORT_DIR}/real-repo-corpus.{json,md}`);

  if (payload.summary.safetyFailures > 0) {
    throw new Error(`Real-repo corpus found ${payload.summary.safetyFailures} Factory safety invariant failure(s)`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
