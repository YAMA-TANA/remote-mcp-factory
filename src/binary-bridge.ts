import { serverSandbox } from './runtime.js';
import type { Env, ServerRow } from './types.js';

export type BridgeCapability = 'ffmpeg' | 'ffprobe' | 'jq';
export type MediaTranscodeFormat = 'wav' | 'mp3';

const MAX_MEDIA_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_OUTPUT_BYTES = 16 * 1024 * 1024;
const MEDIA_TIMEOUT_SECONDS = 20;

const VERSION_COMMANDS: Record<BridgeCapability, string> = {
  ffmpeg: "ffmpeg -version | head -1",
  ffprobe: "ffprobe -version | head -1",
  jq: "jq --version | head -1",
};

function shell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function assertBase64(value: string, maxBytes: number): void {
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('Input must be valid base64');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const estimatedBytes = Math.floor((value.length * 3) / 4) - padding;
  if (estimatedBytes > maxBytes) throw new Error(`Bridge input exceeds ${maxBytes} bytes`);
}

function safeFilename(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const name = value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96);
  return name || fallback;
}

async function withMediaWorkspace<T>(
  env: Env,
  row: ServerRow,
  dataBase64: string,
  filename: string | undefined,
  action: (sandbox: ReturnType<typeof serverSandbox>, inputPath: string, dir: string) => Promise<T>,
): Promise<T> {
  assertBase64(dataBase64, MAX_MEDIA_INPUT_BYTES);
  const sandbox = serverSandbox(env, row);
  const id = crypto.randomUUID().replace(/-/g, '');
  const dir = `/tmp/factory-bridge-${id}`;
  const inputPath = `${dir}/${safeFilename(filename, 'input.bin')}`;
  const mkdir = await sandbox.exec(`mkdir -m 700 ${shell(dir)}`);
  if (!mkdir.success) throw new Error(mkdir.stderr || 'Could not create bridge workspace');
  try {
    await sandbox.writeFile(inputPath, dataBase64, { encoding: 'base64' });
    return await action(sandbox, inputPath, dir);
  } finally {
    await sandbox.exec(`rm -rf ${shell(dir)}`).catch(() => undefined);
  }
}

export async function binaryBridgeStatus(env: Env, row: ServerRow): Promise<Record<BridgeCapability, { available: boolean; version: string | null }>> {
  const sandbox = serverSandbox(env, row);
  const entries = await Promise.all((Object.keys(VERSION_COMMANDS) as BridgeCapability[]).map(async (name) => {
    const result = await sandbox.exec(VERSION_COMMANDS[name]);
    return [name, {
      available: result.success,
      version: result.success ? result.stdout.trim().slice(0, 240) : null,
    }] as const;
  }));
  return Object.fromEntries(entries) as Record<BridgeCapability, { available: boolean; version: string | null }>;
}

export async function probeMedia(
  env: Env,
  row: ServerRow,
  input: { dataBase64: string; filename?: string },
): Promise<{ format: unknown; streams: unknown[] }> {
  return await withMediaWorkspace(env, row, input.dataBase64, input.filename, async (sandbox, inputPath) => {
    const command = `timeout ${MEDIA_TIMEOUT_SECONDS}s ffprobe -v error -show_format -show_streams -of json ${shell(inputPath)}`;
    const result = await sandbox.exec(command);
    if (!result.success) throw new Error((result.stderr || 'ffprobe failed').slice(0, 4000));
    let parsed: any;
    try { parsed = JSON.parse(result.stdout); } catch { throw new Error('ffprobe returned invalid JSON'); }
    return {
      format: parsed?.format ?? null,
      streams: Array.isArray(parsed?.streams) ? parsed.streams : [],
    };
  });
}

export async function transcodeMedia(
  env: Env,
  row: ServerRow,
  input: { dataBase64: string; filename?: string; format: MediaTranscodeFormat },
): Promise<{ dataBase64: string; mimeType: string; bytes: number; format: MediaTranscodeFormat }> {
  if (input.format !== 'wav' && input.format !== 'mp3') throw new Error('format must be wav or mp3');
  return await withMediaWorkspace(env, row, input.dataBase64, input.filename, async (sandbox, inputPath, dir) => {
    const outputPath = `${dir}/output.${input.format}`;
    const codec = input.format === 'wav'
      ? '-vn -c:a pcm_s16le'
      : '-vn -c:a libmp3lame -b:a 192k';
    const command = `timeout ${MEDIA_TIMEOUT_SECONDS}s ffmpeg -hide_banner -loglevel error -nostdin -y -i ${shell(inputPath)} ${codec} ${shell(outputPath)}`;
    const result = await sandbox.exec(command);
    if (!result.success) throw new Error((result.stderr || 'ffmpeg failed').slice(0, 4000));

    const stat = await sandbox.exec(`stat -c %s ${shell(outputPath)}`);
    if (!stat.success) throw new Error('Could not stat ffmpeg output');
    const bytes = Number(stat.stdout.trim());
    if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Invalid ffmpeg output size');
    if (bytes > MAX_MEDIA_OUTPUT_BYTES) throw new Error(`Bridge output exceeds ${MAX_MEDIA_OUTPUT_BYTES} bytes`);

    const file = await sandbox.readFile(outputPath, { encoding: 'base64' }) as any;
    const dataBase64 = typeof file?.content === 'string' ? file.content : '';
    if (!dataBase64) throw new Error('Could not read ffmpeg output');
    return {
      dataBase64,
      mimeType: input.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      bytes,
      format: input.format,
    };
  });
}

export function isBridgeCapability(value: string): value is BridgeCapability {
  return value in VERSION_COMMANDS;
}
