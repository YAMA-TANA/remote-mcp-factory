#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const SAMPLE_SIZE = Math.max(1, Math.min(500, Number(arg('sample', '100')) || 100));
const CONCURRENCY = Math.max(1, Math.min(8, Number(arg('concurrency', '4')) || 4));
const OUTPUT_DIR = arg('output', 'reports');
const MAX_SOURCE_BYTES = 2_000_000;
const GLAMA_BASE = 'https://glama.ai/api/mcp/v1/servers';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.py', '.json', '.toml', '.yaml', '.yml',
  '.md', '.txt', '.sh', '.rs', '.go', '.java', '.kt', '.cs', '.rb', '.php', '.swift', '.lock',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'build', 'coverage', '.next', '.cache', 'vendor']);

const HARD_NODE_PATTERNS = [
  ['child_process', /(?:node:)?child_process|\bspawnSync?\s*\(|\bexecFileSync?\s*\(|\bexecSync?\s*\(/i],
  ['local shell / PTY', /node-pty|\bpty\.|shelljs|execa\s*\(/i],
  ['browser automation', /playwright|puppeteer|chromium\.launch|selenium-webdriver/i],
  ['native media/image binary', /ffmpeg|fluent-ffmpeg|sharp\b|canvas\b/i],
  ['native database', /better-sqlite3|sqlite3\b|leveldown|rocksdb/i],
  ['native/ffi/hardware', /ffi-napi|ref-napi|serialport|node-hid|\busb\b|isolated-vm/i],
  ['local Docker socket', /\/var\/run\/docker\.sock|dockerode/i],
];

const HARD_PYTHON_PATTERNS = [
  ['subprocess / shell', /\bsubprocess\.|\bos\.system\s*\(|\bpty\.|\bpexpect\b/i],
  ['browser automation', /\bplaywright\b|\bselenium\b|pyppeteer/i],
  ['native media', /\bffmpeg\b|opencv|cv2\b/i],
  ['local Docker socket', /\/var\/run\/docker\.sock|\bdocker\.from_env\s*\(/i],
];

const SOFT_PATTERNS = [
  ['filesystem semantics', /(?:node:)?fs(?:\/promises)?['"]|\bfrom\s+['"]pathlib['"]|\bpathlib\.|\bopen\s*\(/i],
  ['local sqlite/state', /\bsqlite\b|\.db['"]|\.sqlite/i],
  ['TCP/listening server', /\.listen\s*\(|createServer\s*\(/i],
];

function normalizeRepoUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2) return null;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

function attrText(server) {
  return JSON.stringify(server?.attributes ?? []).toLowerCase();
}

function isRemote(server) {
  const attrs = attrText(server);
  if (attrs.includes('remote')) return true;
  const hosting = String(server?.hosting ?? server?.deploymentType ?? '').toLowerCase();
  return hosting.includes('remote');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'remote-mcp-factory-compatibility-study/0.1',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function collectRemoteServers(limit) {
  const selected = [];
  const repos = new Set();
  let after = null;
  let pages = 0;

  while (selected.length < limit && pages < 30) {
    const url = new URL(GLAMA_BASE);
    url.searchParams.set('first', '100');
    url.searchParams.set('attributes', 'hosting:remote-capable');
    if (after) url.searchParams.set('after', after);
    const data = await fetchJson(url);
    const servers = Array.isArray(data?.servers) ? data.servers : Array.isArray(data?.data?.servers) ? data.data.servers : [];
    if (!servers.length) break;

    for (const server of servers) {
      // The API currently supports the same remote-capable attribute used by Glama's directory UI.
      // Keep a client-side check too so the study does not silently mix local-only servers if API behavior changes.
      if (!isRemote(server)) continue;
      const repoUrl = normalizeRepoUrl(server?.repository?.url ?? server?.repositoryUrl ?? server?.source?.url);
      if (!repoUrl || repos.has(repoUrl)) continue;
      repos.add(repoUrl);
      selected.push({
        glamaId: server.id ?? null,
        name: server.name ?? server.slug ?? basename(repoUrl),
        namespace: server.namespace ?? null,
        slug: server.slug ?? null,
        repoUrl,
        attributes: server.attributes ?? [],
        description: server.description ?? '',
      });
      if (selected.length >= limit) break;
    }

    pages += 1;
    const pageInfo = data?.pageInfo ?? data?.data?.pageInfo ?? {};
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  if (selected.length < limit) {
    throw new Error(`Only found ${selected.length} unique GitHub repositories marked remote-capable after ${pages} Glama pages`);
  }
  return selected;
}

async function walk(dir, root, files, budget) {
  if (budget.bytes >= MAX_SOURCE_BYTES) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (budget.bytes >= MAX_SOURCE_BYTES) return;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') {
      if (entry.isDirectory()) continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, root, files, budget);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    const important = ['package.json', 'pyproject.toml', 'requirements.txt', 'Dockerfile', 'Pipfile', 'Cargo.toml', 'go.mod'].includes(entry.name);
    if (!important && !TEXT_EXTENSIONS.has(ext)) continue;
    let info;
    try { info = await stat(full); } catch { continue; }
    if (info.size > 300_000) continue;
    let text;
    try { text = await readFile(full, 'utf8'); } catch { continue; }
    const remaining = MAX_SOURCE_BYTES - budget.bytes;
    if (remaining <= 0) return;
    text = text.slice(0, remaining);
    budget.bytes += Buffer.byteLength(text);
    files.push({ path: relative(root, full), text });
  }
}

function dependencyNames(pkg) {
  if (!pkg) return [];
  return Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}), ...(pkg.peerDependencies ?? {}) });
}

function analyzeFiles(files, server) {
  const reasons = [];
  const warnings = [];
  const all = files.map((f) => `\n/* ${f.path} */\n${f.text}`).join('\n');
  const paths = new Set(files.map((f) => f.path));
  const packageFile = files.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
  let pkg = null;
  if (packageFile) {
    try { pkg = JSON.parse(packageFile.text); } catch { warnings.push('package.json could not be parsed'); }
  }

  const hasNode = Boolean(pkg) || [...paths].some((p) => /\.(?:[cm]?[jt]sx?)$/i.test(p));
  const hasPython = [...paths].some((p) => p.endsWith('.py')) || [...paths].some((p) => /(?:^|\/)(?:pyproject\.toml|requirements\.txt)$/.test(p));
  const hasRust = [...paths].some((p) => /(?:^|\/)Cargo\.toml$/.test(p)) || [...paths].some((p) => p.endsWith('.rs'));
  const hasGo = [...paths].some((p) => /(?:^|\/)go\.mod$/.test(p)) || [...paths].some((p) => p.endsWith('.go'));

  const deps = dependencyNames(pkg).join('\n');
  const nodeText = `${all}\n${deps}`;

  if (hasRust || hasGo) {
    reasons.push(hasRust ? 'native Rust runtime' : 'native Go runtime');
    return verdict('sandbox-required', 'high', reasons, warnings, { hasNode, hasPython, hasRust, hasGo });
  }

  if (hasNode) {
    for (const [label, pattern] of HARD_NODE_PATTERNS) if (pattern.test(nodeText)) reasons.push(label);
    if (reasons.length) return verdict('sandbox-required', 'high', unique(reasons), warnings, { hasNode, hasPython, hasRust, hasGo });

    const soft = [];
    for (const [label, pattern] of SOFT_PATTERNS) if (pattern.test(nodeText)) soft.push(label);
    if (soft.length) {
      warnings.push(...unique(soft));
      reasons.push('JavaScript/TypeScript has no hard native/process blocker, but state or server semantics need build-time adaptation');
      return verdict('edge-adaptable', 'medium', reasons, warnings, { hasNode, hasPython, hasRust, hasGo });
    }

    reasons.push('JavaScript/TypeScript with no detected subprocess, native-addon, browser, or local-daemon dependency');
    if (/StdioServerTransport|server\/stdio|stdio/i.test(all)) reasons.push('stdio transport appears mechanically replaceable by an HTTP Worker handler');
    if (/\bfetch\s*\(|axios|ky\b|undici/i.test(nodeText)) reasons.push('network/API-oriented code detected');
    return verdict('edge-likely', 'high', reasons, warnings, { hasNode, hasPython, hasRust, hasGo });
  }

  if (hasPython) {
    for (const [label, pattern] of HARD_PYTHON_PATTERNS) if (pattern.test(all)) reasons.push(label);
    if (reasons.length) return verdict('sandbox-required', 'high', unique(reasons), warnings, { hasNode, hasPython, hasRust, hasGo });
    reasons.push('Python server has no obvious process/browser/native-daemon blocker in scanned source');
    warnings.push('Python Workers use Pyodide; dependency compatibility must be verified before calling this edge-compatible');
    return verdict('edge-conditional', 'medium', reasons, warnings, { hasNode, hasPython, hasRust, hasGo });
  }

  reasons.push('Runtime could not be mapped to the current automatic edge compiler');
  return verdict('uncertain', 'low', reasons, warnings, { hasNode, hasPython, hasRust, hasGo });
}

function unique(values) { return [...new Set(values)]; }
function verdict(classification, confidence, reasons, warnings, runtime) {
  return { classification, confidence, reasons: unique(reasons), warnings: unique(warnings), runtime };
}

async function scanOne(server, baseDir, index) {
  const dir = join(baseDir, String(index).padStart(3, '0'));
  try {
    await execFileAsync('git', ['clone', '--depth', '1', '--single-branch', '--no-tags', server.repoUrl, dir], {
      timeout: 60_000,
      maxBuffer: 1_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const files = [];
    await walk(dir, dir, files, { bytes: 0 });
    const analysis = analyzeFiles(files, server);
    return { ...server, ...analysis, filesScanned: files.length, scanError: null };
  } catch (error) {
    return {
      ...server,
      classification: 'uncertain',
      confidence: 'low',
      reasons: ['repository could not be cloned/scanned'],
      warnings: [],
      runtime: {},
      filesScanned: 0,
      scanError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
      const done = results.filter(Boolean).length;
      process.stdout.write(`\rscanned ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  process.stdout.write('\n');
  return results;
}

function summarize(results) {
  const counts = {};
  for (const result of results) counts[result.classification] = (counts[result.classification] ?? 0) + 1;
  const n = results.length;
  const pct = (value) => Number(((value / n) * 100).toFixed(1));
  const edgeStrict = counts['edge-likely'] ?? 0;
  const edgeAdaptable = counts['edge-adaptable'] ?? 0;
  const edgeConditional = counts['edge-conditional'] ?? 0;
  const sandbox = counts['sandbox-required'] ?? 0;
  const uncertain = counts.uncertain ?? 0;
  return {
    sampleSize: n,
    counts,
    percentages: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, pct(v)])),
    strictFunctionShare: pct(edgeStrict),
    nodeFunctionShareIncludingAdaptation: pct(edgeStrict + edgeAdaptable),
    possibleFunctionShareIncludingPythonConditional: pct(edgeStrict + edgeAdaptable + edgeConditional),
    sandboxRequiredShare: pct(sandbox),
    uncertainShare: pct(uncertain),
  };
}

function markdown(summary, results) {
  const rows = results.map((r) => `| ${escapeMd(r.name)} | ${escapeMd(r.repoUrl)} | ${r.classification} | ${r.confidence} | ${escapeMd(r.reasons[0] ?? '')} |`).join('\n');
  return `# Remote MCP Function Compatibility Study\n\nGenerated: ${new Date().toISOString()}\n\nThis study samples **${summary.sampleSize} unique GitHub repositories that Glama marks remote-capable**. It intentionally excludes local-only MCPs from the denominator. Classification is static and conservative: a real build + MCP initialize/tools-list smoke test is still required before production deployment.\n\n## Result\n\n| Metric | Share |\n| --- | ---: |\n| Strict edge-likely | **${summary.strictFunctionShare}%** |\n| Node edge-likely + edge-adaptable | **${summary.nodeFunctionShareIncludingAdaptation}%** |\n| Possible edge incl. Python conditional | **${summary.possibleFunctionShareIncludingPythonConditional}%** |\n| Sandbox-required | **${summary.sandboxRequiredShare}%** |\n| Uncertain / scan failure | **${summary.uncertainShare}%** |\n\n### Buckets\n\n${Object.entries(summary.counts).map(([k, v]) => `- **${k}: ${v}** (${summary.percentages[k]}%)`).join('\n')}\n\n## Interpretation\n\n- **edge-likely**: TypeScript/JavaScript with no detected hard Worker blocker. stdio itself is not counted as a blocker because the factory can replace the transport at build time.\n- **edge-adaptable**: Node code has no native/process blocker, but filesystem/state/listener semantics need adaptation or verification.\n- **edge-conditional**: currently used mainly for Python without an obvious hard blocker; Pyodide package compatibility still needs verification.\n- **sandbox-required**: subprocess, browser automation, native addon/binary, local daemon/socket, Go/Rust native runtime, or similar hard blocker detected.\n- **uncertain**: insufficient evidence or clone/scan failure.\n\n## Sample\n\n| MCP | Repository | Classification | Confidence | Primary reason |\n| --- | --- | --- | --- | --- |\n${rows}\n`;
}

function escapeMd(value) { return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

async function main() {
  console.log(`Collecting ${SAMPLE_SIZE} remote-capable MCP repositories from Glama…`);
  const servers = await collectRemoteServers(SAMPLE_SIZE);
  console.log(`Collected ${servers.length} unique GitHub repositories.`);
  const temp = await mkdtemp(join(tmpdir(), 'remote-mcp-study-'));
  try {
    const results = await mapConcurrent(servers, CONCURRENCY, (server, index) => scanOne(server, temp, index));
    const summary = summarize(results);
    await mkdir(OUTPUT_DIR, { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      source: 'Glama MCP directory API, remote-capable repositories only',
      methodologyVersion: 1,
      summary,
      results,
    };
    await writeFile(join(OUTPUT_DIR, 'compatibility-study.json'), `${JSON.stringify(payload, null, 2)}\n`);
    await writeFile(join(OUTPUT_DIR, 'compatibility-study.md'), markdown(summary, results));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
