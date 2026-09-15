import { serverSandbox } from './runtime.js';
import type { Env, ServerRow } from './types.js';

export type BridgeCapability = 'ffmpeg' | 'ffprobe' | 'jq';

const VERSION_COMMANDS: Record<BridgeCapability, string> = {
  ffmpeg: "ffmpeg -version | head -1",
  ffprobe: "ffprobe -version | head -1",
  jq: "jq --version | head -1",
};

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

export function isBridgeCapability(value: string): value is BridgeCapability {
  return value in VERSION_COMMANDS;
}
