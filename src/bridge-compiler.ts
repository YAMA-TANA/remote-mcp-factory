import type { Sandbox } from '@cloudflare/sandbox';
import { BRIDGE_REWRITE_SCRIPT } from './bridge-rewrite-v2.js';
import { analyzeRuntimeCompatibility } from './compat-analysis.js';
import type { CompatibilityReport, Env, ServerRow } from './types.js';

function repoWorkdir(row: ServerRow): string {
  const subdir = row.subdir.trim().replace(/^\/+|\/+$/g, '');
  return subdir ? `/workspace/repo/${subdir}` : '/workspace/repo';
}

function shell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export interface BridgeCompileResult {
  active: boolean;
  compatibility: CompatibilityReport;
  rewrittenFile?: string;
  rewrittenFunction?: string;
}

export async function restoreBridgeSource(sandbox: Sandbox, row: ServerRow): Promise<void> {
  // The source clone is disposable. Revert only compiler-generated edits and files so
  // a later Linux fallback always runs the upstream repository, not our Edge shim.
  const cwd = repoWorkdir(row);
  const result = await sandbox.exec('git reset --hard HEAD && git clean -fd', { cwd });
  if (!result.success) throw new Error(result.stderr || 'Could not restore source after bridge compilation');
}

/**
 * Extremely conservative first bridge transform.
 *
 * We only rewrite a deployment when all native evidence consists of ffprobe,
 * there are no local-machine semantics, a signing key is configured, and the
 * standalone transformer finds exactly one pure "file -> ffprobe JSON" helper.
 * The source is then analyzed again. Promotion happens only when the rewritten
 * source has zero remaining native/browser/local blockers.
 */
export async function prepareBinaryBridge(env: Env, sandbox: Sandbox, row: ServerRow): Promise<BridgeCompileResult> {
  const before = await analyzeRuntimeCompatibility(sandbox, row);
  if (before.runtime !== 'edge-with-bridge-candidate') return { active: false, compatibility: before };
  if (!env.BRIDGE_SIGNING_KEY) return { active: false, compatibility: before };
  if (before.bridgeCommands.length !== 1 || before.bridgeCommands[0] !== 'ffprobe') {
    return { active: false, compatibility: before };
  }

  const files = [...new Set(before.evidence
    .filter((item) => item.kind === 'binary' && item.command === 'ffprobe' && item.bridgeCandidate)
    .map((item) => item.file))];
  if (!files.length || files.length > 4) return { active: false, compatibility: before };

  await sandbox.writeFile('/tmp/factory-bridge-rewrite.mjs', BRIDGE_REWRITE_SCRIPT);
  const cwd = repoWorkdir(row);
  const result = await sandbox.exec(
    `TARGET=${shell(cwd)} FILES=${shell(JSON.stringify(files))} node /tmp/factory-bridge-rewrite.mjs`,
  );
  if (!result.success) return { active: false, compatibility: before };

  let parsed: { rewritten?: number; file?: string; function?: string } = {};
  try { parsed = JSON.parse(result.stdout.trim()); } catch { return { active: false, compatibility: before }; }
  if (parsed.rewritten !== 1 || !parsed.file) return { active: false, compatibility: before };

  const after = await analyzeRuntimeCompatibility(sandbox, row);
  if (after.runtime !== 'edge') {
    await restoreBridgeSource(sandbox, row);
    return { active: false, compatibility: before };
  }

  return {
    active: true,
    compatibility: {
      runtime: 'edge-with-bridge',
      bridgeCommands: ['ffprobe'],
      evidence: before.evidence,
      summary: `Binary Bridge enabled: ffprobe (${parsed.file}${parsed.function ? `:${parsed.function}` : ''})`,
    },
    rewrittenFile: parsed.file,
    rewrittenFunction: parsed.function,
  };
}
