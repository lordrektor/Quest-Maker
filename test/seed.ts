/** The quests and pools of scripts/seed-local.sql: canonical trees, as the plugin exported them. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface SeedRow {
  kind: 'quest' | 'pool'
  id: string
  body: Record<string, unknown>
}

export function seedRows(): SeedRow[] {
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'seed-local.sql'), 'utf8')
  const rows: SeedRow[] = []
  const row = /\('(quest|pool)', '([a-z0-9_]+)', '((?:[^']|'')*)'/g
  for (const m of sql.matchAll(row)) rows.push({ kind: m[1] as SeedRow['kind'], id: m[2]!, body: JSON.parse(m[3]!.replace(/''/g, "'")) })
  return rows
}

export function seedQuests(): SeedRow[] {
  return seedRows().filter((r) => r.kind === 'quest')
}
