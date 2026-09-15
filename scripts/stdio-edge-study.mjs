#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const SAMPLE = Math.max(10, Math.min(200, Number(process.env.SAMPLE_SIZE || 100)));
const SEED = 'remote-mcp-factory-stdio-edge-v1';
const MAX_BYTES = 1_500_000;
const SKIP_DIRS = new Set(['.git','node_modules','.venv','venv','dist','build','coverage','.next','.cache','vendor','examples','example','docs','test','tests','__tests__']);
const CODE_EXT = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.mts','.cts']);

function unwrap(x) { return x?.server ?? x; }
function rank(v) { return createHash('sha256').update(`${SEED}|${v}`).digest('hex'); }
function githubRepo(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const p = u.pathname.replace(/^\/+|\/+$/g,'').replace(/\.git$/,'').split('/');
    return p.length >= 2 ? `https://github.com/${p[0]}/${p[1]}` : null;
  } catch { return null; }
}
async function json(url) {
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'remote-mcp-factory-stdio-edge-study/1' }});
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function collect() {
  const candidates = new Map();
  let cursor = null;
  for (let page = 0; page < 100 && candidates.size < SAMPLE * 5; page++) {
    const u = new URL(REGISTRY);
    u.searchParams.set('limit','100');
    u.searchParams.set('version','latest');
    if (cursor) u.searchParams.set('cursor',cursor);
    const data = await json(u);
    for (const raw of data?.servers ?? []) {
      const s = unwrap(raw);
      if (!s || s.status === 'deleted') continue;
      const repoUrl = githubRepo(s.repository?.url);
      if (!repoUrl) continue;
      for (const p of s.packages ?? []) {
        const registryType = String(p?.registryType ?? p?.registry_type ?? '').toLowerCase();
        const transport = String(p?.transport?.type ?? '').toLowerCase();
        const identifier = p?.identifier;
        if (registryType !== 'npm' || transport !== 'stdio' || !identifier) continue;
        const key = `${repoUrl}|${identifier}`;
        if (candidates.has(key)) continue;
        candidates.set(key, {
          name: s.title ?? s.name ?? identifier,
          registryName: s.name ?? null,
          description: s.description ?? '',
          repoUrl,
          registrySubfolder: s.repository?.subfolder ?? '',
          packageIdentifier: identifier,
          packageVersion: p.version ?? null,
        });
      }
    }
    cursor = data?.metadata?.nextCursor ?? data?.nextCursor ?? null;
    if (!cursor) break;
  }
  const sorted = [...candidates.values()].sort((a,b) => rank(`${a.repoUrl}|${a.packageIdentifier}`).localeCompare(rank(`${b.repoUrl}|${b.packageIdentifier}`)));
  if (sorted.length < SAMPLE) throw new Error(`Only ${sorted.length} npm+stdio GitHub packages found`);
  return sorted.slice(0,SAMPLE);
}

async function findPackageJsons(dir, root, out, depth = 0) {
  if (depth > 6) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await findPackageJsons(join(dir,e.name),root,out,depth+1);
    } else if (e.isFile() && e.name === 'package.json') {
      try {
        const path = join(dir,e.name);
        const pkg = JSON.parse(await readFile(path,'utf8'));
        out.push({ dir, path: relative(root,path), pkg });
      } catch {}
    }
  }
}

async function readRuntimeFiles(dir) {
  const files = [];
  let bytes = 0;
  async function walk(current) {
    if (bytes >= MAX_BYTES) return;
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (bytes >= MAX_BYTES) return;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(join(current,e.name));
        continue;
      }
      if (!e.isFile()) continue;
      const ext = extname(e.name).toLowerCase();
      if (!CODE_EXT.has(ext) && e.name !== 'README.md') continue;
      if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(e.name)) continue;
      let s; try { s = await stat(join(current,e.name)); } catch { continue; }
      if (s.size > 300_000) continue;
      let text; try { text = await readFile(join(current,e.name),'utf8'); } catch { continue; }
      text = text.slice(0,MAX_BYTES-bytes);
      bytes += Buffer.byteLength(text);
      files.push({ path: relative(dir,join(current,e.name)), text, code: CODE_EXT.has(ext) });
    }
  }
  await walk(dir);
  return files;
}

function depMap(pkg) { return { ...(pkg.dependencies||{}), ...(pkg.optionalDependencies||{}), ...(pkg.peerDependencies||{}) }; }
function first(list) { return [...new Set(list)]; }

function analyze(meta, pkg, files) {
  const deps = depMap(pkg);
  const code = files.filter(f=>f.code).map(f=>`\n/*${f.path}*/\n${f.text}`).join('\n');
  const readme = files.filter(f=>/README/i.test(f.path)).map(f=>f.text).join('\n').slice(0,250000);
  const semantics = `${meta.description}\n${pkg.description||''}\n${readme}`;
  const reasons = [], warnings = [];
  const sdkV1 = deps['@modelcontextprotocol/sdk'];
  const sdkV2 = deps['@modelcontextprotocol/server'];
  if (!sdkV1 && !sdkV2) return { classification:'uncertain', confidence:'low', reasons:['published npm package does not declare a recognized MCP server SDK dependency'], warnings };

  // Exclude stdio wrappers whose purpose is to bridge a local client to an already-remote MCP endpoint.
  const bridgeSignals = [
    /stdio[^\n]{0,80}(?:http|sse)|(?:http|sse)[^\n]{0,80}stdio/i,
    /bridge[^\n]{0,100}(?:transport|remote)/i,
    /StreamableHTTPClientTransport|SSEClientTransport|ReconnectingTransport/i,
  ].filter(r=>r.test(`${semantics}\n${code}`)).length;
  if (bridgeSignals >= 2) return { classification:'remote-wrapper', confidence:'high', reasons:['package primarily bridges local stdio to an already-remote MCP/service'], warnings };

  // Semantics that inherently refer to the end user's own machine cannot be preserved by cloud hosting.
  const localSemantic = /(?:local filesystem|your local files|local git repositor|current working directory|desktop app|local workspace|your machine|local browser profile|IDE extension|control (?:your )?(?:mouse|keyboard)|localhost service)/i;
  if (localSemantic.test(semantics)) return { classification:'local-bound', confidence:'medium', reasons:['documented behavior depends on resources on the end user\'s machine'], warnings };

  const hard = [];
  const hardPatterns = [
    ['child_process',/(?:node:)?child_process|\bspawnSync?\s*\(|\bexecFileSync?\s*\(|\bexecSync?\s*\(/i],
    ['browser automation',/playwright|puppeteer|chromium\.launch|selenium-webdriver/i],
    ['native database',/better-sqlite3|sqlite3\b|leveldown|rocksdb/i],
    ['native media/image',/fluent-ffmpeg|\bffmpeg\b|\bsharp\b|node-canvas|from ['\"]canvas['\"]/i],
    ['native/ffi/hardware',/ffi-napi|ref-napi|serialport|node-hid|dockerode|\/var\/run\/docker\.sock/i],
  ];
  for (const [label,re] of hardPatterns) if (re.test(code)) hard.push(label);
  if (hard.length) return { classification:'sandbox-required', confidence:'high', reasons:first(hard), warnings };

  const stdio = /StdioServerTransport|server\/stdio|serveStdio/i.test(code);
  const nodeOnlyBootstrap = /process\.(argv|on\s*\(|exit\s*\()|createRequire\s*\(/i.test(code);
  if (stdio) reasons.push('stdio transport must be replaced by a Web-standard MCP handler');
  if (nodeOnlyBootstrap) warnings.push('Node CLI bootstrap/process lifecycle code must be stripped from the Worker entrypoint');

  if (sdkV2) {
    reasons.push('@modelcontextprotocol/server v2 is runtime-neutral for Workers');
    return { classification: stdio || nodeOnlyBootstrap ? 'edge-adaptable' : 'edge-likely', confidence: stdio ? 'high' : 'medium', reasons, warnings };
  }
  reasons.push('@modelcontextprotocol/sdk v1 requires import/transport migration to the v2 runtime-neutral packages');
  return { classification:'edge-adaptable', confidence:'medium', reasons, warnings };
}

async function scan(meta, temp, i) {
  const clone = join(temp,String(i).padStart(3,'0'));
  try {
    await execFileAsync('git',['clone','--depth','1','--single-branch','--no-tags',meta.repoUrl,clone],{timeout:60000,maxBuffer:1000000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
    const packages = [];
    await findPackageJsons(clone,clone,packages);
    let target = packages.find(x=>x.pkg?.name===meta.packageIdentifier);
    if (!target && meta.registrySubfolder) {
      const expected = join(clone,meta.registrySubfolder,'package.json');
      target = packages.find(x=>x.path===relative(clone,expected));
    }
    if (!target) return {...meta,classification:'uncertain',confidence:'low',reasons:['could not locate package.json matching the Registry npm identifier'],warnings:[],packagePath:null};
    const files = await readRuntimeFiles(target.dir);
    return {...meta,...analyze(meta,target.pkg,files),packagePath:relative(clone,target.dir)||'.',filesScanned:files.length};
  } catch (e) {
    return {...meta,classification:'inaccessible',confidence:'high',reasons:['repository could not be cloned/scanned'],warnings:[],error:String(e).slice(0,400)};
  } finally { await rm(clone,{recursive:true,force:true}).catch(()=>{}); }
}

function summarize(results) {
  const counts = {};
  for (const r of results) counts[r.classification]=(counts[r.classification]||0)+1;
  const analyzable = results.filter(r=>!['inaccessible','uncertain','local-bound','remote-wrapper'].includes(r.classification));
  const edge = analyzable.filter(r=>['edge-likely','edge-adaptable'].includes(r.classification)).length;
  const sandbox = analyzable.filter(r=>r.classification==='sandbox-required').length;
  return { sampleSize:results.length, counts, analyzableRemoteHostable:analyzable.length, edgeCandidates:edge, sandboxRequired:sandbox, edgeShare:analyzable.length?Number((edge/analyzable.length*100).toFixed(1)):0 };
}

async function main() {
  const sample = await collect();
  console.log(`Scanning ${sample.length} Official Registry npm+stdio MCP packages`);
  const temp = await mkdtemp(join(tmpdir(),'stdio-edge-study-'));
  const results = [];
  try {
    let cursor=0;
    async function worker(){ while(true){ const i=cursor++; if(i>=sample.length)return; results[i]=await scan(sample[i],temp,i); process.stdout.write(`\r${results.filter(Boolean).length}/${sample.length}`); } }
    await Promise.all(Array.from({length:4},worker));
    process.stdout.write('\n');
  } finally { await rm(temp,{recursive:true,force:true}).catch(()=>{}); }
  const summary=summarize(results);
  await writeFile('reports/stdio-edge-study.json',JSON.stringify({generatedAt:new Date().toISOString(),source:'Official MCP Registry npm+stdio packages',seed:SEED,summary,results},null,2)+'\n');
  const rows=results.map(r=>`| ${String(r.packageIdentifier).replace(/\|/g,'\\|')} | ${r.classification} | ${r.confidence} | ${(r.reasons?.[0]||'').replace(/\|/g,'\\|')} |`).join('\n');
  const md=`# npm+stdio MCP → Edge study\n\nThis samples **actual npm packages declared with stdio transport in the Official MCP Registry**, not arbitrary repository links. It locates the matching package.json inside each repository, ignores test/example directories, excludes local-only semantics and stdio→remote bridge wrappers, then classifies runtime blockers.\n\n## Result\n\n- Sample: **${summary.sampleSize}** packages\n- Analyzable remotely-hostable: **${summary.analyzableRemoteHostable}**\n- Edge candidates: **${summary.edgeCandidates}**\n- Sandbox-required: **${summary.sandboxRequired}**\n- Edge share of analyzable remotely-hostable: **${summary.edgeShare}%**\n\n## Buckets\n${Object.entries(summary.counts).map(([k,v])=>`- ${k}: **${v}**`).join('\n')}\n\n## Details\n\n| npm package | classification | confidence | primary reason |\n|---|---|---|---|\n${rows}\n`;
  await writeFile('reports/stdio-edge-study.md',md);
  console.log(summary);
}

main().catch(e=>{console.error(e?.stack||e);process.exit(1)});
