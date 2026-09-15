import type { Sandbox } from '@cloudflare/sandbox';
import type { CompatibilityReport, NativeDependencyEvidence, ServerRow } from './types.js';

const BRIDGE_COMMANDS = new Set([
  'ffmpeg', 'ffprobe', 'git', 'pandoc', 'magick', 'convert', 'jq', 'curl', 'wget', 'zip', 'unzip', 'rg',
]);
const BROWSER_COMMANDS = new Set(['chromium', 'chromium-browser', 'google-chrome', 'playwright', 'puppeteer']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx']);

function repoWorkdir(row: ServerRow): string {
  const subdir = row.subdir.trim().replace(/^\/+|\/+$/g, '');
  return subdir ? `/workspace/repo/${subdir}` : '/workspace/repo';
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function nearbyToolName(text: string, index: number): string | null {
  const start = Math.max(0, index - 5000);
  const prefix = text.slice(start, index);
  const patterns = [
    /(?:registerTool|\.tool)\s*\(\s*['"]([^'"]+)['"]/g,
    /name\s*:\s*['"]([^'"]+)['"]/g,
  ];
  let best: { name: string; pos: number } | null = null;
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(prefix))) {
      if (!best || match.index > best.pos) best = { name: match[1], pos: match.index };
    }
  }
  return best?.name ?? null;
}

function detectInFile(file: string, text: string): NativeDependencyEvidence[] {
  const evidence: NativeDependencyEvidence[] = [];
  const subprocessImport = /(?:node:)?child_process/.test(text);
  const calls = /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*(?:['"]([^'"]+)['"]|`([^`$]+)`)/g;
  let match: RegExpExecArray | null;
  while ((match = calls.exec(text))) {
    const commandLine = (match[1] || match[2] || '').trim();
    if (!commandLine) continue;
    const command = commandLine.split(/\s+/)[0].replace(/^.*[\\/]/, '');
    const browser = BROWSER_COMMANDS.has(command) || /chrom(?:e|ium)|playwright|puppeteer/i.test(commandLine);
    evidence.push({
      kind: browser ? 'browser' : BRIDGE_COMMANDS.has(command) ? 'binary' : 'subprocess',
      command,
      file,
      line: lineOf(text, match.index),
      tool: nearbyToolName(text, match.index),
      bridgeCandidate: !browser && BRIDGE_COMMANDS.has(command),
    });
  }

  if (subprocessImport && evidence.length === 0) {
    const index = text.search(/(?:node:)?child_process/);
    evidence.push({
      kind: 'subprocess', command: null, file, line: lineOf(text, Math.max(0, index)), tool: nearbyToolName(text, Math.max(0, index)), bridgeCandidate: false,
    });
  }

  const browserImport = /(playwright|puppeteer|@sparticuz\/chromium)/i.exec(text);
  if (browserImport && !evidence.some((item) => item.kind === 'browser')) {
    evidence.push({
      kind: 'browser', command: browserImport[1], file, line: lineOf(text, browserImport.index), tool: nearbyToolName(text, browserImport.index), bridgeCandidate: false,
    });
  }
  return evidence;
}

export async function analyzeRuntimeCompatibility(sandbox: Sandbox, row: ServerRow): Promise<CompatibilityReport> {
  const cwd = repoWorkdir(row);
  const listing = await sandbox.exec(
    `find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './dist/*' -not -path './build/*' -not -path './coverage/*' -not -path './test/*' -not -path './tests/*' | head -1200`,
    { cwd },
  );
  if (!listing.success) return { runtime: 'heavy', bridgeCommands: [], evidence: [], summary: 'Could not inspect runtime dependencies' };

  const evidence: NativeDependencyEvidence[] = [];
  for (const relative of listing.stdout.split('\n').map((value) => value.trim()).filter(Boolean)) {
    const dot = relative.lastIndexOf('.');
    if (dot < 0 || !SOURCE_EXTENSIONS.has(relative.slice(dot).toLowerCase())) continue;
    try {
      const file = await sandbox.readFile(`${cwd}/${relative.replace(/^\.\//, '')}`, { encoding: 'utf-8' }) as any;
      const text = typeof file?.content === 'string' ? file.content : String(file?.content ?? '');
      evidence.push(...detectInFile(relative.replace(/^\.\//, ''), text));
    } catch {
      // Unreadable generated/binary files are ignored; bundling is still the final verifier.
    }
  }

  const unique = evidence.filter((item, index, all) => all.findIndex((other) =>
    other.file === item.file && other.line === item.line && other.command === item.command && other.kind === item.kind,
  ) === index);
  const bridgeCommands = [...new Set(unique.filter((item) => item.bridgeCandidate && item.command).map((item) => item.command!))].sort();
  const hard = unique.filter((item) => !item.bridgeCandidate);
  const runtime = hard.length ? 'heavy' : bridgeCommands.length ? 'edge-with-bridge-candidate' : 'edge';
  const summary = runtime === 'edge'
    ? 'No native runtime blockers detected'
    : runtime === 'edge-with-bridge-candidate'
      ? `Bridge candidates detected: ${bridgeCommands.join(', ')}`
      : `Native/browser runtime blockers detected: ${hard.slice(0, 4).map((item) => item.command || item.kind).join(', ')}`;
  return { runtime, bridgeCommands, evidence: unique.slice(0, 100), summary };
}
