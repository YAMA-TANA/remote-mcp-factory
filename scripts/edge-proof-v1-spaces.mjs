#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const WRANGLER = resolve(ROOT, 'node_modules/.bin/wrangler');
const REPO = 'https://github.com/neltomw/spaces-mcp-server.git';
const PORT = 8792;

async function run(cmd,args,opts={}) {
  await new Promise((ok,bad)=>{
    const p=spawn(cmd,args,{stdio:'inherit',...opts});
    p.on('error',bad); p.on('exit',c=>c===0?ok():bad(new Error(`${cmd} exited ${c}`)));
  });
}
async function waitFor(url,ms=45000){const end=Date.now()+ms;while(Date.now()<end){try{const r=await fetch(url);if(r.status<500)return}catch{}await new Promise(r=>setTimeout(r,400))}throw new Error(`timeout ${url}`)}
async function mcp(url,body){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify(body)});const t=await r.text();if(!r.ok)throw new Error(`${r.status}: ${t}`);if((r.headers.get('content-type')||'').includes('text/event-stream')){const line=t.split('\n').find(x=>x.startsWith('data:'));if(!line)throw new Error(t);return JSON.parse(line.slice(5).trim())}return JSON.parse(t)}

function transformV1CommonJs(source) {
  let s = source.replace(/^#!.*\n/, '');
  s = s.replace(
    /const \{ Server \} = require\(['"]@modelcontextprotocol\/sdk\/server\/index\.js['"]\);?\s*/,
    `import { Server, createMcpHandler } from '@modelcontextprotocol/server';\n`,
  );
  s = s.replace(/const \{ StdioServerTransport \} = require\(['"]@modelcontextprotocol\/sdk\/server\/stdio\.js['"]\);?\s*/, '');
  s = s.replace(
    /const \{\s*CallToolRequestSchema,\s*ListToolsRequestSchema,\s*ListResourcesRequestSchema,\s*ReadResourceRequestSchema,\s*\} = require\(['"]@modelcontextprotocol\/sdk\/types\.js['"]\);?/m,
    `import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/core';`,
  );
  s = s.replace('async function main() {', 'function buildServer() {');
  const tail = /\s*\/\/ Start server\s*\n\s*const transport = new StdioServerTransport\(\);\s*\n\s*await server\.connect\(transport\);\s*\n\s*console\.error\([^\n]*\);\s*\n}\s*\n\s*main\(\)\.catch\([\s\S]*$/m;
  if (!tail.test(s)) throw new Error('Could not identify stdio bootstrap tail');
  s = s.replace(tail, `\n  return server;\n}\n\nexport default createMcpHandler(() => buildServer(), { onerror: (error) => console.error('MCP_HANDLER_ERROR', error?.stack || error) });\n`);
  if (/StdioServerTransport|@modelcontextprotocol\/sdk/.test(s)) throw new Error('v1/stdin imports remain after codemod');
  return s;
}

async function main(){
  const tmp=await mkdtemp(join(tmpdir(),'edge-v1-proof-')); const target=join(tmp,'repo'); let dev;
  try{
    await run('git',['clone','--depth','1',REPO,target],{env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
    const original=await readFile(join(target,'spacesServer.js'),'utf8');
    const transformed=transformV1CommonJs(original);
    await writeFile(join(target,'edge-entry.mjs'),transformed);
    const pkg=JSON.parse(await readFile(join(target,'package.json'),'utf8'));
    pkg.type='module';
    pkg.dependencies={...(pkg.dependencies||{})};
    delete pkg.dependencies['@modelcontextprotocol/sdk'];
    pkg.dependencies['@modelcontextprotocol/server']='^2.0.0';
    pkg.dependencies['@modelcontextprotocol/core']='^2.0.0';
    await writeFile(join(target,'package.json'),JSON.stringify(pkg,null,2));
    await writeFile(join(target,'wrangler.edge.jsonc'),JSON.stringify({name:'spaces-edge-proof',main:'edge-entry.mjs',compatibility_date:'2026-09-15',compatibility_flags:['nodejs_compat']},null,2));
    await run('npm',['install','--ignore-scripts'],{cwd:target});
    await run(WRANGLER,['deploy','--dry-run','--config','wrangler.edge.jsonc','--outdir','.edge-dist'],{cwd:target});
    dev=spawn(WRANGLER,['dev','--config','wrangler.edge.jsonc','--port',String(PORT),'--local'],{cwd:target,env:{...process.env,CI:'1'},stdio:['ignore','pipe','pipe']});
    dev.stdout.on('data',d=>process.stdout.write(d)); dev.stderr.on('data',d=>process.stderr.write(d));
    const url=`http://127.0.0.1:${PORT}/mcp`; await waitFor(url);
    const init=await mcp(url,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'factory-v1-proof',version:'0.1'}}});
    if(init.error)throw new Error(JSON.stringify(init.error));
    const tools=await mcp(url,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}}); if(tools.error)throw new Error(JSON.stringify(tools.error));
    const names=tools.result?.tools?.map(x=>x.name)||[]; if(!names.length)throw new Error('No tools returned');
    const report={ok:true,sourceRepo:REPO,sourceSdk:'@modelcontextprotocol/sdk v1',conversion:['replace v1 SDK imports with v2 runtime-neutral packages','remove StdioServerTransport','extract server construction into factory','serve with createMcpHandler'],runtime:'cloudflare-workerd-local',toolCount:names.length,tools:names,generatedAt:new Date().toISOString()};
    await writeFile(resolve(ROOT,'reports/edge-proof-v1-spaces.json'),JSON.stringify(report,null,2)+'\n');
    await writeFile(resolve(ROOT,'reports/edge-proof-v1-spaces.md'),`# Automatic v1 stdio → Worker proof\n\n- Result: **PASS**\n- Source: ${REPO}\n- Original SDK: \`@modelcontextprotocol/sdk\` v1\n- Original transport: \`StdioServerTransport\`\n- Conversion: automated source rewrite; source repository left untouched\n- Runtime: Cloudflare workerd via Wrangler\n- MCP handshake: \`initialize\` ✅\n- \`tools/list\`: **${names.length} tools** ✅\n\nTools: ${names.map(n=>`\`${n}\``).join(', ')}\n\nGenerated: ${report.generatedAt}\n`);
    console.log(`PASS automatic v1 conversion: ${names.length} tools`);
  }finally{if(dev&&!dev.killed)dev.kill('SIGTERM');await rm(tmp,{recursive:true,force:true}).catch(()=>{})}
}
main().catch(e=>{console.error(e?.stack||e);process.exit(1)});
