import type { DefinitionRow, DeleteRequest, FetchRequest, Kind, UpsertRequest } from '../shared/api'
import { HttpError, ID } from './http'

/** D1 takes at most 100 bound parameters per statement. */
const IDS_PER_QUERY = 90

interface Row {
  kind: Kind
  id: string
  body: string
  version: number
  updated_at: number
  updated_by: string | null
  source: 'server' | 'web'
  server: string | null
  web_pending?: number
  deleted_at?: number | null
}

function kindOf(value: unknown): Kind {
  if (value === 'quest' || value === 'pool') return value
  throw new HttpError(400, `kind must be quest or pool, not ${JSON.stringify(value)}`)
}

/** {@return the upsert request, checked} */
export function readUpsert(body: Record<string, unknown>): UpsertRequest {
  const server = typeof body.server === 'string' ? body.server.slice(0, 64) : ''
  if (!Array.isArray(body.items)) throw new HttpError(400, 'items must be a list')
  const items = body.items.map((raw, i): DefinitionRow => {
    if (raw === null || typeof raw !== 'object') throw new HttpError(400, `items[${i}] must be an object`)
    const item = raw as Record<string, unknown>
    const kind = kindOf(item.kind)
    if (typeof item.id !== 'string' || !ID.test(item.id)) throw new HttpError(400, `items[${i}].id is not a Chronos id`)
    if (item.body === null || typeof item.body !== 'object' || Array.isArray(item.body)) throw new HttpError(400, `items[${i}].body must be an object`)
    return {
      kind,
      id: item.id,
      body: item.body as Record<string, unknown>,
      version: Number.isFinite(item.version) ? Number(item.version) : 0,
      updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : Date.now(),
      updatedBy: typeof item.updatedBy === 'string' ? item.updatedBy.slice(0, 64) : null,
    }
  })
  return { server, items, overwriteWeb: body.overwriteWeb === true }
}

/** {@return the ids of a kind that were saved on the web since the game last downloaded them} */
async function webPending(db: D1Database, kind: Kind, ids: string[]): Promise<Set<string>> {
  const pending = new Set<string>()
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) {
    const chunk = ids.slice(i, i + IDS_PER_QUERY)
    const marks = chunk.map((_, j) => `?${j + 2}`).join(', ')
    const result = await db.prepare(`SELECT id FROM definitions WHERE kind = ?1 AND web_pending = 1 AND id IN (${marks})`)
      .bind(kind, ...chunk).all<{ id: string }>()
    for (const row of result.results) pending.add(row.id)
  }
  return pending
}

/**
 * Writes the plugin's definitions in one batch. Ones saved on the web since the game's last download are left alone
 * (named in skipped) unless overwriteWeb.
 */
export async function upsert(db: D1Database, request: UpsertRequest): Promise<{ written: number; skipped: string[] }> {
  if (request.items.length === 0) return { written: 0, skipped: [] }
  const skipped: string[] = []
  let items = request.items
  if (!request.overwriteWeb) {
    for (const kind of ['quest', 'pool'] as const) {
      const pending = await webPending(db, kind, items.filter((i) => i.kind === kind).map((i) => i.id))
      for (const id of pending) skipped.push(id)
      items = items.filter((i) => i.kind !== kind || !pending.has(i.id))
    }
  }
  const statement = db.prepare(
    `INSERT INTO definitions (kind, id, body, version, updated_at, updated_by, source, server, web_pending)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'server', ?7, 0)
     ON CONFLICT (kind, id) DO UPDATE SET body = excluded.body, version = excluded.version, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by, source = 'server', server = excluded.server, web_pending = 0, deleted_at = NULL, deleted_from = NULL`)
  if (items.length > 0) {
    await db.batch(items.map((item) => statement.bind(item.kind, item.id, JSON.stringify(item.body), item.version,
      item.updatedAt, item.updatedBy, request.server || null)))
  }
  return { written: items.length, skipped: skipped.sort() }
}

export interface SyncedRequest {
  kind: Kind
  items: { id: string; updatedAt: number }[]
}

/** {@return the synced request (what a download took), checked} */
export function readSynced(body: Record<string, unknown>): SyncedRequest {
  const kind = kindOf(body.kind)
  if (!Array.isArray(body.items)) throw new HttpError(400, 'items must be a list')
  const items = body.items.map((raw, i) => {
    const item = raw as Record<string, unknown> | null
    if (!item || typeof item.id !== 'string' || !ID.test(item.id) || typeof item.updatedAt !== 'number') {
      throw new HttpError(400, `items[${i}] needs an id and the updatedAt it was downloaded at`)
    }
    return { id: item.id, updatedAt: item.updatedAt }
  })
  return { kind, items }
}

/**
 * The game took these copies: they are no longer waiting. A copy saved on the web after the download (another
 * updatedAt) stays waiting. A delete the game applied is gone for good. {@return how many rows were cleared}
 */
export async function markSynced(db: D1Database, request: SyncedRequest): Promise<number> {
  if (request.items.length === 0) return 0
  const drop = db.prepare('DELETE FROM definitions WHERE kind = ?1 AND id = ?2 AND updated_at = ?3 AND deleted_at IS NOT NULL')
  const clear = db.prepare('UPDATE definitions SET web_pending = 0 WHERE kind = ?1 AND id = ?2 AND updated_at = ?3 AND web_pending = 1')
  const results = await db.batch(request.items.flatMap((item) => [drop.bind(request.kind, item.id, item.updatedAt),
    clear.bind(request.kind, item.id, item.updatedAt)]))
  return results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0)
}

/** {@return the delete request of the plugin (a quest deleted in game), checked} */
export function readDelete(body: Record<string, unknown>): DeleteRequest {
  const kind = kindOf(body.kind)
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string' || !ID.test(id))) {
    throw new HttpError(400, 'ids must be a list of Chronos ids')
  }
  return { kind, ids: [...new Set(body.ids as string[])] }
}

/**
 * Drops the copies of definitions the game deleted. One saved on the web since the game's last download is kept: the
 * web's change wins until the game downloads it. {@return what was dropped and what was kept}
 */
export async function deleteDefinitions(db: D1Database, request: DeleteRequest): Promise<{ deleted: string[]; kept: string[] }> {
  if (request.ids.length === 0) return { deleted: [], kept: [] }
  const kept = [...(await webPending(db, request.kind, request.ids))].sort()
  const dropping = request.ids.filter((id) => !kept.includes(id))
  const deleted: string[] = []
  for (let i = 0; i < dropping.length; i += IDS_PER_QUERY) {
    const chunk = dropping.slice(i, i + IDS_PER_QUERY)
    const marks = chunk.map((_, j) => `?${j + 2}`).join(', ')
    const result = await db.prepare(`DELETE FROM definitions WHERE kind = ?1 AND web_pending = 0 AND id IN (${marks}) RETURNING id`)
      .bind(request.kind, ...chunk).all<{ id: string }>()
    deleted.push(...result.results.map((r) => r.id))
    if (request.kind === 'quest') {
      await db.prepare(`DELETE FROM layouts WHERE kind = 'quest' AND id IN (${chunk.map((_, j) => `?${j + 1}`).join(', ')})`).bind(...chunk).run()
    }
  }
  return { deleted: deleted.sort(), kept }
}

/** {@return the fetch request, checked} */
export function readFetch(body: Record<string, unknown>): FetchRequest {
  const kind = kindOf(body.kind)
  const withDeletes = body.withDeletes === true
  if (body.ids === null || body.ids === undefined) return { kind, ids: null, withDeletes }
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string' || !ID.test(id))) {
    throw new HttpError(400, 'ids must be null or a list of Chronos ids')
  }
  return { kind, ids: body.ids as string[], withDeletes }
}

/** {@return the stored definitions of a kind (all, or the listed ids)} */
export async function fetchDefinitions(db: D1Database, request: FetchRequest): Promise<DefinitionRow[]> {
  const rows: Row[] = []
  if (request.ids === null) {
    const result = await db.prepare('SELECT * FROM definitions WHERE kind = ?1 ORDER BY id').bind(request.kind).all<Row>()
    rows.push(...result.results)
  } else {
    for (let i = 0; i < request.ids.length; i += IDS_PER_QUERY) {
      const chunk = request.ids.slice(i, i + IDS_PER_QUERY)
      const marks = chunk.map((_, j) => `?${j + 2}`).join(', ')
      const result = await db.prepare(`SELECT * FROM definitions WHERE kind = ?1 AND id IN (${marks}) ORDER BY id`)
        .bind(request.kind, ...chunk).all<Row>()
      rows.push(...result.results)
    }
  }
  // A plugin that does not apply deletes never sees them: it would bring the quest back
  return rows.filter((row) => row.deleted_at == null || request.withDeletes === true).map(toDefinition)
}

export function toDefinition(row: Row): DefinitionRow {
  if (row.deleted_at != null) {
    return { kind: row.kind, id: row.id, body: {}, version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by, source: 'web', deleted: true }
  }
  return {
    kind: row.kind,
    id: row.id,
    body: JSON.parse(row.body) as Record<string, unknown>,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    source: row.source,
    server: row.server,
  }
}
