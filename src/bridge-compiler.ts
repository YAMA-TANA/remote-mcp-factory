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
  const cwd = repoWorkdir(row);
  const result = await sandbox.exec('git reset --hard HEAD && git clean -fd', { cwd });
  if (!result.success) throw new Error(result.stderr || 'Could not restore source after bridge compilation');
}

/**
 * Extremely conservative first bridge transform.
 *
 * Static analysis is intentionally only a filter. Dynamic command construction such as
 * `${FFPROBE}` can appear as an unknown subprocess, so the source transformer itself
 * proves the exact helper shape. Promotion happens only after a second full scan says
 * the transformed source has zero remaining native/browser/local blockers.
 */
export async function prepareBinaryBridge(env: Env, sandbox: Sandbox, row: ServerRow): Promise<BridgeCompileResult> {
  const before = await analyzeRuntimeCompatibility(sandbox, row);
  if (before.runtime === 'edge' || before.runtime === 'local-bound') return { active: false, compatibility: before };
  if (!env.BRIDGE_SIGNING_KEY) return { active: false, compatibility: before };
  if (before.evidence.some((item) => item.kind === 'browser' || item.kind === 'local-bound')) {
    return { active: false, compatibility: before };
  }
  if (before.bridgeCommands.some((command) => command !== 'ffprobe')) {
    return { active: false, compatibility: before };
  }

  const files = [...new Set(before.evidence
    .filter((item) =>
      (item.kind === 'binary' && item.command === 'ffprobe' && item.bridgeCandidate) ||
      (item.kind === 'subprocess' && item.command === null))
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
