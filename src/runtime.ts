import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import { detectMcp, type Detection } from './analyze.js';
import { prepareBinaryBridge, restoreBridgeSource } from './bridge-compiler.js';
import { tryCompileToEdge } from './edge-compiler.js';
import { EDGE_SMOKE_SCRIPT } from './edge-scripts.js';
import { createInstallationAccessToken } from './github-app.js';
import { ensureGitHubSchema } from './github-schema.js';
import { ensureEdgeBuildSchema } from './schema-compat.js';
import { loadDeploymentSecrets } from './secrets.js';
import type { Env, ServerRow } from './types.js';

const PORT = 8080;
const SANDBOX_READY_MARKER = '/workspace/.sandbox-ready';
const SANDBOX_SMOKE_SCRIPT = '/tmp/factory-sandbox-smoke.mjs';
const GIT_AUTH_HOME = '/tmp/factory-git-home';

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

async function cloneRepository(env: Env, sandbox: Sandbox, row: ServerRow): Promise<void> {
  const repo = validateRepoUrl(row.repo_url);
  const branch = safeBranch(row.branch || 'main');
  await sandbox.exec(`rm -rf /workspace/repo /workspace/.sandbox-ready /workspace/edge-build ${GIT_AUTH_HOME}`);

  let authenticated = false;
  try {
    if (row.github_installation_id && row.github_repo_id) {
      const token = await createInstallationAccessToken(env, row.github_installation_id, row.github_repo_id);
      await sandbox.exec(`mkdir -p ${GIT_AUTH_HOME} && chmod 700 ${GIT_AUTH_HOME}`);
      await sandbox.writeFile(`${GIT_AUTH_HOME}/.netrc`, `machine github.com\nlogin x-access-token\npassword ${token}\n`);
      await sandbox.exec(`chmod 600 ${GIT_AUTH_HOME}/.netrc`);
      authenticated = true;
    }

    const prefix = authenticated ? `HOME=${GIT_AUTH_HOME} GIT_TERMINAL_PROMPT=0` : 'GIT_TERMINAL_PROMPT=0';
    const result = await sandbox.exec(`${prefix} git clone --depth 1 --branch ${JSON.stringify(branch)} ${JSON.stringify(repo)} /workspace/repo`);
    if (!result.success) throw new Error(result.stderr || 'git clone failed');
  } finally {
    await sandbox.exec(`rm -rf ${GIT_AUTH_HOME}`).catch(() => undefined);
  }
}

async function sandboxReady(sandbox: Sandbox): Promise<boolean> {
  const probe = await sandbox.exec(`test -f ${SANDBOX_READY_MARKER} && echo yes || echo no`);
  return probe.stdout.includes('yes');
}

async function repositoryPresent(sandbox: Sandbox): Promise<boolean> {
  const probe = await sandbox.exec('test -d /workspace/repo && echo yes || echo no');
  return probe.stdout.includes('yes');
}

async function startVerifiedSandboxRuntime(
  env: Env,
  row: ServerRow,
  sandbox: Sandbox,
  command: string,
  cwd: string,
): Promise<string[]> {
  const deploymentSecrets = await loadDeploymentSecrets(env, row.id);
  const proxy = `mcp-proxy --port ${PORT} --stateless --server stream --shell -- ${command}`;
  const processId = `mcp-proxy-${row.id}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 63);
  await sandbox.writeFile(SANDBOX_SMOKE_SCRIPT, EDGE_SMOKE_SCRIPT);
  const process = await sandbox.startProcess(proxy, {
    cwd,
    env: deploymentSecrets.values,
    processId,
  });

  try {
    await process.waitForPort(PORT, { mode: 'tcp', timeout: 15000 });
    const smoke = await sandbox.exec(
      `MCP_URL=http://127.0.0.1:${PORT}/mcp node ${SANDBOX_SMOKE_SCRIPT}`,
      { cwd },
    );
    if (!smoke.success) {
      throw new Error(`MCP initialize/tools-list health check failed: ${(smoke.stderr || smoke.stdout || 'unknown error').slice(0, 8000)}`);
    }
    const parsed = JSON.parse(smoke.stdout.trim()) as { tools?: unknown };
    if (!Array.isArray(parsed.tools) || !parsed.tools.every((value) => typeof value === 'string')) {
      throw new Error('MCP initialize/tools-list health check did not return a valid tools array');
    }
    return parsed.tools;
  } catch (error) {
    await sandbox.killProcess(process.id).catch(() => undefined);
    throw error;
  }
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
  await startVerifiedSandboxRuntime(env, row, sandbox, command, cwd);
  await sandbox.writeFile(SANDBOX_READY_MARKER, new Date().toISOString());
  await env.DB.prepare(`UPDATE servers SET status=?, detected_runtime=?, detected_command=?, error=NULL, updated_at=? WHERE id=?`)
    .bind('ready', `sandbox-${detected.runtime}`, command, new Date().toISOString(), row.id).run();
  return { ...row, status: 'ready', detected_runtime: `sandbox-${detected.runtime}`, detected_command: command, error: null };
}

async function buildServerOnce(env: Env, row: ServerRow): Promise<void> {
  const sandbox = serverSandbox(env, row);
  await env.DB.prepare('UPDATE servers SET status=?, error=NULL, updated_at=? WHERE id=?')
    .bind('building', new Date().toISOString(), row.id).run();

  try {
    await ensureEdgeBuildSchema(env);
    await stopRuntime(env, row);
    await cloneRepository(env, sandbox, row);
    const detection = await detectMcp(sandbox, row.subdir);
    const command = row.command?.trim() || detection.command;

    const bridge = await prepareBinaryBridge(env, sandbox, row);
    const edge = await tryCompileToEdge(env, sandbox, row, detection);

    if (bridge.active) {
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
        .bind('error', 'local-bound', command, reason.slice(0, 8000), new Date().toISOString(), row.id).run();
      return;
    }

    if (edge.ok && (edge.compatibility.runtime === 'edge' || edge.compatibility.runtime === 'edge-with-bridge')) {
      const detectedRuntime = edge.compatibility.runtime === 'edge-with-bridge' ? 'edge-node-bridge' : 'edge-node';
      await env.DB.prepare(`UPDATE servers SET status=?, detected_runtime=?, detected_command=?, error=NULL, updated_at=? WHERE id=?`)
        .bind('ready', detectedRuntime, command, new Date().toISOString(), row.id).run();
      return;
    }

    if (edge.ok && edge.compatibility.runtime !== 'edge') {
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

export async function buildServer(env: Env, initialRow: ServerRow): Promise<void> {
  await ensureGitHubSchema(env);
  let row = initialRow;
  while (true) {
    let iterationError: unknown = null;
    try {
      await buildServerOnce(env, row);
    } catch (error) {
      iterationError = error;
    }

    // Pushes arriving while a build is queued/running are coalesced into exactly one follow-up build.
    const claimed = await env.DB.prepare(`
      UPDATE servers SET redeploy_pending=0,status='queued',updated_at=? WHERE id=? AND redeploy_pending=1
    `).bind(new Date().toISOString(), row.id).run();
    if ((claimed.meta?.changes || 0) === 0) {
      if (iterationError) throw iterationError;
      return;
    }

    row = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(row.id).first<ServerRow>() ?? row;
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
  if (row.detected_runtime === 'local-bound') {
    throw new Error('Local-bound MCPs require a local relay and cannot run in the cloud runtime');
  }
  await ensureGitHubSchema(env);
  const sandbox = serverSandbox(env, row);

  if (!(await processRunning(sandbox))) {
    if (!(await repositoryPresent(sandbox))) await cloneRepository(env, sandbox, row);

    let fresh = row;
    if (!(await sandboxReady(sandbox))) {
      fresh = await prepareSandboxFallback(env, row, sandbox);
    } else {
      fresh = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(row.id).first<ServerRow>() ?? row;
    }

    if (!(await processRunning(sandbox))) {
      const upstream = fresh.command?.trim() || fresh.detected_command;
      if (!upstream) throw new Error('No stdio command configured');
      await startVerifiedSandboxRuntime(env, fresh, sandbox, upstream, workdir(fresh));
    }
  }

  const tunnel = await sandbox.tunnels.get(PORT);
  return tunnel.url.replace(/\/$/, '');
}