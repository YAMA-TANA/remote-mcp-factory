#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function runRewrite(scriptPath, target, files, command) {
  const result = await capture('node', [scriptPath], {
    env: { ...process.env, TARGET: target, FILES: JSON.stringify(files), COMMAND: command },
  });
  return JSON.parse(result.stdout.trim());
}

async function testFfprobe(scriptPath, temp) {
  const positive = join(temp, 'ffprobe-positive');
  await mkdir(positive);
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

  const yes = await runRewrite(scriptPath, positive, ['server.ts'], 'ffprobe');
  if (yes.rewritten !== 1 || yes.function !== 'ffprobe' || yes.command !== 'ffprobe') {
    throw new Error(`Expected one ffprobe rewrite, got ${JSON.stringify(yes)}`);
  }
  const transformed = await readFile(positiveFile, 'utf8');
  if (!transformed.includes('__factoryProbeFile(filepath)')) throw new Error('ffprobe helper was not replaced');
  if (transformed.includes("from 'node:child_process'")) throw new Error('unused child_process import was not removed');
  const clientPath = join(positive, '.factory-bridge-client.mjs');
  await access(clientPath);
  const client = await readFile(clientPath, 'utf8');
  if (!client.includes('FACTORY_BRIDGE_BASE_URL') || !client.includes("requestBridge('probe'")) {
    throw new Error('ffprobe Bridge client was not generated correctly');
  }

  const unsafe = join(temp, 'ffprobe-unsafe');
  await mkdir(unsafe);
  await writeFile(join(unsafe, 'server.ts'), `
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
async function ffprobe(filepath: string) {
  const { stdout } = await execAsync(\`ffprobe -print_format json -show_format -show_streams \"\${filepath}\"\`);
  await execAsync(\`ffmpeg -i \"\${filepath}\" output.mp3\`);
  return JSON.parse(stdout);
}
export { ffprobe };
`);
  const unsafeResult = await runRewrite(scriptPath, unsafe, ['server.ts'], 'ffprobe');
  if (unsafeResult.rewritten !== 0) throw new Error(`Unsafe ffprobe helper must not be rewritten: ${JSON.stringify(unsafeResult)}`);

  const shapeMismatch = join(temp, 'ffprobe-shape-mismatch');
  await mkdir(shapeMismatch);
  await writeFile(join(shapeMismatch, 'server.ts'), `
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
async function ffprobe(filepath: string) {
  const { stdout } = await execAsync(\`ffprobe -of json -show_streams \"\${filepath}\"\`);
  return JSON.parse(stdout);
}
export { ffprobe };
`);
  const mismatchResult = await runRewrite(scriptPath, shapeMismatch, ['server.ts'], 'ffprobe');
  if (mismatchResult.rewritten !== 0) throw new Error(`Different ffprobe output shape must not be rewritten: ${JSON.stringify(mismatchResult)}`);
}

async function testFfmpeg(scriptPath, temp) {
  const positive = join(temp, 'ffmpeg-positive');
  await mkdir(positive);
  const positiveFile = join(positive, 'server.ts');
  await writeFile(positiveFile, `
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);

async function ffmpeg(inputPath: string, outputPath: string): Promise<void> {
  await execAsync(
    \`ffmpeg -hide_banner -loglevel error -nostdin -y -i \"\${inputPath}\" -vn -c:a libmp3lame -b:a 96k \"\${outputPath}\"\`
  );
}

export async function convert(inputPath: string, outputPath: string) {
  await ffmpeg(inputPath, outputPath);
}
`);

  const yes = await runRewrite(scriptPath, positive, ['server.ts'], 'ffmpeg');
  if (yes.rewritten !== 1 || yes.function !== 'ffmpeg' || yes.command !== 'ffmpeg') {
    throw new Error(`Expected one ffmpeg rewrite, got ${JSON.stringify(yes)}`);
  }
  const transformed = await readFile(positiveFile, 'utf8');
  if (!transformed.includes('__factoryTranscodeFile(inputPath, outputPath)')) throw new Error('ffmpeg helper was not replaced');
  if (transformed.includes("from 'node:child_process'")) throw new Error('unused child_process import was not removed from ffmpeg helper');
  const client = await readFile(join(positive, '.factory-bridge-client.mjs'), 'utf8');
  if (!client.includes("requestBridge('transcode'") || !client.includes("endsWith('.mp3')") || !client.includes("endsWith('.wav')")) {
    throw new Error('ffmpeg Bridge client did not enforce the output-format allowlist');
  }

  const returning = join(temp, 'ffmpeg-returning');
  await mkdir(returning);
  await writeFile(join(returning, 'server.ts'), `
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
async function ffmpeg(inputPath, outputPath) {
  const result = await execAsync(\`ffmpeg -y -i \"\${inputPath}\" \"\${outputPath}\"\`);
  return result.stdout;
}
export { ffmpeg };
`);
  const returningResult = await runRewrite(scriptPath, returning, ['server.ts'], 'ffmpeg');
  if (returningResult.rewritten !== 0) throw new Error(`ffmpeg helper with observable stdout semantics must not be rewritten: ${JSON.stringify(returningResult)}`);

  const extraExec = join(temp, 'ffmpeg-extra-exec');
  await mkdir(extraExec);
  await writeFile(join(extraExec, 'server.ts'), `
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
async function ffmpeg(inputPath, outputPath) {
  await execAsync(\`ffmpeg -y -i \"\${inputPath}\" \"\${outputPath}\"\`);
  await execAsync('echo done');
}
export { ffmpeg };
`);
  const extraResult = await runRewrite(scriptPath, extraExec, ['server.ts'], 'ffmpeg');
  if (extraResult.rewritten !== 0) throw new Error(`ffmpeg helper with a second command must not be rewritten: ${JSON.stringify(extraResult)}`);
}

async function main() {
  const asset = await readFile(resolve(ROOT, 'src/bridge-rewrite-v4.ts'), 'utf8');
  const rewrite = embeddedScript(asset);
  const temp = await mkdtemp(join(tmpdir(), 'factory-bridge-rewrite-'));
  const scriptPath = join(temp, 'rewrite.mjs');
  await writeFile(scriptPath, rewrite);

  try {
    await testFfprobe(scriptPath, temp);
    await testFfmpeg(scriptPath, temp);
    console.log('PASS Binary Bridge rewrite: ffprobe exact/unsafe/shape + ffmpeg side-effect/return/extra-command');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
