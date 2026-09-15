#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const WRANGLER = resolve(ROOT, 'node_modules/.bin/wrangler');
const REPO = process.env.EDGE_PROOF_REPO || 'https://github.com/YAMA-TANA/CALCULATE_MCP.git';
const FACTORY_MODULE = process.env.EDGE_PROOF_FACTORY_MODULE || 'src/server.ts';
const FACTORY_EXPORT = process.env.EDGE_PROOF_FACTORY_EXPORT || 'createCalculateServer';
const PORT = Number(process.env.EDGE_PROOF_PORT || 8791);

async function run(cmd, args, options = {}) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function waitFor(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.status < 500) return;
    } catch (error) { last = error; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw last || new Error(`Timed out waiting for ${url}`);
}

async function postMcp(baseUrl, body) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${text}`);
  if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
    const dataLine = text.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) throw new Error(`No SSE data frame in ${text.slice(0, 500)}`);
    return JSON.parse(dataLine.slice(5).trim());
  }
  return JSON.parse(text);
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), 'edge-proof-'));
  const target = join(tmp, 'repo');
  let dev;
  try {
    console.log(`Cloning ${REPO}`);
    await run('git', ['clone', '--depth', '1', REPO, target], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });

    const pkgPath = join(target, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    if (!pkg.dependencies?.['@modelcontextprotocol/server']) {
      throw new Error('PoC currently requires @modelcontextprotocol/server v2');
    }

    console.log('Installing target dependencies');
    await run('npm', ['install', '--ignore-scripts'], { cwd: target });

    const factoryRel = FACTORY_MODULE.replace(/^src\//, './').replace(/\.ts$/, '.js');
    const edgeEntry = `import { createMcpHandler } from '@modelcontextprotocol/server';\nimport { ${FACTORY_EXPORT} } from './${factoryRel}';\n\nconst handler = createMcpHandler(() => ${FACTORY_EXPORT}());\nexport default handler;\n`;
    await writeFile(join(target, 'src/__edge_entry.ts'), edgeEntry);

    const config = {
      name: 'edge-proof',
      main: 'src/__edge_entry.ts',
      compatibility_date: '2026-09-15',
      compatibility_flags: ['nodejs_compat'],
    };
    await writeFile(join(target, 'wrangler.edge.jsonc'), JSON.stringify(config, null, 2));

    console.log('Bundling with Cloudflare Wrangler/workerd');
    await run(WRANGLER, ['deploy', '--dry-run', '--config', 'wrangler.edge.jsonc', '--outdir', '.edge-dist'], { cwd: target });

    console.log('Starting local workerd via wrangler dev');
    dev = spawn(WRANGLER, ['dev', '--config', 'wrangler.edge.jsonc', '--port', String(PORT), '--local'], {
      cwd: target,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    dev.stdout.on('data', (d) => { logs += d.toString(); process.stdout.write(d); });
    dev.stderr.on('data', (d) => { logs += d.toString(); process.stderr.write(d); });

    const endpoint = `http://127.0.0.1:${PORT}/mcp`;
    await waitFor(endpoint);

    const init = await postMcp(endpoint, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'remote-mcp-factory-edge-proof', version: '0.1.0' },
      },
    });
    if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);

    const tools = await postMcp(endpoint, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    if (tools.error) throw new Error(`tools/list failed: ${JSON.stringify(tools.error)}`);
    const names = tools.result?.tools?.map((tool) => tool.name) || [];
    if (names.length < 1) throw new Error(`No tools returned: ${JSON.stringify(tools)}`);

    const report = {
      ok: true,
      repo: REPO,
      factoryModule: FACTORY_MODULE,
      factoryExport: FACTORY_EXPORT,
      toolCount: names.length,
      tools: names,
      initialization: init.result?.serverInfo || null,
      runtime: 'cloudflare-workerd-local',
      generatedAt: new Date().toISOString(),
    };
    await writeFile(resolve(ROOT, 'reports/edge-proof.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(ROOT, 'reports/edge-proof.md'), `# MCP → Cloudflare Worker proof\n\n- Result: **PASS**\n- Repo: ${REPO}\n- Factory: \`${FACTORY_EXPORT}\` from \`${FACTORY_MODULE}\`\n- MCP tools returned by workerd: **${names.length}**\n- Tools: ${names.map((n) => `\`${n}\``).join(', ')}\n- Tested: bundle → local Cloudflare workerd → MCP initialize → tools/list\n\nGenerated: ${report.generatedAt}\n`);
    console.log(`PASS: ${names.length} MCP tools returned from Cloudflare workerd`);
  } finally {
    if (dev && !dev.killed) dev.kill('SIGTERM');
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
