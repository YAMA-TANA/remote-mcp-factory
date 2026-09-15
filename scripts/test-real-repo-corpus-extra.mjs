#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';

const FACTORY_URL = (process.env.FACTORY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const REPORT_DIR = process.env.REPORT_DIR || 'reports';
const TIMEOUT_MS = Number(process.env.REPO_TIMEOUT_MS || 4 * 60_000);
const CONCURRENCY = Math.max(1, Number(process.env.CORPUS_CONCURRENCY || 3));

const CASES = [
  {
    id: 'github-official-go', repoUrl: 'https://github.com/github/github-mcp-server', branch: 'main', category: 'go-official',
    note: 'Official GitHub MCP server in Go; measures unsupported-language behavior.',
  },
  {
    id: 'kubernetes-containers', repoUrl: 'https://github.com/containers/kubernetes-mcp-server', branch: 'main', category: 'kubernetes-local', mustNotEdge: true,
    note: 'Kubernetes MCP with cluster/kubeconfig semantics; must not be silently Edge-promoted.',
  },
  {
    id: 'kubernetes-go', repoUrl: 'https://github.com/strowk/mcp-k8s-go', branch: 'main', category: 'go-kubernetes-local', mustNotEdge: true,
    note: 'Go Kubernetes MCP; exercises both unsupported language and local-cluster semantics.',
  },
  {
    id: 'bytebase-dbhub', repoUrl: 'https://github.com/bytebase/dbhub', branch: 'main', category: 'database',
    note: 'Database MCP gateway covering several SQL engines.',
  },
  {
    id: 'neon-official', repoUrl: 'https://github.com/neondatabase/mcp-server-neon', branch: 'main', category: 'node-saas-database',
    note: 'Official Neon MCP; remote SaaS/database API workload.',
  },
  {
    id: 'notion-official', repoUrl: 'https://github.com/makenotion/notion-mcp-server', branch: 'main', category: 'node-saas-api',
    note: 'Official Notion MCP; remote SaaS API workload.',
  },
  {
    id: 'sentry-stdio', repoUrl: 'https://github.com/getsentry/sentry-mcp-stdio', branch: 'main', category: 'node-saas-api',
    note: 'Sentry stdio MCP wrapper; tests a production SaaS integration.',
  },
  {
    id: 'playwright-official', repoUrl: 'https://github.com/microsoft/playwright-mcp', branch: 'main', category: 'browser-native', mustNotEdge: true,
    note: 'Official Playwright MCP; browser process workload must not be plain Edge.',
  },
  {
    id: 'remote-auth-template', repoUrl: 'https://github.com/coleam00/remote-mcp-server-with-auth', branch: 'main', category: 'remote-auth',
    note: 'Remote MCP OAuth/auth template; exercises already-remote server classification.',
  },
  {
    id: 'git-mcp', repoUrl: 'https://github.com/idosal/git-mcp', branch: 'main', category: 'node-network-git',
    note: 'Git-focused MCP using remote repositories rather than a local desktop application.',
  },
  {
    id: 'postgres-pgmcp', repoUrl: 'https://github.com/subnetmarco/pgmcp', branch: 'main', category: 'database-postgres',
    note: 'PostgreSQL MCP; tests database client/runtime dependency handling.',
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
  while (Date.now() - started < TIMEOUT_MS) {
    const listing = await request(user, '/api/servers');
    const row = Array.isArray(listing.body) ? listing.body.find((item) => item.id === id) : null;
    if (!row) throw new Error(`Deployment ${id} disappeared`);
    if (terminal(row)) return row;
    await sleep(3000);
  }
  throw new Error(`Timed out after ${TIMEOUT_MS}ms waiting for deployment ${id}`);
}

function isEdgeRuntime(runtime) {
  return String(runtime || '').startsWith('edge');
}

function isSandboxRuntime(runtime) {
  return String(runtime || '').startsWith('sandbox');
}

function normalizeCompatibility(payload) {
  return payload?.compatibility || payload?.body?.compatibility || payload || null;
}

function safetyFindings(item) {
  const findings = [];
  const runtime = String(item.row?.detected_runtime || '');
  if (isEdgeRuntime(runtime) && item.row?.edge_status !== 'ready') {
    findings.push(`Edge runtime selected without ready Edge build (${item.row?.edge_status || 'none'})`);
  }
  if (item.case.mustNotEdge && isEdgeRuntime(runtime)) {
    findings.push(`semantic safety: ${item.case.category} repository was Edge-promoted`);
  }
  return findings;
}

async function runCase(testCase, index) {
  const user = `factory-real-corpus-extra-${index + 1}`;
  const startedAt = new Date().toISOString();
  console.log(`\n=== ${testCase.id} [${testCase.category}] ===`);
  try {
    const created = (await request(user, '/api/servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoUrl: testCase.repoUrl,
        branch: testCase.branch,
        visibility: 'public',
        name: `corpus-extra-${testCase.id}`,
      }),
    })).body;
    if (!created?.id) throw new Error(`Create returned no deployment id: ${JSON.stringify(created)}`);

    const row = await waitForDeployment(user, created.id);
    const compatibilityResponse = await safeGet(user, `/api/servers/${created.id}/compatibility`);
    const compatibility = compatibilityResponse.ok ? normalizeCompatibility(compatibilityResponse.body) : null;
    const result = {
      case: testCase,
      deploymentId: created.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      row,
      compatibility,
      error: null,
    };
    result.optimisticCompatibility = String(compatibility?.runtime || '').startsWith('edge') && !isEdgeRuntime(row.detected_runtime);
    result.safetyFindings = safetyFindings(result);
    console.log(`${testCase.id}: ${row.status} runtime=${row.detected_runtime || '-'} edge=${row.edge_status || '-'} compat=${compatibility?.runtime || '-'} optimistic=${result.optimisticCompatibility}`);
    return result;
  } catch (error) {
    console.error(`${testCase.id}: ERROR ${error?.stack || error}`);
    return {
      case: testCase,
      deploymentId: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      row: null,
      compatibility: null,
      error: error?.stack || String(error),
      optimisticCompatibility: false,
      safetyFindings: [],
    };
  }
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

function summarize(results) {
  return {
    total: results.length,
    ready: results.filter((r) => r.row?.status === 'ready').length,
    edge: results.filter((r) => isEdgeRuntime(r.row?.detected_runtime)).length,
    sandbox: results.filter((r) => isSandboxRuntime(r.row?.detected_runtime)).length,
    localBound: results.filter((r) => r.row?.detected_runtime === 'local-bound').length,
    deployErrors: results.filter((r) => Boolean(r.error) || r.row?.status === 'error').length,
    optimisticCompatibility: results.filter((r) => r.optimisticCompatibility).length,
    safetyFailures: results.reduce((sum, r) => sum + r.safetyFindings.length, 0),
  };
}

function markdown(results, summary) {
  const rows = results.map((r) => `| ${r.case.id} | ${r.case.category} | ${r.row?.status || 'test-error'} | ${r.row?.detected_runtime || '-'} | ${r.row?.edge_status || '-'} | ${r.compatibility?.runtime || '-'} | ${r.optimisticCompatibility ? 'YES' : '-'} | ${r.safetyFindings.length ? r.safetyFindings.join('; ') : 'OK'} |`);
  return [
    '# Real Repository Factory Corpus — extra cross-runtime shard',
    '',
    `Cases: ${summary.total}; ready=${summary.ready}; edge=${summary.edge}; sandbox=${summary.sandbox}; local-bound=${summary.localBound}; deploy-errors=${summary.deployErrors}; optimistic-compatibility=${summary.optimisticCompatibility}; safety-failures=${summary.safetyFailures}.`,
    '',
    '| Repository | Category | Status | Selected runtime | Edge build | Static compatibility | Optimistic? | Safety |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const results = await mapWithConcurrency(CASES, CONCURRENCY, runCase);
  const summary = summarize(results);
  await writeFile(`${REPORT_DIR}/real-repo-corpus-extra.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)}\n`);
  await writeFile(`${REPORT_DIR}/real-repo-corpus-extra.md`, markdown(results, summary));
  console.log(`\nEXTRA CORPUS SUMMARY ${JSON.stringify(summary)}`);
  if (summary.safetyFailures > 0) {
    throw new Error(`Extra corpus found ${summary.safetyFailures} semantic safety failure(s)`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
