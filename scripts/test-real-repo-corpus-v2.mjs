#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';

const FACTORY_URL = (process.env.FACTORY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const REPORT_DIR = process.env.REPORT_DIR || 'reports';
const TIMEOUT_MS = Number(process.env.REPO_TIMEOUT_MS || 4 * 60_000);
const CONCURRENCY = Math.max(1, Number(process.env.CORPUS_CONCURRENCY || 3));

const CASES = [
  {
    id: 'spaces-v1', repoUrl: 'https://github.com/neltomw/spaces-mcp-server', branch: 'main', category: 'node-v1',
    note: 'Small real Node MCP SDK v1 baseline already known to be convertible.',
  },
  {
    id: 'egoist-ffmpeg', repoUrl: 'https://github.com/egoist/ffmpeg-mcp', branch: 'main', category: 'native-process',
    note: 'TypeScript MCP using tinyexec and ffmpeg; exercises native process fallback.',
  },
  {
    id: 'beambuilder-ffmpeg', repoUrl: 'https://github.com/beambuilder/ffmpeg-mcp-server', branch: 'main', category: 'local-filesystem', mustNotEdge: true,
    note: 'Node ffmpeg MCP with local files and background processes; semantics must not be silently Edge-promoted.',
  },
  {
    id: 'video-creator-ffmpeg', repoUrl: 'https://github.com/video-creator/ffmpeg-mcp', branch: 'main', category: 'python-native',
    note: 'Python FastMCP + ffmpeg project; exercises Python Sandbox path.',
  },
  {
    id: 'kevinwatt-ffmpeg-lite', repoUrl: 'https://github.com/kevinwatt/ffmpeg-mcp-lite', branch: 'main', category: 'python-native',
    note: 'Python ffmpeg MCP with multiple media tools.',
  },

  // Official MCP servers monorepo: unchanged subdirectories from the upstream repository.
  {
    id: 'official-everything', repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', subdir: 'src/everything', category: 'official-node',
    note: 'Official broad feature/reference server.',
  },
  {
    id: 'official-fetch', repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', subdir: 'src/fetch', category: 'official-python-network',
    note: 'Official HTTP fetching server; cloud-friendly semantics but Python runtime.',
  },
  {
    id: 'official-filesystem', repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', subdir: 'src/filesystem', category: 'local-filesystem', mustNotEdge: true,
    note: 'Official local filesystem MCP; must preserve host filesystem semantics.',
  },
  {
    id: 'official-git', repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', subdir: 'src/git', category: 'local-git', mustNotEdge: true,
    note: 'Official Git repository MCP; operates on local repositories.',
  },
  {
    id: 'official-memory', repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', subdir: 'src/memory', category: 'stateful-storage', mustNotEdge: true,
    note: 'Official persistent memory server; unchanged local persistence semantics should not be silently replaced.',
  },
  {
    id: 'official-sequential-thinking', repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', subdir: 'src/sequentialthinking', category: 'official-node-stateless',
    note: 'Official mostly stateless Node MCP; useful Edge candidate.',
  },
  {
    id: 'official-time', repoUrl: 'https://github.com/modelcontextprotocol/servers', branch: 'main', subdir: 'src/time', category: 'official-python',
    note: 'Official Python time server; light Python baseline.',
  },

  // Independent, current public repositories across network, local-app, and heavy-runtime workloads.
  {
    id: 'web3-research', repoUrl: 'https://github.com/aaronjmars/web3-research-mcp', branch: 'main', category: 'node-network',
    note: 'TypeScript web/news research MCP using network access.',
  },
  {
    id: 'caldav', repoUrl: 'https://github.com/dominik1001/caldav-mcp', branch: 'main', category: 'node-network-auth',
    note: 'TypeScript CalDAV MCP with remote network/auth dependencies.',
  },
  {
    id: 'next-devtools', repoUrl: 'https://github.com/vercel/next-devtools-mcp', branch: 'main', category: 'local-devserver', mustNotEdge: true,
    note: 'Next.js devtools MCP that talks to local development processes.',
  },
  {
    id: 'chrome-extension-bridge', repoUrl: 'https://github.com/Oanakiaja/chrome-extension-bridge-mcp', branch: 'main', category: 'local-browser-bridge', mustNotEdge: true,
    note: 'MCP coupled to a local Chrome extension bridge.',
  },
  {
    id: 'docling', repoUrl: 'https://github.com/docling-project/docling-mcp', branch: 'main', category: 'python-heavy',
    note: 'Large document-processing Python MCP; stresses dependency/build classification.',
  },
  {
    id: 'unreal-engine', repoUrl: 'https://github.com/flopperam/unreal-engine-mcp', branch: 'main', category: 'local-desktop-app', mustNotEdge: true,
    note: 'Unreal Engine integration with local application semantics.',
  },
  {
    id: 'revit-python', repoUrl: 'https://github.com/mcp-servers-for-revit/mcp-server-for-revit-python', branch: 'master', category: 'local-desktop-app', mustNotEdge: true,
    note: 'Python Revit integration; local desktop application dependency.',
  },
  {
    id: 'aws-log-analyzer', repoUrl: 'https://github.com/awslabs/Log-Analyzer-with-MCP', branch: 'main', category: 'python-cloud-api',
    note: 'AWS CloudWatch-oriented Python MCP; remote API and credentials workload.',
  },
  {
    id: 'outline', repoUrl: 'https://github.com/Vortiago/mcp-outline', branch: 'main', category: 'network-api',
    note: 'Outline knowledge-base MCP; remote API workload.',
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(user, path, init = {}, { allowFailure = false } = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('x-dev-user', user);
  const response = await fetch(`${FACTORY_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok && !allowFailure) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${text}`);
  return { ok: response.ok, status: response.status, body };
}

async function safeGet(user, path) {
  try { return await request(user, path, {}, { allowFailure: true }); }
  catch (error) { return { ok: false, status: 0, body: { error: String(error) } }; }
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
  throw new Error(`Timed out after ${TIMEOUT_MS}ms waiting for deployment ${id}`);
}

function normalizeCompatibility(payload) {
  return payload?.compatibility || payload?.body?.compatibility || payload || null;
}

function isEdgeRuntime(runtime) {
  return String(runtime || '').startsWith('edge');
}

function isSandboxRuntime(runtime) {
  return String(runtime || '').startsWith('sandbox');
}

function isCompatibilityEdge(runtime) {
  return String(runtime || '').startsWith('edge');
}

function safetyFindings(item) {
  const findings = [];
  const runtime = String(item.row?.detected_runtime || '');
  const compatibilityRuntime = String(item.compatibility?.runtime || '');
  const bridgeCommands = Array.isArray(item.compatibility?.bridgeCommands) ? item.compatibility.bridgeCommands : [];

  if (isEdgeRuntime(runtime) && item.row?.edge_status !== 'ready') {
    findings.push(`Edge runtime selected without ready Edge build (${item.row?.edge_status || 'none'})`);
  }
  if (runtime === 'edge-node-bridge' && compatibilityRuntime !== 'edge-with-bridge') {
    findings.push(`edge-node-bridge selected without verified edge-with-bridge compatibility (${compatibilityRuntime || 'none'})`);
  }
  if (runtime === 'edge-node-bridge' && bridgeCommands.some((command) => !['ffprobe', 'ffmpeg'].includes(command))) {
    findings.push(`unexpected bridge command: ${bridgeCommands.join(', ')}`);
  }
  if (item.case.mustNotEdge && isEdgeRuntime(runtime)) {
    findings.push(`semantic safety: ${item.case.category} repository was Edge-promoted`);
  }
  return findings;
}

function optimisticCompatibility(item) {
  const compatibilityRuntime = item.compatibility?.runtime;
  const selectedRuntime = item.row?.detected_runtime;
  return isCompatibilityEdge(compatibilityRuntime) && !isEdgeRuntime(selectedRuntime);
}

async function runCase(testCase, index) {
  const user = `factory-real-corpus-v2-${index + 1}`;
  const startedAt = new Date().toISOString();
  console.log(`\n=== ${testCase.id} [${testCase.category}] ===`);
  console.log(`${testCase.repoUrl}#${testCase.branch}${testCase.subdir ? `/${testCase.subdir}` : ''}`);

  try {
    const createdResponse = await request(user, '/api/servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoUrl: testCase.repoUrl,
        branch: testCase.branch,
        subdir: testCase.subdir || '',
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
    result.optimisticCompatibility = optimisticCompatibility(result);
    console.log(`${testCase.id}: ${row.status} runtime=${row.detected_runtime || '-'} edge=${row.edge_status || '-'} compat=${compatibility?.runtime || '-'} optimistic=${result.optimisticCompatibility}`);
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
      optimisticCompatibility: false,
    };
    console.error(`${testCase.id}: ERROR ${result.error}`);
    return result;
  }
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function summaryFor(results) {
  return {
    total: results.length,
    ready: results.filter((r) => r.row?.status === 'ready').length,
    edge: results.filter((r) => isEdgeRuntime(r.row?.detected_runtime)).length,
    sandbox: results.filter((r) => isSandboxRuntime(r.row?.detected_runtime)).length,
    localBound: results.filter((r) => r.row?.detected_runtime === 'local-bound').length,
    deployErrors: results.filter((r) => Boolean(r.error) || r.row?.status === 'error').length,
    optimisticCompatibility: results.filter((r) => r.optimisticCompatibility).length,
    safetyFailures: results.reduce((sum, r) => sum + (r.safetyFindings?.length || 0), 0),
  };
}

function categorySummary(results) {
  const categories = new Map();
  for (const result of results) {
    const key = result.case.category;
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key).push(result);
  }
  return Object.fromEntries([...categories.entries()].map(([key, values]) => [key, summaryFor(values)]));
}

function markdown(results, summary, byCategory) {
  const rows = results.map((result) => {
    const runtime = result.row?.detected_runtime || (result.error ? 'test-error' : '-');
    const status = result.row?.status || '-';
    const edge = result.row?.edge_status || '-';
    const compat = result.compatibility?.runtime || '-';
    const mismatch = result.optimisticCompatibility ? 'YES' : '-';
    const safety = result.safetyFindings?.length ? `FAIL: ${result.safetyFindings.join('; ')}` : (result.error ? 'repo/deploy error' : 'OK');
    return `| ${result.case.id} | ${result.case.category} | ${status} | ${runtime} | ${edge} | ${compat} | ${mismatch} | ${safety.replace(/\|/g, '\\|')} |`;
  });

  const categoryRows = Object.entries(byCategory).map(([category, s]) =>
    `| ${category} | ${s.total} | ${s.ready} | ${s.edge} | ${s.sandbox} | ${s.localBound} | ${s.deployErrors} | ${s.optimisticCompatibility} | ${s.safetyFailures} |`
  );

  return [
    '# Real Repository Factory Corpus v2',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Cases: ${summary.total}; ready=${summary.ready}; edge=${summary.edge}; sandbox=${summary.sandbox}; local-bound=${summary.localBound}; deploy-errors=${summary.deployErrors}; optimistic-compatibility=${summary.optimisticCompatibility}; safety-failures=${summary.safetyFailures}.`,
    '',
    '“Optimistic compatibility” means the static compatibility endpoint said Edge while the actual build selected a non-Edge runtime. It is reported for calibration, not treated as a safety failure.',
    '',
    '| Repository | Category | Status | Selected runtime | Edge build | Static compatibility | Optimistic? | Safety |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## By category',
    '',
    '| Category | Total | Ready | Edge | Sandbox | Local-bound | Errors | Optimistic | Safety failures |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...categoryRows,
    '',
    '## Cases',
    '',
    ...results.flatMap((result) => [
      `### ${result.case.id}`,
      '',
      `- Repository: ${result.case.repoUrl}#${result.case.branch}${result.case.subdir ? ` / ${result.case.subdir}` : ''}`,
      `- Category: ${result.case.category}`,
      `- Why included: ${result.case.note}`,
      `- Selected runtime: ${result.row?.detected_runtime || '-'}`,
      `- Status: ${result.row?.status || '-'}`,
      `- Edge status: ${result.row?.edge_status || '-'}`,
      `- Edge reason: ${result.row?.edge_reason || result.row?.edge_error || '-'}`,
      `- Static compatibility: ${result.compatibility?.runtime || '-'}`,
      `- Compatibility summary: ${result.compatibility?.summary || '-'}`,
      `- Optimistic compatibility: ${result.optimisticCompatibility ? 'yes' : 'no'}`,
      `- Error: ${result.error ? String(result.error).replace(/\n/g, ' ') : '-'}`,
      `- Safety findings: ${result.safetyFindings?.length ? result.safetyFindings.join('; ') : 'none'}`,
      '',
    ]),
  ].join('\n');
}

async function main() {
  console.log(`Factory: ${FACTORY_URL}`);
  console.log(`Testing ${CASES.length} unchanged public MCP cases with concurrency=${CONCURRENCY}`);

  const results = await mapWithConcurrency(CASES, CONCURRENCY, runCase);
  const summary = summaryFor(results);
  const byCategory = categorySummary(results);

  await mkdir(REPORT_DIR, { recursive: true });
  const payload = { generatedAt: new Date().toISOString(), factoryUrl: FACTORY_URL, cases: results, summary, byCategory };
  await writeFile(`${REPORT_DIR}/real-repo-corpus.json`, JSON.stringify(payload, null, 2));
  await writeFile(`${REPORT_DIR}/real-repo-corpus.md`, markdown(results, summary, byCategory));

  console.log(`\nSummary: ${JSON.stringify(summary)}`);
  console.log(`Reports: ${REPORT_DIR}/real-repo-corpus.{json,md}`);

  if (summary.safetyFailures > 0) {
    throw new Error(`Real-repo corpus found ${summary.safetyFailures} Factory safety invariant failure(s)`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
