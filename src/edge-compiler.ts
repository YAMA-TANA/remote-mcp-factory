import type { Sandbox } from '@cloudflare/sandbox';
import type { Detection } from './analyze.js';
import type { EdgeBuildRow, Env, ServerRow } from './types.js';

const EDGE_COMPILER_VERSION = '0.1.0';
const EDGE_COMPATIBILITY_DATE = '2026-09-15';
const EDGE_SMOKE_PORT = 8793;
const MAX_D1_BUNDLE_BYTES = 1_800_000;

export interface EdgeAssessment {
  eligible: boolean;
  strategy: 'native-http' | 'v2-serve-stdio' | 'stdio-main' | 'unsupported';
  sdk: 'v1' | 'v2' | 'unknown';
  entry: string | null;
  reason: string;
  packageName: string | null;
}

export interface EdgeCompileResult {
  ok: boolean;
  assessment: EdgeAssessment;
  bundleHash?: string;
  sizeBytes?: number;
  tools?: string[];
  reason?: string;
}

function repoWorkdir(row: ServerRow, root = '/workspace/repo'): string {
  const subdir = row.subdir.trim().replace(/^\/+|\/+$/g, '');
  if (!subdir) return root;
  if (subdir.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(subdir)) throw new Error('Invalid subdir');
  return `${root}/${subdir}`;
}

function shell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function digestHex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readSandboxText(sandbox: Sandbox, path: string): Promise<string> {
  const file = await sandbox.readFile(path, { encoding: 'utf-8' }) as any;
  if (typeof file?.content === 'string') return file.content;
  if (file?.content instanceof ReadableStream) return await new Response(file.content).text();
  return String(file?.content ?? '');
}

async function execOk(sandbox: Sandbox, command: string, cwd?: string): Promise<string> {
  const result = await sandbox.exec(command, cwd ? { cwd } : undefined);
  if (!result.success) throw new Error((result.stderr || result.stdout || `Command failed: ${command}`).slice(0, 12000));
  return result.stdout;
}

const ASSESS_SCRIPT = String.raw`
import json, os, pathlib, re
root = pathlib.Path(os.environ['TARGET'])
command = os.environ.get('COMMAND','').strip()
out = {"eligible":False,"strategy":"unsupported","sdk":"unknown","entry":None,"reason":"unsupported entry pattern","packageName":None}

pkg_path = root / 'package.json'
if not pkg_path.exists():
    out['reason'] = 'Edge compiler currently supports Node/npm packages only'
    print(json.dumps(out)); raise SystemExit
try:
    pkg = json.loads(pkg_path.read_text())
except Exception:
    out['reason'] = 'package.json could not be parsed'
    print(json.dumps(out)); raise SystemExit
out['packageName'] = pkg.get('name')
deps = {}
for k in ('dependencies','optionalDependencies','peerDependencies'):
    deps.update(pkg.get(k) or {})
if '@modelcontextprotocol/sdk' in deps: out['sdk']='v1'
elif '@modelcontextprotocol/server' in deps: out['sdk']='v2'

heavy = {
 'playwright','playwright-core','puppeteer','puppeteer-core','better-sqlite3','sqlite3','sharp','canvas','node-pty',
 'selenium-webdriver','chromedriver','ffmpeg-static','@ffmpeg-installer/ffmpeg','node-libcurl','isolated-vm'
}
found_heavy = sorted([d for d in deps if d in heavy or d.startswith('@sparticuz/chromium')])
if found_heavy:
    out['reason'] = 'native/heavy dependency: ' + ', '.join(found_heavy[:4])
    print(json.dumps(out)); raise SystemExit

skip = {'node_modules','.git','dist','build','coverage','.next','.turbo','vendor','examples','example','test','tests','fixtures'}
files=[]
for p in root.rglob('*'):
    if not p.is_file() or any(part in skip for part in p.parts): continue
    if p.suffix.lower() not in {'.js','.mjs','.cjs','.ts','.mts','.cts','.jsx','.tsx'}: continue
    try:
        if p.stat().st_size > 500000: continue
        txt=p.read_text(errors='ignore')
    except Exception: continue
    files.append((p,txt))

entry_hint=None
m=re.match(r'^node\s+([^\s]+)', command)
if m: entry_hint=m.group(1)
if not entry_hint:
    m=re.match(r'^(?:npx\s+)?tsx\s+([^\s]+)', command)
    if m: entry_hint=m.group(1)
if command.startswith('npm run '):
    script_name=command.split()[2]
    script=str((pkg.get('scripts') or {}).get(script_name,''))
    m=re.search(r'(?:node|tsx|ts-node)\s+([^\s]+)',script)
    if m: entry_hint=m.group(1)
if not entry_hint:
    binv=pkg.get('bin')
    if isinstance(binv,str): entry_hint=binv
    elif isinstance(binv,dict) and binv: entry_hint=next(iter(binv.values()))

best=None; best_score=-1
for p,txt in files:
    rel=str(p.relative_to(root))
    score=0
    if entry_hint and rel.replace('\\','/').lstrip('./') == entry_hint.replace('\\','/').lstrip('./'): score += 100
    if '@modelcontextprotocol/' in txt: score += 25
    if 'StdioServerTransport' in txt or 'serveStdio' in txt: score += 25
    if re.search(r'new\s+(?:McpServer|Server)\s*\(',txt): score += 20
    if 'createMcpHandler' in txt: score += 30
    if re.search(r'\bmain\s*\(',txt): score += 3
    if score>best_score: best=(p,txt,rel); best_score=score
if not best or best_score < 35:
    out['reason']='Could not locate an MCP server entrypoint'
    print(json.dumps(out)); raise SystemExit
p,src,rel=best
out['entry']=rel.replace('\\','/')

if re.search(r"(?:from\s+['\"](?:node:)?child_process['\"]|require\(['\"](?:node:)?child_process['\"]\))",src):
    out['reason']='runtime child_process dependency'
    print(json.dumps(out)); raise SystemExit
if re.search(r'\b(?:spawn|execFile|execSync|spawnSync)\s*\(',src) and 'child_process' in src:
    out['reason']='runtime subprocess execution'
    print(json.dumps(out)); raise SystemExit
if re.search(r'\b(?:createServer|listen)\s*\(',src) and ('node:http' in src or "'http'" in src or '"http"' in src):
    out['reason']='entrypoint starts its own Node HTTP server'
    print(json.dumps(out)); raise SystemExit

semantic=''
for name in ('README.md','README','readme.md'):
    rp=root/name
    if rp.exists():
        try: semantic=rp.read_text(errors='ignore')[:120000].lower()
        except Exception: pass
if ('node:fs' in src or "require('fs')" in src or 'require("fs")' in src) and re.search(r'local\s+(?:files?|filesystem|directory|codebase)|working directory|read files from your',semantic):
    out['reason']='documented behavior depends on the caller\'s local filesystem'
    print(json.dumps(out)); raise SystemExit
if ('StreamableHTTPClientTransport' in src or 'SSEClientTransport' in src) and 'Stdio' in src:
    out['reason']='stdio wrapper around an already-remote MCP endpoint'
    print(json.dumps(out)); raise SystemExit

if 'createMcpHandler' in src and re.search(r'export\s+default',src):
    out.update({"eligible":True,"strategy":"native-http","reason":"already exposes a Web-standard MCP handler"})
elif 'serveStdio' in src:
    out.update({"eligible":True,"strategy":"v2-serve-stdio","reason":"serveStdio factory can be replaced with createMcpHandler"})
elif 'StdioServerTransport' in src and re.search(r'function\s+[A-Za-z_$][\w$]*\s*\(',src) and re.search(r'new\s+(?:McpServer|Server)\s*\(',src):
    out.update({"eligible":True,"strategy":"stdio-main","reason":"stdio bootstrap can be extracted into an MCP server factory"})
else:
    out['reason']='MCP semantics look edge-safe, but bootstrap shape is not yet supported by the compiler'
print(json.dumps(out))
`;

const ADAPT_SCRIPT = String.raw`
import fs from 'node:fs';
const path=process.argv[2];
let s=fs.readFileSync(path,'utf8').replace(/^#!.*\n/,'');
function addHandlerImport(code){
  if(/\bcreateMcpHandler\b/.test(code)) return code;
  let done=false;
  code=code.replace(/import\s*\{([^}]*)\}\s*from\s*(['"])@modelcontextprotocol\/server\2\s*;?/,(_,inside,q)=>{done=true;const names=inside.split(',').map(x=>x.trim()).filter(Boolean);if(!names.includes('createMcpHandler'))names.push('createMcpHandler');return `import { ${names.join(', ')} } from ${q}@modelcontextprotocol/server${q};`;});
  if(done)return code;
  code=code.replace(/const\s*\{([^}]*)\}\s*=\s*require\((['"])@modelcontextprotocol\/server\2\)\s*;?/,(_,inside,q)=>{done=true;const names=inside.split(',').map(x=>x.trim()).filter(Boolean);if(!names.includes('createMcpHandler'))names.push('createMcpHandler');return `const { ${names.join(', ')} } = require(${q}@modelcontextprotocol/server${q});`;});
  if(done)return code;
  return `import { createMcpHandler } from '@modelcontextprotocol/server';\n${code}`;
}
function stripStdioImport(code){
  return code.split('\n').filter(line=>!(line.includes('@modelcontextprotocol/server/stdio') && (line.includes('StdioServerTransport')||line.includes('serveStdio')))).join('\n');
}
function matchBrace(code,open){
  let depth=0,quote=null,esc=false,line=false,block=false;
  for(let i=open;i<code.length;i++){
    const c=code[i],n=code[i+1];
    if(line){if(c==='\n')line=false;continue}
    if(block){if(c==='*'&&n==='/'){block=false;i++}continue}
    if(quote){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===quote){quote=null}continue}
    if(c==='/'&&n==='/'){line=true;i++;continue}
    if(c==='/'&&n==='*'){block=true;i++;continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue}
    if(c==='{')depth++; else if(c==='}'&&--depth===0)return i;
  }
  return -1;
}
if(/createMcpHandler/.test(s)&&/export\s+default/.test(s)){
  fs.writeFileSync(path,s);process.exit(0);
}
s=addHandlerImport(s);
if(/\bserveStdio\s*\(/.test(s)){
  const m=s.match(/(?:await\s+)?serveStdio\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*;?/);
  if(!m) throw new Error('serveStdio call is not a simple named factory');
  s=stripStdioImport(s);
  s=s.replace(m[0],`export default createMcpHandler(${m[1]});`);
  fs.writeFileSync(path,s);process.exit(0);
}
const fnRe=/(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
let chosen=null,m;
while((m=fnRe.exec(s))){const open=s.indexOf('{',m.index);const close=matchBrace(s,open);if(close<0)continue;const body=s.slice(open+1,close);if(/new\s+(?:McpServer|Server)\s*\(/.test(body)&&/StdioServerTransport|\.connect\s*\(/.test(body)){chosen={start:m.index,headEnd:open+1,close,name:m[2],body};break}}
if(!chosen) throw new Error('No self-contained stdio server factory function found');
const sm=chosen.body.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:McpServer|Server)\s*\(/);
if(!sm) throw new Error('Server variable not found');
const server=sm[1];
let body=chosen.body;
let replaced=false;
const transportRe=new RegExp(`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+StdioServerTransport\\s*\\([^;]*\\)\\s*;[\\s\\S]*?await\\s+${server}\\.connect\\s*\\(\\s*\\1\\s*\\)\\s*;`);
if(transportRe.test(body)){body=body.replace(transportRe,`return ${server};`);replaced=true}
const directRe=new RegExp(`await\\s+${server}\\.connect\\s*\\(\\s*new\\s+StdioServerTransport\\s*\\([^)]*\\)\\s*\\)\\s*;`);
if(!replaced&&directRe.test(body)){body=body.replace(directRe,`return ${server};`);replaced=true}
if(!replaced)throw new Error('Could not replace stdio connect bootstrap');
const head=s.slice(chosen.start,chosen.headEnd).replace(new RegExp(`function\\s+${chosen.name}\\b`),'function buildServer');
s=s.slice(0,chosen.start)+head+body+'}'+s.slice(chosen.close+1);
s=stripStdioImport(s);
const invocation=new RegExp(`\\n\\s*(?:await\\s+)?${chosen.name}\\s*\\(\\s*\\)\\s*\\.catch\\s*\\([\\s\\S]*$`);
if(invocation.test(s))s=s.replace(invocation,'\n');
else s=s.replace(new RegExp(`\\n\\s*(?:await\\s+)?${chosen.name}\\s*\\(\\s*\\)\\s*;?\\s*$`),'\n');
s+=`\nexport default createMcpHandler(() => buildServer(), { onerror: (error) => console.error('MCP_EDGE_HANDLER', error?.stack || error) });\n`;
if(/StdioServerTransport|@modelcontextprotocol\/server\/stdio/.test(s))throw new Error('stdio runtime dependency remains after adaptation');
fs.writeFileSync(path,s);
`;

const SMOKE_SCRIPT = String.raw`
const url=process.env.MCP_URL;
async function call(body){
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify(body)});
  const t=await r.text();
  if(!r.ok) throw new Error(r.status+': '+t);
  if((r.headers.get('content-type')||'').includes('text/event-stream')){
    const line=t.split('\n').find(x=>x.startsWith('data:'));
    if(!line)throw new Error('SSE response had no data event: '+t.slice(0,1000));
    return JSON.parse(line.slice(5).trim());
  }
  return JSON.parse(t);
}
const init=await call({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'remote-mcp-factory-edge-smoke',version:'0.1'}}});
if(init.error)throw new Error(JSON.stringify(init.error));
const tools=await call({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
if(tools.error)throw new Error(JSON.stringify(tools.error));
console.log(JSON.stringify({tools:(tools.result?.tools||[]).map(x=>x.name)}));
`;

async function assessEdge(sandbox: Sandbox, row: ServerRow, detection: Detection): Promise<EdgeAssessment> {
  if (detection.runtime !== 'node') {
    return { eligible: false, strategy: 'unsupported', sdk: 'unknown', entry: null, reason: `Edge compiler currently targets Node/TypeScript; detected ${detection.runtime}`, packageName: null };
  }
  const cwd = repoWorkdir(row);
  await sandbox.writeFile('/tmp/factory-edge-assess.py', ASSESS_SCRIPT);
  const command = row.command?.trim() || detection.command || '';
  const result = await sandbox.exec(`TARGET=${shell(cwd)} COMMAND=${shell(command)} python3 /tmp/factory-edge-assess.py`);
  if (!result.success) throw new Error(result.stderr || 'Edge assessment failed');
  return JSON.parse(result.stdout.trim()) as EdgeAssessment;
}

async function persistEdgeBuild(env: Env, row: ServerRow, values: Omit<EdgeBuildRow, 'server_id' | 'updated_at'>): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO edge_builds (server_id,status,compiler_version,bundle_hash,bundle,size_bytes,tool_count,tools_json,reason,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(server_id) DO UPDATE SET status=excluded.status,compiler_version=excluded.compiler_version,bundle_hash=excluded.bundle_hash,bundle=excluded.bundle,size_bytes=excluded.size_bytes,tool_count=excluded.tool_count,tools_json=excluded.tools_json,reason=excluded.reason,updated_at=excluded.updated_at
  `).bind(
    row.id,
    values.status,
    values.compiler_version,
    values.bundle_hash,
    values.bundle,
    values.size_bytes,
    values.tool_count,
    values.tools_json,
    values.reason,
    new Date().toISOString(),
  ).run();
}

export async function tryCompileToEdge(env: Env, sandbox: Sandbox, row: ServerRow, detection: Detection): Promise<EdgeCompileResult> {
  let assessment: EdgeAssessment;
  try {
    assessment = await assessEdge(sandbox, row, detection);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    assessment = { eligible: false, strategy: 'unsupported', sdk: 'unknown', entry: null, reason, packageName: null };
  }

  if (!assessment.eligible || !assessment.entry) {
    await persistEdgeBuild(env, row, {
      status: 'incompatible', compiler_version: EDGE_COMPILER_VERSION, bundle_hash: null, bundle: null,
      size_bytes: 0, tool_count: 0, tools_json: '[]', reason: assessment.reason.slice(0, 4000),
    });
    return { ok: false, assessment, reason: assessment.reason };
  }

  const edgeRoot = '/workspace/edge-build';
  try {
    await execOk(sandbox, `rm -rf ${edgeRoot} && cp -a /workspace/repo ${edgeRoot}`);
    const cwd = repoWorkdir(row, edgeRoot);
    const entry = `${cwd}/${assessment.entry}`;

    if (assessment.sdk === 'v1') {
      await execOk(sandbox, 'npx -y @modelcontextprotocol/codemod@2.0.0 v1-to-v2 .', cwd);
      const markers = await sandbox.exec(`grep -R --line-number --include='*.js' --include='*.ts' --include='*.mjs' --include='*.mts' '@mcp-codemod-error' . | head -20`, { cwd });
      if (markers.stdout.trim()) throw new Error(`MCP SDK codemod requires manual migration: ${markers.stdout.trim()}`);
    }

    if (assessment.strategy !== 'native-http') {
      await sandbox.writeFile('/tmp/factory-edge-adapt.mjs', ADAPT_SCRIPT);
      await execOk(sandbox, `node /tmp/factory-edge-adapt.mjs ${shell(entry)}`, cwd);
    }

    // Do not allow arbitrary package postinstall scripts in the cheap Edge compiler path.
    await execOk(sandbox, 'npm install --ignore-scripts --no-audit --no-fund', cwd);

    const config = {
      name: `edge-${row.id}`,
      main: assessment.entry,
      compatibility_date: EDGE_COMPATIBILITY_DATE,
      compatibility_flags: ['nodejs_compat'],
    };
    await sandbox.writeFile(`${cwd}/wrangler.edge.jsonc`, JSON.stringify(config, null, 2));
    await execOk(sandbox, 'rm -rf .edge-dist && wrangler deploy --dry-run --config wrangler.edge.jsonc --outdir .edge-dist', cwd);

    const bundleLine = (await execOk(sandbox, `find .edge-dist -type f \\( -name '*.js' -o -name '*.mjs' \\) -printf '%s %p\\n' | sort -nr | head -1`, cwd)).trim();
    const match = bundleLine.match(/^(\d+)\s+(.+)$/);
    if (!match) throw new Error('Wrangler did not emit a JavaScript Worker bundle');
    const emittedSize = Number(match[1]);
    const emittedPath = `${cwd}/${match[2].replace(/^\.\//, '')}`;
    if (!Number.isFinite(emittedSize) || emittedSize <= 0) throw new Error('Invalid Worker bundle size');
    if (emittedSize > MAX_D1_BUNDLE_BYTES) throw new Error(`Edge bundle is ${emittedSize} bytes; D1-backed MVP limit is ${MAX_D1_BUNDLE_BYTES}`);

    await sandbox.writeFile('/tmp/factory-edge-smoke.mjs', SMOKE_SCRIPT);
    const dev = await sandbox.startProcess(`wrangler dev --local --config wrangler.edge.jsonc --port ${EDGE_SMOKE_PORT}`, { cwd, processId: `edge-smoke-${row.id}` });
    let tools: string[] = [];
    try {
      await dev.waitForPort(EDGE_SMOKE_PORT, { mode: 'tcp', timeout: 20000 });
      const smoke = await execOk(sandbox, `MCP_URL=http://127.0.0.1:${EDGE_SMOKE_PORT}/mcp node /tmp/factory-edge-smoke.mjs`, cwd);
      const parsed = JSON.parse(smoke.trim()) as { tools?: string[] };
      tools = Array.isArray(parsed.tools) ? parsed.tools.filter((x): x is string => typeof x === 'string') : [];
    } finally {
      await sandbox.killProcess(dev.id).catch(() => undefined);
    }

    const bundle = await readSandboxText(sandbox, emittedPath);
    const sizeBytes = new TextEncoder().encode(bundle).byteLength;
    if (sizeBytes > MAX_D1_BUNDLE_BYTES) throw new Error(`Bundled Worker exceeds D1-backed MVP limit after read (${sizeBytes} bytes)`);
    const bundleHash = await digestHex(bundle);

    await persistEdgeBuild(env, row, {
      status: 'ready', compiler_version: EDGE_COMPILER_VERSION, bundle_hash: bundleHash, bundle,
      size_bytes: sizeBytes, tool_count: tools.length, tools_json: JSON.stringify(tools), reason: assessment.reason,
    });
    return { ok: true, assessment, bundleHash, sizeBytes, tools };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await persistEdgeBuild(env, row, {
      status: 'failed', compiler_version: EDGE_COMPILER_VERSION, bundle_hash: null, bundle: null,
      size_bytes: 0, tool_count: 0, tools_json: '[]', reason: reason.slice(0, 4000),
    });
    return { ok: false, assessment, reason };
  }
}
