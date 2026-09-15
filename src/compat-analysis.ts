import type { Sandbox } from '@cloudflare/sandbox';
import type { CompatibilityReport, NativeDependencyEvidence, ServerRow } from './types.js';

const BRIDGE_COMMANDS = new Set([
  'ffmpeg', 'ffprobe', 'git', 'pandoc', 'magick', 'convert', 'jq', 'curl', 'wget', 'zip', 'unzip', 'rg',
]);
const BROWSER_COMMANDS = new Set(['chromium', 'chromium-browser', 'google-chrome', 'playwright', 'puppeteer']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx']);

// These are intentionally high-confidence signals. Generic fs usage is NOT local-bound: a remotely
// hosted MCP can legitimately use /tmp or files it downloaded itself. We only reject repos that
// clearly reference the operator's workstation/home folders or a user-local filesystem server.
const LOCAL_BOUND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(?:os\.)?homedir\s*\(/, reason: 'home directory access' },
  { pattern: /process\.env\.(?:HOME|USERPROFILE)\b/, reason: 'user home environment' },
  { pattern: /(?:['"`])(?:Desktop|Documents|Downloads|Videos|Pictures|Music)(?:['"`])/, reason: 'user media/document folder' },
  { pattern: /(?:['"`])\/(?:Users|home)\/[A-Za-z0-9._-]+\//, reason: 'absolute user home path' },
  { pattern: /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/i, reason: 'Windows user home path' },
  { pattern: /@modelcontextprotocol\/server-filesystem/, reason: 'local filesystem MCP' },
];

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

function localBoundEvidence(file: string, text: string): NativeDependencyEvidence[] {
  const out: NativeDependencyEvidence[] = [];
  for (const { pattern, reason } of LOCAL_BOUND_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    out.push({
      kind: 'local-bound',
      command: reason,
      file,
      line: lineOf(text, match.index),
      tool: nearbyToolName(text, match.index),
      bridgeCandidate: false,
    });
  }
  return out;
}

function detectInFile(file: string, text: string): NativeDependencyEvidence[] {
  const evidence: NativeDependencyEvidence[] = [...localBoundEvidence(file, text)];
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

  if (subprocessImport && !evidence.some((item) => item.kind === 'binary' || item.kind === 'browser' || item.kind === 'subprocess')) {
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
  const local = unique.filter((item) => item.kind === 'local-bound');
  const bridgeCommands = [...new Set(unique.filter((item) => item.bridgeCandidate && item.command).map((item) => item.command!))].sort();
  const hard = unique.filter((item) => item.kind !== 'local-bound' && !item.bridgeCandidate);
  const runtime = local.length
    ? 'local-bound'
    : hard.length
      ? 'heavy'
      : bridgeCommands.length
        ? 'edge-with-bridge-candidate'
        : 'edge';
  const summary = runtime === 'edge'
    ? 'No native runtime blockers detected'
    : runtime === 'edge-with-bridge-candidate'
      ? `Bridge candidates detected: ${bridgeCommands.join(', ')}`
      : runtime === 'local-bound'
        ? `Local workstation dependency detected: ${local.slice(0, 3).map((item) => item.command || item.file).join(', ')}`
        : `Native/browser runtime blockers detected: ${hard.slice(0, 4).map((item) => item.command || item.kind).join(', ')}`;
  return { runtime, bridgeCommands, evidence: unique.slice(0, 100), summary };
}
