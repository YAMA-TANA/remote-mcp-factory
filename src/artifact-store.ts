import type { DynamicWorkerModule, Env } from './types.js';

export type EdgeArtifactModuleType = 'js' | 'cjs' | 'text' | 'data' | 'wasm' | 'json';

export interface EdgeArtifactModuleRecord {
  name: string;
  type: EdgeArtifactModuleType;
  key: string;
  size: number;
  sha256: string;
}

export interface EdgeArtifactManifest {
  version: 1;
  mainModule: string;
  totalBytes: number;
  modules: EdgeArtifactModuleRecord[];
}

async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function moduleKey(prefix: string, name: string): string {
  const safe = name.replace(/^\/+/, '').replace(/\.\.(?:\/|\\)/g, '').replace(/\\/g, '/');
  return `${prefix}/modules/${safe}`;
}

export async function putEdgeArtifact(
  env: Env,
  serverId: string,
  bundleHash: string,
  mainModule: string,
  modules: Array<{ name: string; type: EdgeArtifactModuleType; bytes: Uint8Array }>,
): Promise<string> {
  if (!env.ARTIFACTS) throw new Error('R2 artifact binding is not configured');
  const prefix = `edge/${serverId}/${bundleHash}`;
  const records: EdgeArtifactModuleRecord[] = [];
  let totalBytes = 0;

  for (const module of modules) {
    const key = moduleKey(prefix, module.name);
    const hash = await sha256Hex(module.bytes);
    await env.ARTIFACTS.put(key, module.bytes, {
      customMetadata: { type: module.type, sha256: hash, module: module.name },
    });
    records.push({ name: module.name, type: module.type, key, size: module.bytes.byteLength, sha256: hash });
    totalBytes += module.bytes.byteLength;
  }

  const manifest: EdgeArtifactManifest = {
    version: 1,
    mainModule,
    totalBytes,
    modules: records,
  };
  const manifestKey = `${prefix}/manifest.json`;
  await env.ARTIFACTS.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  });
  return manifestKey;
}

export async function loadEdgeArtifact(
  env: Env,
  manifestKey: string,
): Promise<{ mainModule: string; modules: Record<string, DynamicWorkerModule>; totalBytes: number }> {
  if (!env.ARTIFACTS) throw new Error('R2 artifact binding is not configured');
  const object = await env.ARTIFACTS.get(manifestKey);
  if (!object) throw new Error(`Missing edge artifact manifest: ${manifestKey}`);
  const manifest = JSON.parse(await object.text()) as EdgeArtifactManifest;
  if (manifest.version !== 1 || !manifest.mainModule || !Array.isArray(manifest.modules)) {
    throw new Error('Invalid edge artifact manifest');
  }

  const modules: Record<string, DynamicWorkerModule> = {};
  for (const record of manifest.modules) {
    const stored = await env.ARTIFACTS.get(record.key);
    if (!stored) throw new Error(`Missing edge artifact module: ${record.name}`);
    const bytes = new Uint8Array(await stored.arrayBuffer());
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== record.sha256) throw new Error(`Edge artifact checksum mismatch: ${record.name}`);

    if (record.type === 'data') modules[record.name] = { data: bytes.buffer };
    else if (record.type === 'wasm') modules[record.name] = { wasm: bytes.buffer };
    else {
      const text = new TextDecoder().decode(bytes);
      if (record.type === 'js') modules[record.name] = { js: text };
      else if (record.type === 'cjs') modules[record.name] = { cjs: text };
      else if (record.type === 'text') modules[record.name] = { text };
      else if (record.type === 'json') modules[record.name] = { json: JSON.parse(text) };
    }
  }
  if (!(manifest.mainModule in modules)) throw new Error(`Main module missing from artifact: ${manifest.mainModule}`);
  return { mainModule: manifest.mainModule, modules, totalBytes: manifest.totalBytes };
}
