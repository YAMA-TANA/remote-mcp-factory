import type { Sandbox } from '@cloudflare/sandbox';
import type { Detection } from './analyze.js';
import { putEdgeArtifact, type EdgeArtifactModuleType } from './artifact-store.js';
import { analyzeRuntimeCompatibility } from './compat-analysis.js';
import { EDGE_ADAPTER_SCRIPT } from './edge-adapter.js';
import { EDGE_ASSESS_SCRIPT, EDGE_SMOKE_SCRIPT } from './edge-scripts.js';
import type { CompatibilityReport, EdgeBuildRow, Env, ServerRow } from './types.js';

const EDGE_COMPILER_VERSION = '0.2.0';
const EDGE_COMPATIBILITY_DATE = '2026-09-15';
const EDGE_SMOKE_PORT = 8793;
const MAX_D1_BUNDLE_BYTES = 1_800_000;
const MAX_R2_ARTIFACT_BYTES = 60_000_000;

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
  compatibility: CompatibilityReport;
  bundleHash?: string;
  sizeBytes?: number;
  tools?: string[];
  reason?: string;
}

interface EmittedModule {
  name: string;
  type: EdgeArtifactModuleType;
  bytes: Uint8Array;
  size: number;
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

function edgeEntryName(source: string): string {
  return /\.(?:ts|mts|cts|tsx)$/i.test(source) ? '.factory-edge-entry.ts' : '.factory-edge-entry.mjs';
}

async function digestHex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.trim());
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function readSandboxText(sandbox: Sandbox, path: string): Promise<string> {
  const file = await sandbox.readFile(path, { encoding: 'utf-8' }) as any;
  if (typeof file?.content === 'string') return file.content;
  if (file?.content instanceof ReadableStream) return await new Response(file.content).text();
  return String(file?.content ?? '');
}

async function readSandboxBytes(sandbox: Sandbox, path: string): Promise<Uint8Array> {
  const result = await sandbox.exec(`base64 -w0 ${shell(path)}`);
  if (!result.success) throw new Error(result.stderr || `Could not read emitted module: ${path}`);
  return decodeBase64(result.stdout);
}

async function execOk(sandbox: Sandbox, command: string, cwd?: string): Promise<string> {
  const result = cwd ? await sandbox.exec(command, { cwd }) : await sandbox.exec(command);
  if (!result.success) throw new Error((result.stderr || result.stdout || `Command failed: ${command}`).slice(0, 12000));
  return result.stdout;
}

async function assessEdge(sandbox: Sandbox, row: ServerRow, detection: Detection): Promise<EdgeAssessment> {
  if (detection.runtime !== 'node') {
    return {
      eligible: false,
      strategy: 'unsupported',
      sdk: 'unknown',
      entry: null,
      reason: `Edge compiler currently targets Node/TypeScript; detected ${detection.runtime}`,
      packageName: null,
    };
  }
  const cwd = repoWorkdir(row);
  await sandbox.writeFile('/tmp/factory-edge-assess.py', EDGE_ASSESS_SCRIPT);
  const command = row.command?.trim() || detection.command || '';
  const result = await sandbox.exec(`TARGET=${shell(cwd)} COMMAND=${shell(command)} python3 /tmp/factory-edge-assess.py`);
  if (!result.success) throw new Error(result.stderr || 'Edge assessment failed');
  return JSON.parse(result.stdout.trim()) as EdgeAssessment;
}

async function persistEdgeBuild(env: Env, row: ServerRow, values: Omit<EdgeBuildRow, 'server_id' | 'updated_at'>): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO edge_builds (
      server_id,status,compiler_version,bundle_hash,bundle,artifact_key,main_module,module_count,
      size_bytes,tool_count,tools_json,compatibility_json,reason,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(server_id) DO UPDATE SET
      status=excluded.status,
      compiler_version=excluded.compiler_version,
      bundle_hash=excluded.bundle_hash,
      bundle=excluded.bundle,
      artifact_key=excluded.artifact_key,
      main_module=excluded.main_module,
      module_count=excluded.module_count,
      size_bytes=excluded.size_bytes,
      tool_count=excluded.tool_count,
      tools_json=excluded.tools_json,
      compatibility_json=excluded.compatibility_json,
      reason=excluded.reason,
      updated_at=excluded.updated_at
  `).bind(
    row.id,
    values.status,
    values.compiler_version,
    values.bundle_hash,
    values.bundle,
    values.artifact_key,
    values.main_module,
    values.module_count,
    values.size_bytes,
    values.tool_count,
    values.tools_json,
    values.compatibility_json,
    values.reason,
    new Date().toISOString(),
  ).run();
}

async function smokeTest(sandbox: Sandbox, row: ServerRow, cwd: string): Promise<string[]> {
  await sandbox.writeFile('/tmp/factory-edge-smoke.mjs', EDGE_SMOKE_SCRIPT);
  const processId = `edge-smoke-${row.id}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 63);
  const dev = await sandbox.startProcess(
    `wrangler dev --local --config wrangler.edge.jsonc --port ${EDGE_SMOKE_PORT}`,
    { cwd, processId },
  );
  try {
    await dev.waitForPort(EDGE_SMOKE_PORT, { mode: 'tcp', timeout: 20000 });
    const smoke = await execOk(
      sandbox,
      `MCP_URL=http://127.0.0.1:${EDGE_SMOKE_PORT}/mcp node /tmp/factory-edge-smoke.mjs`,
      cwd,
    );
    const parsed = JSON.parse(smoke.trim()) as { tools?: unknown };
    if (!Array.isArray(parsed.tools)) throw new Error('tools/list smoke test did not return a tools array');
    return parsed.tools.filter((value): value is string => typeof value === 'string');
  } finally {
    await sandbox.killProcess(dev.id).catch(() => undefined);
  }
}

function moduleType(name: string): EdgeArtifactModuleType {
  const lower = name.toLowerCase();
  if (lower.endsWith('.cjs')) return 'cjs';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'js';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.wasm')) return 'wasm';
  if (lower.endsWith('.txt') || lower.endsWith('.html') || lower.endsWith('.sql') || lower.endsWith('.css')) return 'text';
  return 'data';
}

async function collectEmittedModules(sandbox: Sandbox, cwd: string, workerEntry: string): Promise<{ mainModule: string; modules: EmittedModule[]; totalBytes: number }> {
  const listing = await execOk(
    sandbox,
    `find .edge-dist -type f ! -name '*.map' -printf '%s %p\\n' | sort -nr`,
    cwd,
  );
  const files = listing.trim().split('\n').filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) throw new Error(`Unexpected Wrangler output entry: ${line}`);
    return { size: Number(match[1]), path: match[2], name: match[2].replace(/^\.edge-dist\//, '') };
  });
  if (!files.length) throw new Error('Wrangler emitted no Edge modules');
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_R2_ARTIFACT_BYTES) throw new Error(`Edge artifact is ${totalBytes} bytes; current limit is ${MAX_R2_ARTIFACT_BYTES}`);

  const modules: EmittedModule[] = [];
  for (const file of files) {
    const bytes = await readSandboxBytes(sandbox, `${cwd}/${file.path.replace(/^\.\//, '')}`);
    modules.push({ name: file.name, type: moduleType(file.name), bytes, size: bytes.byteLength });
  }

  const js = modules.filter((module) => module.type === 'js' || module.type === 'cjs');
  if (!js.length) throw new Error('Wrangler emitted no JavaScript entry module');
  const wanted = workerEntry.replace(/^.*[\\/]/, '').replace(/\.(?:ts|mts|cts|tsx)$/i, '.js');
  const main = js.find((module) => module.name === wanted || module.name.endsWith(`/${wanted}`)) ?? js.sort((a, b) => b.size - a.size)[0];
  return { mainModule: main.name, modules, totalBytes };
}

async function artifactHash(modules: EmittedModule[]): Promise<string> {
  const rows: string[] = [];
  for (const module of [...modules].sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push(`${module.name}:${module.type}:${await digestHex(module.bytes)}`);
  }
  return await digestHex(rows.join('\n'));
}

function emptyBuild(compatibility: CompatibilityReport, reason: string, status: 'failed' | 'incompatible'): Omit<EdgeBuildRow, 'server_id' | 'updated_at'> {
  return {
    status,
    compiler_version: EDGE_COMPILER_VERSION,
    bundle_hash: null,
    bundle: null,
    artifact_key: null,
    main_module: null,
    module_count: 0,
    size_bytes: 0,
    tool_count: 0,
    tools_json: '[]',
    compatibility_json: JSON.stringify(compatibility),
    reason: reason.slice(0, 4000),
  };
}

export async function tryCompileToEdge(env: Env, sandbox: Sandbox, row: ServerRow, detection: Detection): Promise<EdgeCompileResult> {
  const compatibility = await analyzeRuntimeCompatibility(sandbox, row).catch(() => ({
    runtime: 'heavy' as const, bridgeCommands: [], evidence: [], summary: 'Runtime compatibility analysis failed',
  }));
  let assessment: EdgeAssessment;
  try {
    assessment = await assessEdge(sandbox, row, detection);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    assessment = { eligible: false, strategy: 'unsupported', sdk: 'unknown', entry: null, reason, packageName: null };
  }

  if (!assessment.eligible || !assessment.entry) {
    await persistEdgeBuild(env, row, emptyBuild(compatibility, assessment.reason, 'incompatible'));
    return { ok: false, assessment, compatibility, reason: assessment.reason };
  }

  const edgeRoot = '/workspace/edge-build';
  try {
    await execOk(sandbox, `rm -rf ${edgeRoot} && cp -a /workspace/repo ${edgeRoot}`);
    const cwd = repoWorkdir(row, edgeRoot);
    const sourceEntry = `${cwd}/${assessment.entry}`;
    let workerEntry = assessment.entry;

    if (assessment.sdk === 'v1') {
      await execOk(sandbox, 'npx -y @modelcontextprotocol/codemod@2.0.0 v1-to-v2 .', cwd);
      const markers = await sandbox.exec(
        `grep -R --line-number --include='*.js' --include='*.ts' --include='*.mjs' --include='*.mts' '@mcp-codemod-error' . | head -20`,
        { cwd },
      );
      if (markers.stdout.trim()) throw new Error(`MCP SDK codemod requires manual migration: ${markers.stdout.trim()}`);
      await execOk(
        sandbox,
        `npm pkg set 'dependencies.@modelcontextprotocol/server=^2.0.0' 'dependencies.@modelcontextprotocol/core=^2.0.0'`,
        cwd,
      );
    }

    if (assessment.strategy !== 'native-http') {
      await sandbox.writeFile('/tmp/factory-edge-adapt.mjs', EDGE_ADAPTER_SCRIPT);
      const outputName = edgeEntryName(assessment.entry);
      const outputPath = `${cwd}/${outputName}`;
      await execOk(sandbox, `node /tmp/factory-edge-adapt.mjs ${shell(sourceEntry)} ${shell(outputPath)}`, cwd);
      workerEntry = outputName;
    }

    await execOk(sandbox, 'npm install --ignore-scripts --no-audit --no-fund', cwd);

    const config = {
      name: `edge-${row.id}`,
      main: workerEntry,
      compatibility_date: EDGE_COMPATIBILITY_DATE,
      compatibility_flags: ['nodejs_compat'],
    };
    await sandbox.writeFile(`${cwd}/wrangler.edge.jsonc`, JSON.stringify(config, null, 2));
    await execOk(sandbox, 'rm -rf .edge-dist && wrangler deploy --dry-run --config wrangler.edge.jsonc --outdir .edge-dist', cwd);

    const emitted = await collectEmittedModules(sandbox, cwd, workerEntry);
    const tools = await smokeTest(sandbox, row, cwd);
    const bundleHash = await artifactHash(emitted.modules);

    let artifactKey: string | null = null;
    let legacyBundle: string | null = null;
    if (env.ARTIFACTS) {
      artifactKey = await putEdgeArtifact(env, row.id, bundleHash, emitted.mainModule, emitted.modules);
    } else {
      if (emitted.modules.length !== 1 || emitted.modules[0].type !== 'js') {
        throw new Error('Multi-module Edge output requires the ARTIFACTS R2 binding');
      }
      if (emitted.totalBytes > MAX_D1_BUNDLE_BYTES) {
        throw new Error(`Edge bundle is ${emitted.totalBytes} bytes; legacy D1 limit is ${MAX_D1_BUNDLE_BYTES}. Configure ARTIFACTS R2.`);
      }
      legacyBundle = new TextDecoder().decode(emitted.modules[0].bytes);
    }

    await persistEdgeBuild(env, row, {
      status: 'ready',
      compiler_version: EDGE_COMPILER_VERSION,
      bundle_hash: bundleHash,
      bundle: legacyBundle,
      artifact_key: artifactKey,
      main_module: emitted.mainModule,
      module_count: emitted.modules.length,
      size_bytes: emitted.totalBytes,
      tool_count: tools.length,
      tools_json: JSON.stringify(tools),
      compatibility_json: JSON.stringify(compatibility),
      reason: compatibility.runtime === 'edge-with-bridge-candidate' ? compatibility.summary : assessment.reason,
    });
    return { ok: true, assessment, compatibility, bundleHash, sizeBytes: emitted.totalBytes, tools };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await persistEdgeBuild(env, row, emptyBuild(compatibility, reason, 'failed'));
    return { ok: false, assessment, compatibility, reason };
  }
}
