#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const SAMPLE_SIZE = Math.max(1, Math.min(500, Number(arg('sample', '100')) || 100));
const POOL_SIZE = Math.max(SAMPLE_SIZE, Math.min(3000, Number(arg('pool', '1000')) || 1000));
const CONCURRENCY = Math.max(1, Math.min(8, Number(arg('concurrency', '4')) || 4));
const OUTPUT_DIR = arg('output', 'reports');
const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const SAMPLE_SEED = 'remote-mcp-factory-study-v2';
const MAX_BYTES = 2_000_000;

const CODE_EXT = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.mts','.cts','.py','.rs','.go','.java','.kt','.cs','.rb','.php','.swift','.sh']);
const DATA_EXT = new Set(['.json','.toml','.yaml','.yml','.txt','.md','.lock']);
const SKIP = new Set(['.git','node_modules','.venv','venv','dist','build','coverage','.next','.cache','vendor','target']);

const HARD_NODE = [
  ['child_process', /(?:node:)?child_process|\bspawnSync?\s*\(|\bexecFileSync?\s*\(|\bexecSync?\s*\(/i],
  ['PTY/shell', /node-pty|shelljs|\bexeca\s*\(/i],
  ['browser automation', /playwright|puppeteer|selenium-webdriver|chromium\.launch/i],
  ['native media/image', /fluent-ffmpeg|\bffmpeg\b|\bsharp\b|\bcanvas\b/i],
  ['native database', /better-sqlite3|\bsqlite3\b|leveldown|rocksdb/i],
  ['FFI/hardware', /ffi-napi|ref-napi|serialport|node-hid|isolated-vm/i],
  ['local Docker socket', /\/var\/run\/docker\.sock|\bdockerode\b/i],
];
const HARD_PY = [
  ['subprocess/shell', /\bsubprocess\.|\bos\.system\s*\(|\bpexpect\b/i],
  ['browser automation', /\bplaywright\b|\bselenium\b|pyppeteer/i],
  ['native media', /\bffmpeg\b|\bopencv\b|\bcv2\b/i],
  ['local Docker socket', /\/var\/run\/docker\.sock|\bdocker\.from_env\s*\(/i],
];
const SOFT = [
  ['filesystem/state semantics', /(?:node:)?fs(?:\/promises)?['"]|\bpathlib\.|\bopen\s*\(/i],
  ['local sqlite/state', /\bsqlite\b|\.sqlite\b|\.db\b/i],
  ['listener/server semantics', /\.listen\s*\(|createServer\s*\(/i],
];
const LOCAL_BOUND = [
  /local file ?system|your file ?system|your local files|files on your (?:computer|machine)/i,
  /local git (?:repo|repository)|working tree on your|current working directory/i,
  /desktop app(?:lication)?|control (?:your )?(?:desktop|mouse|keyboard)|clipboard/i,
  /requires .* installed on (?:your|the) (?:machine|computer)|connects to .* on localhost/i,
  /local hardware|serial port|usb device|bluetooth device/i,
];

function repoUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (u.hostname !== 'github.com') return null;
    const p = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/');
    if (p.length < 2) return null;
    return `https://github.com/${p[0]}/${p[1]}`;
  } catch { return null; }
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'remote-mcp-factory-study/0.2' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

function unwrap(entry) { return entry?.server ?? entry; }
function stableRank(value) { return createHash('sha256').update(`${SAMPLE_SEED}|${value}`).digest('hex'); }

async function registryPool(limit) {
  const byRepo = new Map();
  let cursor = null;
  let pages = 0;
  while (byRepo.size < limit && pages < 60) {
    const u = new URL(REGISTRY);
    u.searchParams.set('limit', '100');
    u.searchParams.set('version', 'latest');
    if (cursor) u.searchParams.set('cursor', cursor);
    const data = await fetchJson(u);
    for (const raw of data?.servers ?? []) {
      const s = unwrap(raw);
      if (!s || s.status === 'deleted') continue;
      const url = repoUrl(s.repository?.url);
      if (!url || byRepo.has(url)) continue;
      byRepo.set(url, {
        name: s.title ?? s.name ?? url.split('/').at(-1),
        registryName: s.name ?? null,
        description: s.description ?? '',
        repoUrl: url,
        subfolder: s.repository?.subfolder ?? '',
        declaredRemote: Array.isArray(s.remotes) && s.remotes.length > 0,
        packageTransports: (s.packages ?? []).map((p) => p?.transport?.type).filter(Boolean),
      });
    }
    pages += 1;
    cursor = data?.metadata?.nextCursor ?? data?.nextCursor ?? null;
    if (!cursor) break;
  }
  const all = [...byRepo.values()].sort((a,b) => stableRank(a.repoUrl).localeCompare(stableRank(b.repoUrl)));
  if (all.length < SAMPLE_SIZE) throw new Error(`Official Registry yielded only ${all.length} unique GitHub repos`);
  return all.slice(0, SAMPLE_SIZE);
}

async function walk(dir, root, files, budget) {
  if (budget.bytes >= MAX_BYTES) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (budget.bytes >= MAX_BYTES) return;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !e.name.startsWith('.')) await walk(full, root, files, budget);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    const important = ['package.json','pyproject.toml','requirements.txt','Dockerfile','Cargo.toml','go.mod','README.md'].includes(e.name);
    if (!important && !CODE_EXT.has(ext) && !DATA_EXT.has(ext)) continue;
    let info;
    try { info = await stat(full); } catch { continue; }
    if (info.size > 300_000) continue;
    let text;
    try { text = await readFile(full, 'utf8'); } catch { continue; }
    text = text.slice(0, MAX_BYTES - budget.bytes);
    budget.bytes += Buffer.byteLength(text);
    files.push({ path: relative(root, full), text, isCode: CODE_EXT.has(ext) || (important && e.name !== 'README.md') });
  }
}

function uniq(a) { return [...new Set(a)]; }
function result(classification, confidence, reasons, warnings, remoteHostable) {
  return { classification, confidence, reasons: uniq(reasons), warnings: uniq(warnings), remoteHostable };
}

function analyze(files, meta) {
  const reasons = [], warnings = [];
  const paths = files.map(f => f.path);
  const code = files.filter(f => f.isCode).map(f => `\n/*${f.path}*/\n${f.text}`).join('\n');
  const docs = files.filter(f => /README|\.md$/i.test(f.path)).map(f => f.text).join('\n').slice(0, 500_000);
  const semantic = `${meta.description}\n${docs}`;

  const packageFile = files.find(f => /(^|\/)package\.json$/.test(f.path));
  let pkg = null;
  if (packageFile) try { pkg = JSON.parse(packageFile.text); } catch { warnings.push('package.json parse failed'); }
  const deps = pkg ? Object.keys({...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}), ...(pkg.peerDependencies ?? {})}).join('\n') : '';
  const nodeText = `${code}\n${deps}`;

  const hasNode = Boolean(pkg) || paths.some(p => /\.(?:[cm]?[jt]sx?)$/i.test(p));
  const hasPy = paths.some(p => p.endsWith('.py')) || paths.some(p => /(?:^|\/)(pyproject\.toml|requirements\.txt)$/.test(p));
  const hasRust = paths.some(p => /(?:^|\/)Cargo\.toml$/.test(p)) || paths.some(p => p.endsWith('.rs'));
  const hasGo = paths.some(p => /(?:^|\/)go\.mod$/.test(p)) || paths.some(p => p.endsWith('.go'));

  if (!meta.declaredRemote && LOCAL_BOUND.some(p => p.test(semantic))) {
    return result('local-bound', 'medium', ['documentation indicates value tied to the user/local machine'], warnings, false);
  }
  if (hasRust || hasGo) return result('sandbox-required', 'high', [hasRust ? 'native Rust runtime' : 'native Go runtime'], warnings, true);

  if (hasNode) {
    for (const [label,p] of HARD_NODE) if (p.test(nodeText)) reasons.push(label);
    if (reasons.length) return result('sandbox-required', 'high', reasons, warnings, true);
    const soft = [];
    for (const [label,p] of SOFT) if (p.test(nodeText)) soft.push(label);
    if (soft.length) {
      warnings.push(...soft);
      return result('edge-adaptable', 'medium', ['Node/TypeScript has no hard native/process blocker but state/listener semantics need checking'], warnings, true);
    }
    reasons.push('Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker');
    if (/StdioServerTransport|server\/stdio|\bstdio\b/i.test(code)) reasons.push('stdio transport looks mechanically replaceable at build time');
    if (/\bfetch\s*\(|axios|undici|\bky\b/i.test(nodeText)) reasons.push('network/API-oriented code detected');
    return result('edge-likely', 'high', reasons, warnings, true);
  }

  if (hasPy) {
    for (const [label,p] of HARD_PY) if (p.test(code)) reasons.push(label);
    if (reasons.length) return result('sandbox-required', 'high', reasons, warnings, true);
    return result('edge-conditional', 'medium', ['Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification'], warnings, true);
  }

  return result('uncertain', 'low', ['runtime not covered by automatic edge compiler'], warnings, meta.declaredRemote ? true : null);
}

async function scanOne(meta, base, i) {
  const dir = join(base, String(i).padStart(3,'0'));
  try {
    await execFileAsync('git', ['clone','--depth','1','--single-branch','--no-tags',meta.repoUrl,dir], { timeout: 60_000, maxBuffer: 1_000_000, env: {...process.env, GIT_TERMINAL_PROMPT:'0'} });
    const root = meta.subfolder ? join(dir, meta.subfolder) : dir;
    const files = [];
    await walk(root, root, files, {bytes:0});
    return {...meta, ...analyze(files, meta), filesScanned: files.length, scanError: null};
  } catch (e) {
    return {...meta, classification:'uncertain', confidence:'low', reasons:['clone/scan failed'], warnings:[], remoteHostable:meta.declaredRemote ? true : null, filesScanned:0, scanError:String(e).slice(0,500)};
  } finally { await rm(dir,{recursive:true,force:true}).catch(()=>{}); }
}

async function mapConcurrent(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length:n}, async () => {
    while (true) {
      const i = next++; if (i >= items.length) return;
      out[i] = await fn(items[i], i);
      process.stdout.write(`\rscanned ${out.filter(Boolean).length}/${items.length}`);
    }
  }));
  process.stdout.write('\n'); return out;
}

function summarize(results) {
  const counts = {};
  for (const r of results) counts[r.classification] = (counts[r.classification] ?? 0) + 1;
  const hostable = results.filter(r => ['edge-likely','edge-adaptable','edge-conditional','sandbox-required'].includes(r.classification));
  const count = k => hostable.filter(r => r.classification === k).length;
  const pct = (x,n) => n ? Number((100*x/n).toFixed(1)) : 0;
  return {
    sampleSize: results.length,
    remotelyHostableDenominator: hostable.length,
    excludedLocalBound: counts['local-bound'] ?? 0,
    uncertain: counts['uncertain'] ?? 0,
    counts,
    strictFunctionShareOfHostable: pct(count('edge-likely'), hostable.length),
    nodeFunctionShareWithAdaptation: pct(count('edge-likely') + count('edge-adaptable'), hostable.length),
    possibleFunctionShareIncludingPython: pct(count('edge-likely') + count('edge-adaptable') + count('edge-conditional'), hostable.length),
    sandboxShareOfHostable: pct(count('sandbox-required'), hostable.length),
  };
}

const esc = s => String(s).replace(/\|/g,'\\|').replace(/\n/g,' ');
function markdown(summary, results) {
  const rows = results.map(r => `| ${esc(r.name)} | ${esc(r.repoUrl)} | ${r.declaredRemote?'yes':'no'} | ${r.classification} | ${r.confidence} | ${esc(r.reasons[0] ?? '')} |`).join('\n');
  return `# MCP Function Compatibility Study\n\nGenerated: ${new Date().toISOString()}\n\nSource: **Official MCP Registry**, sampled deterministically from public GitHub-backed servers. Local-bound MCPs are excluded from the remotely-hostable denominator. This is a static first-pass study; production compatibility still requires an actual bundle/build plus MCP initialize/tools-list smoke test.\n\n## Result\n\n- Sample: **${summary.sampleSize} repos**\n- Remotely-hostable denominator: **${summary.remotelyHostableDenominator}**\n- Local-bound excluded: **${summary.excludedLocalBound}**\n- Uncertain: **${summary.uncertain}**\n- Strict edge-likely share of hostable: **${summary.strictFunctionShareOfHostable}%**\n- Node edge-likely + edge-adaptable: **${summary.nodeFunctionShareWithAdaptation}%**\n- Possible edge incl. Python conditional: **${summary.possibleFunctionShareIncludingPython}%**\n- Sandbox-required share of hostable: **${summary.sandboxShareOfHostable}%**\n\n## Buckets\n${Object.entries(summary.counts).map(([k,v]) => `- **${k}: ${v}**`).join('\n')}\n\n## Sample details\n\n| MCP | Repository | Remote already declared | Classification | Confidence | Primary reason |\n| --- | --- | ---: | --- | --- | --- |\n${rows}\n`;
}

async function main() {
  console.log(`Sampling ${SAMPLE_SIZE} GitHub-backed MCP repos from Official Registry…`);
  const sample = await registryPool(POOL_SIZE);
  console.log(`Selected ${sample.length} repos with fixed-seed sampling.`);
  const temp = await mkdtemp(join(tmpdir(),'mcp-study-'));
  try {
    const results = await mapConcurrent(sample, CONCURRENCY, (m,i) => scanOne(m,temp,i));
    const summary = summarize(results);
    await mkdir(OUTPUT_DIR,{recursive:true});
    await writeFile(join(OUTPUT_DIR,'compatibility-study.json'), JSON.stringify({generatedAt:new Date().toISOString(), methodologyVersion:2, source:'Official MCP Registry v0.1', summary, results},null,2)+'\n');
    await writeFile(join(OUTPUT_DIR,'compatibility-study.md'), markdown(summary,results));
    console.log(JSON.stringify(summary,null,2));
  } finally { await rm(temp,{recursive:true,force:true}).catch(()=>{}); }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
