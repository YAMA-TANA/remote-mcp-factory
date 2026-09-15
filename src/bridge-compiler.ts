import type { Sandbox } from '@cloudflare/sandbox';
import { BRIDGE_REWRITE_SCRIPT } from './bridge-rewrite-v4.js';
import { analyzeRuntimeCompatibility } from './compat-analysis.js';
import type { CompatibilityReport, Env, ServerRow } from './types.js';

const REWRITABLE_COMMANDS = new Set(['ffprobe', 'ffmpeg']);

type RewritableCommand = 'ffprobe' | 'ffmpeg';

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

function candidateCommands(report: CompatibilityReport): RewritableCommand[] {
  if (report.bridgeCommands.length > 1) return [];
  if (report.bridgeCommands.length === 1) {
    const command = report.bridgeCommands[0];
    return REWRITABLE_COMMANDS.has(command) ? [command as RewritableCommand] : [];
  }
  // Dynamic command construction can hide the executable from the static scanner. In that case
  // the transformer itself must prove one of the exact helper shapes. Keep ffprobe first for
  // backward compatibility with the original proof fixture.
  return ['ffprobe', 'ffmpeg'];
}

/**
 * Conservative Binary Bridge transform.
 *
 * Static analysis is only a filter. The source transformer must prove one exact helper shape,
 * then a second full compatibility scan must show zero remaining native/browser/local blockers.
 * Supported today:
 * - ffprobe helper returning JSON format/stream metadata
 * - ffmpeg side-effect helper taking inputPath/outputPath and producing .wav or .mp3
 */
export async function prepareBinaryBridge(env: Env, sandbox: Sandbox, row: ServerRow): Promise<BridgeCompileResult> {
  const before = await analyzeRuntimeCompatibility(sandbox, row);
  if (before.runtime === 'edge' || before.runtime === 'local-bound') return { active: false, compatibility: before };
  if (!env.BRIDGE_SIGNING_KEY) return { active: false, compatibility: before };
  if (before.evidence.some((item) => item.kind === 'browser' || item.kind === 'local-bound')) {
    return { active: false, compatibility: before };
  }

  const commands = candidateCommands(before);
  if (!commands.length) return { active: false, compatibility: before };

  const files = [...new Set(before.evidence
    .filter((item) =>
      (item.kind === 'binary' && item.command && commands.includes(item.command as RewritableCommand) && item.bridgeCandidate) ||
      (item.kind === 'subprocess' && item.command === null))
    .map((item) => item.file))];
  if (!files.length || files.length > 4) return { active: false, compatibility: before };

  await sandbox.writeFile('/tmp/factory-bridge-rewrite.mjs', BRIDGE_REWRITE_SCRIPT);
  const cwd = repoWorkdir(row);

  for (const command of commands) {
    const result = await sandbox.exec(
      `TARGET=${shell(cwd)} FILES=${shell(JSON.stringify(files))} COMMAND=${shell(command)} node /tmp/factory-bridge-rewrite.mjs`,
    );
    if (!result.success) continue;

    let parsed: { rewritten?: number; file?: string; function?: string; command?: string } = {};
    try { parsed = JSON.parse(result.stdout.trim()); } catch { continue; }
    if (parsed.rewritten !== 1 || !parsed.file || parsed.command !== command) continue;

    const after = await analyzeRuntimeCompatibility(sandbox, row);
    if (after.runtime !== 'edge') {
      await restoreBridgeSource(sandbox, row);
      continue;
    }

    return {
      active: true,
      compatibility: {
        runtime: 'edge-with-bridge',
        bridgeCommands: [command],
        evidence: before.evidence,
        summary: `Binary Bridge enabled: ${command} (${parsed.file}${parsed.function ? `:${parsed.function}` : ''})`,
      },
      rewrittenFile: parsed.file,
      rewrittenFunction: parsed.function,
    };
  }

  await restoreBridgeSource(sandbox, row);
  return { active: false, compatibility: before };
}
