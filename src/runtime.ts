import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import { detectMcp, type Detection } from './analyze.js';
import { prepareBinaryBridge, restoreBridgeSource } from './bridge-compiler.js';
import { tryCompileToEdge } from './edge-compiler.js';
import { ensureEdgeBuildSchema } from './schema-compat.js';
import { loadDeploymentSecrets } from './secrets.js';
import type { Env, ServerRow } from './types.js';

const PORT = 8080;
const SANDBOX_READY_MARKER = '/workspace/.sandbox-ready';

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

async function cloneRepository(sandbox: Sandbox, row: ServerRow): Promise<void> {
  const repo = validateRepoUrl(row.repo_url);
  const branch = safeBranch(row.branch || 'main');
  await sandbox.exec('rm -rf /workspace/repo /workspace/.sandbox-ready /workspace/edge-build');
  const result = await sandbox.exec(`git clone --depth 1 --branch ${JSON.stringify(branch)} ${JSON.stringify(repo)} /workspace/repo`);
  if (!result.success) throw new Error(result.stderr || 'git clone failed');
}

async function sandboxReady(sandbox: Sandbox): Promise<boolean> {
  const probe = await sandbox.exec(`test -f ${SANDBOX_READY_MARKER} && echo yes || echo no`);
  return probe.stdout.includes('yes');
}

async function repositoryPresent(sandbox: Sandbox): Promise<boolean> {
  const probe = await sandbox.exec('test -d /workspace/repo && echo yes || echo no');
  return probe.stdout.includes('yes');
}

async function prepareSandboxFallback(env: Env, row: ServerRow, sandbox: Sandbox, detection?: Detection): Promise<ServerRow> {
  const detected = detection ?? await detectMcp(sandbox, row.subdir);
  const cwd = workdir(row);
  let result;
  for (const command of detected.install) {
    result = await sandbox.exec(command, { cwd });
    if (!result.success) throw new Error(`Install failed: ${result.stderr || result.stdout}`);
  }
  for (const command of detected.build) {
    result = await sandbox.exec(command, { cwd });
    if (!result.success) throw new Error(`Build failed: ${result.stderr || result.stdout}`);
  }

  const command = row.command?.trim() || detected.command;
  if (!command) throw new Error('Could not detect the stdio start command. Set command manually.');
  await sandbox.writeFile(SANDBOX_READY_MARKER, new Date().toISOString());
  await env.DB.prepare(`UPDATE servers SET status=?, detected_runtime=?, detected_command=?, error=NULL, updated_at=? WHERE id=?`)
    .bind('ready', `sandbox-${detected.runtime}`, command, new Date().toISOString(), row.id).run();
  return { ...row, status: 'ready', detected_runtime: `sandbox-${detected.runtime}`, detected_command: command, error: null };
}

export async function buildServer(env: Env, row: ServerRow): Promise<void> {
  const sandbox = serverSandbox(env, row);
  await env.DB.prepare('UPDATE servers SET status=?, error=NULL, updated_at=? WHERE id=?')
    .bind('building', new Date().toISOString(), row.id).run();

  try {
    await ensureEdgeBuildSchema(env);
    await cloneRepository(sandbox, row);
    const detection = await detectMcp(sandbox, row.subdir);
    const command = row.command?.trim() || detection.command;

    // Try a narrowly-scoped native rewrite before the ordinary Edge compiler. The bridge
    // stage self-verifies the transformed source and only becomes active for a single,
    // pure ffprobe helper. Everything else remains a normal Edge/Sandbox decision.
    const bridge = await prepareBinaryBridge(env, sandbox, row);
    const edge = await tryCompileToEdge(env, sandbox, row, detection);

    if (bridge.active) {
      // The artifact has already been materialized by tryCompileToEdge. Restore the source
      // clone so emergency Linux fallback always executes pristine upstream code.
      await restoreBridgeSource(sandbox, row);
      if (edge.ok) {
        edge.compatibility = bridge.compatibility;
        await env.DB.prepare('UPDATE edge_builds SET compatibility_json=?, reason=?, updated_at=? WHERE server_id=?')
          .bind(JSON.stringify(bridge.compatibility), bridge.compatibility.summary, new Date().toISOString(), row.id).run();
      }
    }

    if (edge.compatibility.runtime === 'local-bound') {
      const reason = `${edge.compatibility.summary}. This MCP depends on the user's local machine and cannot preserve its semantics on a cloud host without a local relay.`;
      await env.DB.prepare('UPDATE edge_builds SET status=?, reason=?, updated_at=? WHERE server_id=?')
        .bind('incompatible', reason, new Date().toISOString(), row.id).run();
      await env.DB.prepare('UPDATE servers SET status=?, detected_runtime=?, detected_command=?, error=?, updated_at=? WHERE id=?')
        .bind('local-bound', 'local-bound', command, reason.slice(0, 8000), new Date().toISOString(), row.id).run();
      return;
    }

    if (edge.ok && (edge.compatibility.runtime === 'edge' || edge.compatibility.runtime === 'edge-with-bridge')) {
      const detectedRuntime = edge.compatibility.runtime === 'edge-with-bridge' ? 'edge-node-bridge' : 'edge-node';
      await env.DB.prepare(`UPDATE servers SET status=?, detected_runtime=?, detected_command=?, error=NULL, updated_at=? WHERE id=?`)
        .bind('ready', detectedRuntime, command, new Date().toISOString(), row.id).run();
      return;
    }

    if (edge.ok && edge.compatibility.runtime !== 'edge') {
      // A candidate is not an active bridge. It stays on Linux unless the compiler
      // has rewritten and verified the native call, represented by edge-with-bridge.
      await env.DB.prepare('UPDATE edge_builds SET status=?, reason=?, updated_at=? WHERE server_id=?')
        .bind('incompatible', `${edge.compatibility.summary}. Using Sandbox until bridge rewriting is verified.`, new Date().toISOString(), row.id).run();
    }

    await prepareSandboxFallback(env, row, sandbox, detection);
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

export async function stopRuntime(env: Env, row: Pick<ServerRow, 'id' | 'owner'>): Promise<void> {
  const sandbox = serverSandbox(env, row);
  const list = await sandbox.listProcesses().catch(() => [] as any[]);
  for (const process of list) {
    if (!String((process as any).command ?? '').includes('mcp-proxy')) continue;
    await sandbox.killProcess((process as any).id).catch(() => undefined);
  }
}

export async function ensureRuntime(env: Env, row: ServerRow): Promise<string> {
  if (row.status === 'local-bound' || row.detected_runtime === 'local-bound') {
    throw new Error('Local-bound MCPs require a local relay and cannot run in the cloud runtime');
  }
  const sandbox = serverSandbox(env, row);

  if (!(await processRunning(sandbox))) {
    if (!(await repositoryPresent(sandbox))) await cloneRepository(sandbox, row);

    let fresh = row;
    if (!(await sandboxReady(sandbox))) {
      fresh = await prepareSandboxFallback(env, row, sandbox);
    } else {
      fresh = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(row.id).first<ServerRow>() ?? row;
    }

    const upstream = fresh.command?.trim() || fresh.detected_command;
    if (!upstream) throw new Error('No stdio command configured');
    const proxy = `mcp-proxy --port ${PORT} --stateless --server stream --shell -- ${upstream}`;
    const deploymentSecrets = await loadDeploymentSecrets(env, row.id);
    const process = await sandbox.startProcess(proxy, {
      cwd: workdir(fresh),
      env: deploymentSecrets.values,
    });
    await process.waitForPort(PORT, { mode: 'tcp', timeout: 15000 });
  }

  const tunnel = await sandbox.tunnels.get(PORT);
  return tunnel.url.replace(/\/$/, '');
}
