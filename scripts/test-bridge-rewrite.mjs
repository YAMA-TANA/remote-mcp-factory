#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();

function embeddedScript(source) {
  const match = source.match(/const BRIDGE_REWRITE_B64 = '([^']+)'/);
  if (!match) throw new Error('Could not find BRIDGE_REWRITE_B64');
  return Buffer.from(match[1], 'base64').toString('utf8');
}

async function capture(cmd, args, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0
      ? resolvePromise({ stdout, stderr })
      : reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`)));
  });
}

async function runRewrite(scriptPath, target, files) {
  const result = await capture('node', [scriptPath], {
    env: { ...process.env, TARGET: target, FILES: JSON.stringify(files) },
  });
  return JSON.parse(result.stdout.trim());
}

async function main() {
  const asset = await readFile(resolve(ROOT, 'src/bridge-rewrite-v2.ts'), 'utf8');
  const rewrite = embeddedScript(asset);
  const temp = await mkdtemp(join(tmpdir(), 'factory-bridge-rewrite-'));
  const scriptPath = join(temp, 'rewrite.mjs');
  await writeFile(scriptPath, rewrite);

  try {
    const positive = join(temp, 'positive');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(positive));
    const positiveFile = join(positive, 'server.ts');
    await writeFile(positiveFile, `
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

async function ffprobe(filepath: string): Promise<any> {
  const { stdout } = await execAsync(
    \`\"\${FFPROBE}\" -v quiet -print_format json -show_format -show_streams \"\${filepath}\"\`
  );
  return JSON.parse(stdout);
}

export async function inspect(filepath: string) {
  return await ffprobe(filepath);
}
`);

    const yes = await runRewrite(scriptPath, positive, ['server.ts']);
    if (yes.rewritten !== 1 || yes.function !== 'ffprobe') {
      throw new Error(`Expected one ffprobe rewrite, got ${JSON.stringify(yes)}`);
    }
    const transformed = await readFile(positiveFile, 'utf8');
    if (!transformed.includes('__factoryProbeFile(filepath)')) throw new Error('ffprobe helper was not replaced');
    if (transformed.includes("from 'node:child_process'")) throw new Error('unused child_process import was not removed');
    const clientPath = join(positive, '.factory-bridge-client.mjs');
    await access(clientPath);
    const client = await readFile(clientPath, 'utf8');
    if (!client.includes('FACTORY_BRIDGE_BASE_URL') || !client.includes("base + '/probe'")) {
      throw new Error('Bridge client was not generated correctly');
    }

    const negative = join(temp, 'negative');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(negative));
    const negativeFile = join(negative, 'server.ts');
    await writeFile(negativeFile, `
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
async function ffprobe(filepath: string) {
  const { stdout } = await execAsync(\`ffprobe -of json \"\${filepath}\"\`);
  await execAsync(\`ffmpeg -i \"\${filepath}\" output.mp3\`);
  return JSON.parse(stdout);
}
export { ffprobe };
`);
    const no = await runRewrite(scriptPath, negative, ['server.ts']);
    if (no.rewritten !== 0) throw new Error(`Unsafe ffprobe helper must not be rewritten: ${JSON.stringify(no)}`);

    console.log('PASS conservative ffprobe bridge rewrite: positive=1 unsafe=0');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
