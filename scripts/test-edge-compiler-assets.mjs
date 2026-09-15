#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const WRANGLER = resolve(ROOT, 'node_modules/.bin/wrangler');
const REPO = 'https://github.com/neltomw/spaces-mcp-server.git';
const PORT = 8794;

function embeddedScript(source, name) {
  const match = source.match(new RegExp(`const ${name}_B64 = '([^']+)'`));
  if (!match) throw new Error(`Could not find ${name}_B64 in src/edge-scripts.ts`);
  return Buffer.from(match[1], 'base64').toString('utf8');
}

async function run(cmd, args, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function capture(cmd, args, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`)));
  });
}

async function waitFor(url, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  const assets = await readFile(resolve(ROOT, 'src/edge-scripts.ts'), 'utf8');
  const assess = embeddedScript(assets, 'ASSESS');
  const adapt = embeddedScript(assets, 'ADAPT');
  const smoke = embeddedScript(assets, 'SMOKE');

  const temp = await mkdtemp(join(tmpdir(), 'factory-edge-assets-'));
  const target = join(temp, 'repo');
  let dev;
  try {
    await run('git', ['clone', '--depth', '1', REPO, target], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    await writeFile(join(temp, 'assess.py'), assess);
    const assessmentResult = await capture('python3', [join(temp, 'assess.py')], {
      env: { ...process.env, TARGET: target, COMMAND: 'node spacesServer.js' },
    });
    const assessment = JSON.parse(assessmentResult.stdout.trim());
    if (!assessment.eligible || assessment.strategy !== 'stdio-main' || assessment.sdk !== 'v1') {
      throw new Error(`Unexpected assessment: ${assessmentResult.stdout}`);
    }

    await run('npx', ['-y', '@modelcontextprotocol/codemod@2.0.0', 'v1-to-v2', '.'], { cwd: target });
    const migrated = await readFile(join(target, assessment.entry), 'utf8');
    if (migrated.includes('@mcp-codemod-error')) throw new Error('Official v1→v2 codemod left an action-required marker');

    await writeFile(join(temp, 'adapt.mjs'), adapt);
    const edgeEntry = join(target, '.factory-edge-entry.mjs');
    await run('node', [join(temp, 'adapt.mjs'), join(target, assessment.entry), edgeEntry], { cwd: target });

    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: target });
    await writeFile(join(target, 'wrangler.edge.jsonc'), JSON.stringify({
      name: 'factory-edge-assets-test',
      main: '.factory-edge-entry.mjs',
      compatibility_date: '2026-09-15',
      compatibility_flags: ['nodejs_compat'],
    }, null, 2));

    await run(WRANGLER, ['deploy', '--dry-run', '--config', 'wrangler.edge.jsonc', '--outdir', '.edge-dist'], { cwd: target });

    dev = spawn(WRANGLER, ['dev', '--local', '--config', 'wrangler.edge.jsonc', '--port', String(PORT)], {
      cwd: target,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    dev.stdout.on('data', (data) => process.stdout.write(data));
    dev.stderr.on('data', (data) => process.stderr.write(data));

    const url = `http://127.0.0.1:${PORT}/mcp`;
    await waitFor(url);
    await writeFile(join(temp, 'smoke.mjs'), smoke);
    const result = await capture('node', [join(temp, 'smoke.mjs')], {
      env: { ...process.env, MCP_URL: url },
    });
    const parsed = JSON.parse(result.stdout.trim());
    if (!Array.isArray(parsed.tools) || parsed.tools.length < 20) {
      throw new Error(`Expected external MCP tools, got: ${result.stdout}`);
    }
    console.log(`PASS exact embedded compiler assets: ${parsed.tools.length} tools`);
  } finally {
    if (dev && !dev.killed) dev.kill('SIGTERM');
    await rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
