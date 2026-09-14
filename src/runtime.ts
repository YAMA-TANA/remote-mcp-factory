import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import { detectMcp } from './analyze.js';
import type { Env, ServerRow } from './types.js';

const PORT = 8080;

function validateRepoUrl(value: string): string {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.hostname !== 'github.com') throw new Error('Only https://github.com/... repositories are supported in this MVP');
  const parts = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/');
  if (parts.length !== 2 || parts.some((v) => !/^[A-Za-z0-9_.-]+$/.test(v))) throw new Error('Invalid GitHub repository URL');
  return `https://github.com/${parts[0]}/${parts[1]}.git`;
}

function safeBranch(value: string): string {
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(value) || value.includes('..')) throw new Error('Invalid branch');
  return value;
}

function workdir(row: ServerRow): string {
  if (!row.subdir) return '/workspace/repo';
  if (row.subdir.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(row.subdir)) throw new Error('Invalid subdir');
  return `/workspace/repo/${row.subdir.replace(/^\/+|\/+$/g, '')}`;
}

export function serverSandbox(env: Env, row: Pick<ServerRow, 'id' | 'owner'>): Sandbox {
  const key = `mcp-${row.owner}-${row.id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60);
  return getSandbox(env.Sandbox, key, { normalizeId: true, sleepAfter: '10m' });
}

export async function buildServer(env: Env, row: ServerRow): Promise<void> {
  const sandbox = serverSandbox(env, row);
  const repo = validateRepoUrl(row.repo_url);
  const branch = safeBranch(row.branch || 'main');

  await env.DB.prepare('UPDATE servers SET status=?, error=NULL, updated_at=? WHERE id=?')
    .bind('building', new Date().toISOString(), row.id).run();

  try {
    await sandbox.exec('rm -rf /workspace/repo');
    let r = await sandbox.exec(`git clone --depth 1 --branch ${JSON.stringify(branch)} ${JSON.stringify(repo)} /workspace/repo`);
    if (!r.success) throw new Error(r.stderr || 'git clone failed');

    const detection = await detectMcp(sandbox, row.subdir);
    const cwd = workdir(row);
    for (const command of detection.install) {
      r = await sandbox.exec(command, { cwd });
      if (!r.success) throw new Error(`Install failed: ${r.stderr || r.stdout}`);
    }
    for (const command of detection.build) {
      r = await sandbox.exec(command, { cwd });
      if (!r.success) throw new Error(`Build failed: ${r.stderr || r.stdout}`);
    }

    const command = row.command?.trim() || detection.command;
    if (!command) throw new Error('Could not detect the stdio start command. Set command manually.');

    await env.DB.prepare(`UPDATE servers SET status=?, detected_runtime=?, detected_command=?, error=NULL, updated_at=? WHERE id=?`)
      .bind('ready', detection.runtime, command, new Date().toISOString(), row.id).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare('UPDATE servers SET status=?, error=?, updated_at=? WHERE id=?')
      .bind('error', message.slice(0, 8000), new Date().toISOString(), row.id).run();
    throw error;
  }
}

async function processRunning(sandbox: Sandbox): Promise<boolean> {
  const list = await sandbox.listProcesses();
  return list.some((p: any) => String(p.command ?? '').includes('mcp-proxy'));
}

export async function ensureRuntime(env: Env, row: ServerRow): Promise<string> {
  const sandbox = serverSandbox(env, row);
  const cwd = workdir(row);

  if (!(await processRunning(sandbox))) {
    const probe = await sandbox.exec('test -d /workspace/repo && echo yes || echo no');
    if (!probe.stdout.includes('yes')) {
      await buildServer(env, row);
      const fresh = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(row.id).first<ServerRow>();
      if (!fresh) throw new Error('Server disappeared during rebuild');
      row = fresh;
    }

    const upstream = row.command?.trim() || row.detected_command;
    if (!upstream) throw new Error('No stdio command configured');

    const proxy = `mcp-proxy --port ${PORT} --stateless --server stream --shell -- ${upstream}`;
    const process = await sandbox.startProcess(proxy, { cwd });
    await process.waitForPort(PORT, { mode: 'tcp', timeout: 15000 });
  }

  const tunnel = await sandbox.tunnels.get(PORT);
  return tunnel.url.replace(/\/$/, '');
}
