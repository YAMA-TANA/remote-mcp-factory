import type { Env } from './types.js';

const EDGE_BUILD_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'artifact_key', ddl: 'ALTER TABLE edge_builds ADD COLUMN artifact_key TEXT' },
  { name: 'main_module', ddl: 'ALTER TABLE edge_builds ADD COLUMN main_module TEXT' },
  { name: 'module_count', ddl: 'ALTER TABLE edge_builds ADD COLUMN module_count INTEGER NOT NULL DEFAULT 0' },
  { name: 'compatibility_json', ddl: "ALTER TABLE edge_builds ADD COLUMN compatibility_json TEXT NOT NULL DEFAULT '{}'" },
];

export async function ensureEdgeBuildSchema(env: Env): Promise<void> {
  const info = await env.DB.prepare('PRAGMA table_info(edge_builds)').all<{ name: string }>();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const column of EDGE_BUILD_COLUMNS) {
    if (existing.has(column.name)) continue;
    try {
      await env.DB.prepare(column.ddl).run();
    } catch (error) {
      // Two builds can race on the first deployment after an upgrade. A duplicate-column
      // error means the other request completed the same safe migration first.
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) throw error;
    }
  }
}
