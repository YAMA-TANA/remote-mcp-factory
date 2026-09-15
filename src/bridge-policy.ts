import type { BridgeOperation } from './bridge-auth.js';
import type { EdgeBuildRow } from './types.js';

const COMMAND_OPERATION: Record<string, BridgeOperation> = {
  ffprobe: 'probe',
  ffmpeg: 'transcode',
};

export function compiledBridgeOperation(edge: EdgeBuildRow): BridgeOperation | null {
  try {
    const compatibility = JSON.parse(edge.compatibility_json || '{}') as {
      runtime?: string;
      bridgeCommands?: unknown;
    };
    if (compatibility.runtime !== 'edge-with-bridge' || !Array.isArray(compatibility.bridgeCommands)) return null;
    const commands = compatibility.bridgeCommands.filter((value): value is string => typeof value === 'string');
    if (commands.length !== 1) return null;
    return COMMAND_OPERATION[commands[0]] || null;
  } catch {
    return null;
  }
}

export function compiledBridgeAllows(edge: EdgeBuildRow, operation: BridgeOperation): boolean {
  return edge.status === 'ready' && Boolean(edge.bundle_hash) && compiledBridgeOperation(edge) === operation;
}
