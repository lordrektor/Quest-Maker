/**
 * The web creator's API, for a signed-in person only:
 *   GET  catalog                 what /chronos cl types and cl refs sent, and the pools in D1
 *   GET  workspaces              the signed-in person's own workspaces (the ones they created), never anyone else's
 *   GET  workspaces/<name>       a workspace (404: a new one)
 *   GET  quests?ids=a,b          quests by id (at most 50); the missing ones are named
 *   GET  quests/<id>/summary     whether a quest exists, and its name (never a list)
 *   POST save                    the workspace and its changed quests, all or nothing
 *   POST quests/<id>/delete      deletes a quest (chronos.cloudflare.delete); the game deletes it at its next download
 * The web writes only here, in D1; the game takes the quests (and the deletes) with /chronos cl download.
 */
import type { DefinitionRow as DefinitionRowOut, RefIndex } from '../shared/api'
import {
  type Catalog, type CatalogResponse, MAX_FETCH_QUESTS, MAX_LAYOUT_BYTES, MAX_QUEST_BYTES, MAX_SAVE_QUESTS, MAX_WORKSPACE_BYTES,
  type PoolRef, type Problem, QUEST_ID, type QuestDoc, type QuestLayout, type QuestSave, type SaveRequest, type Tree,
  type WorkspaceBody, type WorkspaceDoc, WORKSPACE_NAME, type WorkspaceSummary,
} from '../shared/creator'
import { canonicalQuest, eachRequirement, ownPartyTypes, type Quest } from '../shared/quest/canonical'
import { CYCLE_MESSAGE, requirementCycles, validateQuest } from '../shared/quest/validate'
import { loadCatalog } from './catalog'
import { fetchDefinitions } from './definitions'
import { HttpError, fail, json, parseObject } from './http'
import { refIndex, refLabels } from './refs'
import type { SessionOwner } from './session'

const PRIVATE = { 'cache-control': 'private, no-store' }
const IDS_PER_QUERY = 90

interface DefinitionRow {
  id: string
  body: string
  updated_at: number
  updated_by: string | null
  source: 'server' | 'web'
  web_pending: number
}

interface LayoutRow {
  id: string
  layout: string
}

interface WorkspaceRow {
  name: string
  body: string
  created_by: string | null
  updated_at: number
  updated_by: string | null
}

/** Who writes: a signed-in person, or the local developer (PUBLIC_API on localhost). */
export interface Writer {
  name: string
  /** Who owns what they create: a player's UUID, 'console', or 'dev' (PUBLIC_API locally). */
  key: string
  dev: boolean
  /** May delete quests (the code was made for a player with chronos.cloudflare.delete). */
  canDelete: boolean
}

export async function creatorApi(request: Request, db: D1Database, url: URL, path: string, writer: Writer): Promise<Response> {
  const parts = path.split('/')
  if (request.method === 'GET') {
    if (path === 'catalog') return json(await catalogResponse(db), 200, PRIVATE)
    if (path === 'workspaces') return json({ ok: true, workspaces: await ownWorkspaces(db, writer.key) }, 200, PRIVATE)
    if (parts[0] === 'workspaces' && parts.length === 2) {
      const name = decodeURIComponent(parts[1]!)
      if (!WORKSPACE_NAME.test(name)) return fail('not found', 404)
      const workspace = await loadWorkspace(db, name)
      return workspace ? json({ ok: true, workspace }, 200, PRIVATE) : fail('no such workspace', 404)
    }
    if (path === 'quests') {
      const ids = readIds(url.searchParams.get('ids'))
      const quests = await loadQuests(db, ids)
      return json({ ok: true, quests, missing: ids.filter((id) => !quests.some((q) => q.id === id)) }, 200, PRIVATE)
    }
    if (parts[0] === 'quests' && parts[2] === 'summary' && parts.length === 3) {
      const id = parts[1]!
      if (!QUEST_ID.test(id)) return fail('not found', 404)
      const row = await db.prepare("SELECT body FROM definitions WHERE kind = 'quest' AND id = ?1 AND deleted_at IS NULL").bind(id).first<{ body: string }>()
      const name = row ? (JSON.parse(row.body) as Tree).name : undefined
      return json({ ok: true, exists: row !== null, name: typeof name === 'string' ? name : null }, 200, PRIVATE)
    }
    return fail('not found', 404)
  }
  if (request.method === 'POST' && path === 'save') {
    checkWrite(request, url)
    const save = readSave(parseObject(await request.text()))
    const result = await saveAll(db, save, writer, Date.now())
    return json(result.body, result.status, PRIVATE)
  }
  if (request.method === 'POST' && parts[0] === 'quests' && parts[2] === 'delete' && parts.length === 3) {
    checkWrite(request, url)
    const id = parts[1]!
    if (!QUEST_ID.test(id)) return fail('not found', 404)
    const result = await deleteQuest(db, id, readDeleteFrom(parseObject(await request.text())), writer, Date.now())
    return json(result.body, result.status, PRIVATE)
  }
  return fail('not found', 404)
}

/** Writes come only from this site's own pages, as JSON (a SameSite=Strict cookie plus these). */
export function checkWrite(request: Request, url: URL) {
  if (request.headers.get('origin') !== url.origin) throw new HttpError(403, 'writes must come from this site')
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'send JSON')
}

/** {@return the ids of ?ids=a,b,c, checked} */
export function readIds(raw: string | null): string[] {
  const ids = [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter((s) => s !== ''))]
  if (ids.length === 0) throw new HttpError(400, 'name the quests: ?ids=a,b')
  if (ids.length > MAX_FETCH_QUESTS) throw new HttpError(400, `at most ${MAX_FETCH_QUESTS} quests at once`)
  for (const id of ids) if (!QUEST_ID.test(id)) throw new HttpError(400, `'${id}' is not a quest id`)
  return ids
}

// =========================================================================
// READING
// =========================================================================

export async function catalogResponse(db: D1Database): Promise<CatalogResponse> {
  const [{ sections, syncedAt }, refs, labels, pools] = await Promise.all([loadCatalog(db), refIndex(db), refLabels(db), loadPools(db)])
  return { ok: true, catalog: sections as Catalog, syncedAt, refs, refLabels: labels, pools }
}

export async function loadPools(db: D1Database): Promise<PoolRef[]> {
  const rows = await db.prepare("SELECT id, body FROM definitions WHERE kind = 'pool' ORDER BY id").all<{ id: string; body: string }>()
  return rows.results.map((row) => {
    const body = JSON.parse(row.body) as Tree
    return { id: row.id, name: typeof body.name === 'string' ? body.name : row.id, type: typeof body.type === 'string' ? body.type : 'global' }
  })
}

function toWorkspace(row: WorkspaceRow): WorkspaceDoc {
  return { name: row.name, body: JSON.parse(row.body) as WorkspaceBody, createdBy: row.created_by, updatedAt: row.updated_at, updatedBy: row.updated_by }
}

/** {@return a person's own workspaces, the latest first} */
export async function ownWorkspaces(db: D1Database, key: string): Promise<WorkspaceSummary[]> {
  const rows = await db.prepare('SELECT name, body, updated_at, updated_by FROM workspaces WHERE owner_key = ?1 ORDER BY updated_at DESC LIMIT 200')
    .bind(key).all<{ name: string; body: string; updated_at: number; updated_by: string | null }>()
  return rows.results.map((row) => {
    let quests = 0
    try {
      quests = (JSON.parse(row.body) as WorkspaceBody).quests.length
    } catch {
      // A workspace that does not read shows no quests
    }
    return { name: row.name, quests, updatedAt: row.updated_at, updatedBy: row.updated_by }
  })
}

async function loadWorkspace(db: D1Database, name: string): Promise<WorkspaceDoc | null> {
  const row = await db.prepare('SELECT * FROM workspaces WHERE name = ?1').bind(name).first<WorkspaceRow>()
  return row ? toWorkspace(row) : null
}

async function inChunks<T>(db: D1Database, ids: string[], sql: (marks: string) => string): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) {
    const chunk = ids.slice(i, i + IDS_PER_QUERY)
    const marks = chunk.map((_, j) => `?${j + 1}`).join(', ')
    rows.push(...(await db.prepare(sql(marks)).bind(...chunk).all<T>()).results)
  }
  return rows
}

function toQuest(row: DefinitionRow, layout: string | undefined): QuestDoc {
  return {
    id: row.id,
    body: JSON.parse(row.body) as Tree,
    layout: layout ? (JSON.parse(layout) as QuestLayout) : null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    source: row.source,
    webPending: row.web_pending === 1,
  }
}

export async function loadQuests(db: D1Database, ids: string[]): Promise<QuestDoc[]> {
  if (ids.length === 0) return []
  const [rows, layouts] = await Promise.all([
    inChunks<DefinitionRow>(db, ids, (m) => `SELECT id, body, updated_at, updated_by, source, web_pending FROM definitions
      WHERE kind = 'quest' AND deleted_at IS NULL AND id IN (${m})`),
    inChunks<LayoutRow>(db, ids, (m) => `SELECT id, layout FROM layouts WHERE kind = 'quest' AND id IN (${m})`),
  ])
  const layoutOf = new Map(layouts.map((l) => [l.id, l.layout]))
  return rows.map((row) => toQuest(row, layoutOf.get(row.id))).sort((a, b) => a.id.localeCompare(b.id))
}

/** {@return the workspace request of the plugin (/chronos cl download ws <name>), checked} */
export function readWorkspaceFetch(body: Record<string, unknown>): string {
  if (typeof body.name !== 'string' || !WORKSPACE_NAME.test(body.name)) throw new HttpError(400, 'name must be a workspace name (a-z, 0-9, _ or -)')
  return body.name
}

/**
 * {@return a workspace's quests as the plugin downloads them (like definitions/fetch), and the ids on it that are not
 * in D1; null when there is no workspace of that name}
 *
 * @param withDeletes Also the quests deleted on the website that are on it, or were deleted from it.
 */
export async function workspaceQuests(db: D1Database, name: string, withDeletes = false):
  Promise<{ items: DefinitionRowOut[]; missing: string[] } | null> {
  const workspace = await loadWorkspace(db, name)
  if (!workspace) return null
  const ids = new Set(workspace.body.quests.map((b) => b.id))
  if (withDeletes) {
    const gone = await db.prepare("SELECT id FROM definitions WHERE kind = 'quest' AND deleted_at IS NOT NULL AND deleted_from = ?1")
      .bind(name).all<{ id: string }>()
    for (const row of gone.results) ids.add(row.id)
  }
  const items = await fetchDefinitions(db, { kind: 'quest', ids: [...ids], withDeletes })
  return { items, missing: [...ids].filter((id) => !items.some((row) => row.id === id)) }
}

// =========================================================================
// DELETING
// =========================================================================

/** {@return the workspace a delete came from (its download takes the delete too), or null} */
export function readDeleteFrom(body: Record<string, unknown>): string | null {
  if (body.workspace === null || body.workspace === undefined) return null
  if (typeof body.workspace !== 'string' || !WORKSPACE_NAME.test(body.workspace)) throw new HttpError(400, 'workspace must be a workspace name')
  return body.workspace
}

/**
 * Deletes a quest on the website: it is gone here at once, and the game deletes it at its next download (the row
 * stays, marked, until then). Its layout goes now. Workspaces keep its id: each leaves it out when it is opened.
 */
export async function deleteQuest(db: D1Database, id: string, from: string | null, writer: Writer, now: number):
  Promise<{ status: number; body: unknown }> {
  if (!writer.canDelete) {
    return { status: 403, body: { ok: false, error: 'deleting quests needs chronos.cloudflare.delete; get a new code in game once you have it' } }
  }
  const row = await db.prepare("SELECT updated_at FROM definitions WHERE kind = 'quest' AND id = ?1 AND deleted_at IS NULL")
    .bind(id).first<{ updated_at: number }>()
  if (!row) return { status: 404, body: { ok: false, error: `there is no quest ${id}` } }
  const at = Math.max(now, row.updated_at + 1)
  await db.batch([
    db.prepare(`UPDATE definitions SET deleted_at = ?2, deleted_from = ?3, updated_at = ?2, updated_by = ?4, source = 'web', web_pending = 1
      WHERE kind = 'quest' AND id = ?1 AND deleted_at IS NULL`).bind(id, at, from, writer.name),
    db.prepare("DELETE FROM layouts WHERE kind = 'quest' AND id = ?1").bind(id),
  ])
  return { status: 200, body: { ok: true, deleted: id } }
}

// =========================================================================
// SAVING
// =========================================================================

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function base(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new HttpError(400, `${path} must be a number or null`)
  return value
}

/** {@return the save request, checked: ids, sizes, shapes} */
export function readSave(body: Record<string, unknown>): SaveRequest {
  if (!Array.isArray(body.quests)) throw new HttpError(400, 'quests must be a list')
  if (body.quests.length > MAX_SAVE_QUESTS) throw new HttpError(400, `at most ${MAX_SAVE_QUESTS} quests per save`)
  const seen = new Set<string>()
  const quests = body.quests.map((raw, i): QuestSave => {
    if (!isObject(raw)) throw new HttpError(400, `quests[${i}] must be an object`)
    if (typeof raw.id !== 'string' || !QUEST_ID.test(raw.id)) throw new HttpError(400, `quests[${i}].id is not a quest id`)
    if (seen.has(raw.id)) throw new HttpError(400, `quest ${raw.id} is in the save twice`)
    seen.add(raw.id)
    if (!isObject(raw.body)) throw new HttpError(400, `quests[${i}].body must be an object`)
    if (raw.body.id !== undefined && raw.body.id !== raw.id) throw new HttpError(400, `quests[${i}].body.id is not ${raw.id}`)
    if (bytes(raw.body) > MAX_QUEST_BYTES) throw new HttpError(413, `quest ${raw.id} is larger than ${MAX_QUEST_BYTES / 1000} KB`)
    let layout: QuestLayout | null = null
    if (raw.layout !== null && raw.layout !== undefined) {
      if (!isObject(raw.layout) || raw.layout.v !== 1 || !isObject(raw.layout.positions)) throw new HttpError(400, `quests[${i}].layout is not a layout`)
      if (bytes(raw.layout) > MAX_LAYOUT_BYTES) throw new HttpError(413, `the layout of ${raw.id} is larger than ${MAX_LAYOUT_BYTES / 1000} KB`)
      layout = raw.layout as unknown as QuestLayout
    }
    return { id: raw.id, body: raw.body, layout, baseUpdatedAt: base(raw.baseUpdatedAt, `quests[${i}].baseUpdatedAt`) }
  })
  let workspace: SaveRequest['workspace']
  if (body.workspace !== null && body.workspace !== undefined) {
    const w = body.workspace
    if (!isObject(w) || typeof w.name !== 'string' || !WORKSPACE_NAME.test(w.name)) throw new HttpError(400, 'workspace.name must be a-z, 0-9, _ or -')
    if (!isObject(w.body) || w.body.v !== 1 || !Array.isArray(w.body.quests)) throw new HttpError(400, 'workspace.body is not a workspace')
    for (const box of w.body.quests as unknown[]) {
      if (!isObject(box) || typeof box.id !== 'string' || !QUEST_ID.test(box.id) || typeof box.x !== 'number' || typeof box.y !== 'number') {
        throw new HttpError(400, 'workspace.body.quests holds { id, x, y, open } boxes')
      }
    }
    if (bytes(w.body) > MAX_WORKSPACE_BYTES) throw new HttpError(413, `the workspace is larger than ${MAX_WORKSPACE_BYTES / 1000} KB`)
    workspace = { name: w.name, body: w.body as unknown as WorkspaceBody, baseUpdatedAt: base(w.baseUpdatedAt, 'workspace.baseUpdatedAt') }
  }
  if (quests.length === 0 && !workspace) throw new HttpError(400, 'nothing to save')
  return { workspace, quests }
}

/** {@return the quest ids a quest names in its arguments (quest_completed, start_quest...)} */
export function referencedQuests(quest: Quest, catalog: Catalog): string[] {
  const questParams = new Map<string, Set<string>>()
  for (const category of ['objective', 'requirement', 'reward'] as const) {
    for (const type of catalog.types?.[category] ?? []) {
      const names = type.params.filter((p) => p.kind === 'QUEST').map((p) => p.name)
      if (names.length > 0) questParams.set(`${category}:${type.id}`, new Set(names))
    }
  }
  // Without a catalog, the two built-in links are still known
  if (!catalog.types) {
    questParams.set('requirement:quest_completed', new Set(['quest']))
    questParams.set('requirement:quest_failed', new Set(['quest']))
    questParams.set('reward:start_quest', new Set(['quest']))
  }
  const ids = new Set<string>()
  const add = (category: string, type: string, args: [string, unknown][]) => {
    const names = questParams.get(`${category}:${type}`)
    if (!names) return
    for (const [key, value] of args) if (names.has(key) && typeof value === 'string' && QUEST_ID.test(value)) ids.add(value)
  }
  // Every quest a requirement names, reversed or in any group too: validate warns about each one that does not exist
  for (const r of [...eachRequirement(quest.requirements, ''), ...eachRequirement(quest.fail.unless, '')]) {
    add('requirement', r.requirement.type, r.requirement.args)
  }
  quest.rewards.forEach((r) => add('reward', r.type, r.args))
  quest.fail.actions.forEach((r) => add('reward', r.type, r.args))
  quest.objectives.forEach((o) => {
    add('objective', o.type, o.args)
    o.rewards.forEach((r) => add('reward', r.type, r.args))
    o.callbacks.forEach((r) => add('reward', r.type, r.args))
  })
  quest.stageRewards.forEach(([, rewards]) => rewards.forEach((r) => add('reward', r.type, r.args)))
  quest.stageCallbacks.forEach(([, actions]) => actions.forEach((r) => add('reward', r.type, r.args)))
  for (const actions of Object.values(quest.callbacks)) actions.forEach((r) => add('reward', r.type, r.args))
  quest.fail.when.forEach((o) => add('objective', o.type, o.args))
  return [...ids]
}

/** One quest of a save, read and checked. */
interface Planned {
  save: QuestSave
  body: Tree
  quest: Quest
  problems: Problem[]
}

/** {@return a statement that fails (rolling the whole batch back) unless the condition holds} */
function guard(db: D1Database, condition: string, ...binds: unknown[]): D1PreparedStatement {
  return db.prepare(`SELECT json(CASE WHEN ${condition} THEN '1' ELSE 'changed by someone else' END)`).bind(...binds)
}

export async function saveAll(db: D1Database, save: SaveRequest, writer: Writer, now: number): Promise<{ status: number; body: unknown }> {
  const ids = save.quests.map((q) => q.id)
  const [current, workspace, { sections }, refs, pools] = await Promise.all([
    loadQuests(db, ids),
    save.workspace ? loadWorkspace(db, save.workspace.name) : Promise.resolve(null),
    loadCatalog(db),
    refIndex(db),
    loadPools(db),
  ])
  const catalog = sections as Catalog
  const currentOf = new Map(current.map((q) => [q.id, q]))
  // Reward types whose party is their own argument, as the plugin reads them
  const ownParty = ownPartyTypes(catalog)

  // Someone saved in between: nothing is written
  const conflicts = conflictsOf(save, currentOf, workspace)
  if (conflicts) return { status: 409, body: { ok: false, error: 'changed by someone else since you opened it', conflicts } }

  // Read and check every quest first: one error and nothing is written
  const planned: Planned[] = []
  const problems: Record<string, Problem[]> = {}
  for (const quest of save.quests) {
    const read = canonicalQuest(quest.body, quest.id, ownParty)
    if (!read.body || !read.quest) {
      problems[quest.id] = read.problems
      continue
    }
    planned.push({ save: quest, body: read.body, quest: read.quest, problems: read.problems })
  }
  const saving = new Set(ids)
  const referenced = [...new Set(planned.flatMap((p) => referencedQuests(p.quest, catalog)))].filter((id) => !saving.has(id))
  const others = await loadQuests(db, referenced)
  const exists = new Set([...saving, ...others.map((q) => q.id)])
  const poolMap = new Map(pools.map((p) => [p.id, { type: p.type }]))
  for (const p of planned) {
    p.problems.push(...validateQuest(p.quest, { catalog, refs: refs as RefIndex, pools: poolMap, questExists: (id) => exists.has(id) }))
  }
  // Cycles among the quests saved and the ones they name
  const graph = new Map<string, Quest>(planned.map((p) => [p.save.id, p.quest]))
  for (const other of others) {
    const read = canonicalQuest(other.body, other.id, ownParty)
    if (read.quest && !graph.has(other.id)) graph.set(other.id, read.quest)
  }
  for (const id of requirementCycles(graph)) planned.find((p) => p.save.id === id)?.problems.push({ path: 'requirements', message: CYCLE_MESSAGE, error: false })
  for (const p of planned) problems[p.save.id] = p.problems
  if (Object.values(problems).some((list) => list.some((x) => x.error))) {
    return { status: 422, body: { ok: false, error: 'some quests have errors; nothing was saved', problems } }
  }

  // Write everything in one batch (one transaction); the guards roll it back if anything moved meanwhile
  const statements: D1PreparedStatement[] = []
  const written = new Map<string, number>()
  for (const p of planned) {
    const before = currentOf.get(p.save.id)
    const at = Math.max(now, (p.save.baseUpdatedAt ?? 0) + 1)
    const unchanged = before !== undefined && JSON.stringify(before.body) === JSON.stringify(p.body)
    if (!unchanged) {
      if (before) {
        statements.push(guard(db, "EXISTS (SELECT 1 FROM definitions WHERE kind = 'quest' AND id = ?1 AND updated_at = ?2)", p.save.id, before.updatedAt))
        statements.push(db.prepare(`UPDATE definitions SET body = ?2, updated_at = ?3, updated_by = ?4, source = 'web', web_pending = 1
          WHERE kind = 'quest' AND id = ?1`).bind(p.save.id, JSON.stringify(p.body), at, writer.name))
      } else {
        statements.push(guard(db, "NOT EXISTS (SELECT 1 FROM definitions WHERE kind = 'quest' AND id = ?1 AND deleted_at IS NULL)", p.save.id))
        // A quest deleted on the website and made again under its id is live again: the game imports it, not deletes it
        statements.push(db.prepare(`INSERT INTO definitions (kind, id, body, version, updated_at, updated_by, source, server, web_pending)
          VALUES ('quest', ?1, ?2, 0, ?3, ?4, 'web', NULL, 1)
          ON CONFLICT (kind, id) DO UPDATE SET body = excluded.body, updated_at = MAX(excluded.updated_at, definitions.updated_at + 1),
            updated_by = excluded.updated_by, source = 'web', web_pending = 1, deleted_at = NULL, deleted_from = NULL`)
          .bind(p.save.id, JSON.stringify(p.body), at, writer.name))
      }
      written.set(p.save.id, at)
    }
    if (p.save.layout) {
      statements.push(db.prepare(`INSERT OR REPLACE INTO layouts (kind, id, layout, updated_at, updated_by) VALUES ('quest', ?1, ?2, ?3, ?4)`)
        .bind(p.save.id, JSON.stringify(p.save.layout), now, writer.name))
    }
  }
  if (save.workspace) {
    const w = save.workspace
    if (workspace) statements.push(guard(db, 'EXISTS (SELECT 1 FROM workspaces WHERE name = ?1 AND updated_at = ?2)', w.name, workspace.updatedAt))
    else statements.push(guard(db, 'NOT EXISTS (SELECT 1 FROM workspaces WHERE name = ?1)', w.name))
    // The creator owns it; an older workspace without an owner goes to the first person who saves it
    statements.push(db.prepare(`INSERT INTO workspaces (name, body, created_at, created_by, updated_at, updated_by, owner_key)
      VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?6)
      ON CONFLICT (name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by,
        owner_key = COALESCE(workspaces.owner_key, excluded.owner_key)`)
      .bind(w.name, JSON.stringify(w.body), now, writer.name, Math.max(now, (w.baseUpdatedAt ?? 0) + 1), writer.key))
  }
  if (statements.length > 0) {
    try {
      await db.batch(statements)
    } catch (e) {
      if (!String((e as Error)?.message ?? e).includes('malformed JSON')) throw e
      // A guard failed: someone saved between our read and our write
      const [latest, latestWorkspace] = await Promise.all([loadQuests(db, ids), save.workspace ? loadWorkspace(db, save.workspace.name) : Promise.resolve(null)])
      return {
        status: 409,
        body: { ok: false, error: 'changed by someone else while saving', conflicts: conflictsOf(save, new Map(latest.map((q) => [q.id, q])), latestWorkspace)
          ?? { quests: latest, workspace: latestWorkspace } },
      }
    }
  }
  const [saved, savedWorkspace] = await Promise.all([loadQuests(db, ids), save.workspace ? loadWorkspace(db, save.workspace.name) : Promise.resolve(null)])
  const warnings: Record<string, Problem[]> = {}
  for (const [id, list] of Object.entries(problems)) if (list.length > 0) warnings[id] = list
  return { status: 200, body: { ok: true, quests: saved, workspace: savedWorkspace, warnings } }
}

/** {@return the newer copies when anything changed since it was opened, else null} */
export function conflictsOf(save: SaveRequest, current: Map<string, QuestDoc>, workspace: WorkspaceDoc | null):
  { quests: (QuestDoc | { id: string; missing: true })[]; workspace: WorkspaceDoc | null } | null {
  const quests: (QuestDoc | { id: string; missing: true })[] = []
  for (const q of save.quests) {
    const now = current.get(q.id)
    if (q.baseUpdatedAt === null && now) quests.push(now)
    else if (q.baseUpdatedAt !== null && !now) quests.push({ id: q.id, missing: true })
    else if (q.baseUpdatedAt !== null && now && now.updatedAt !== q.baseUpdatedAt) quests.push(now)
  }
  let workspaceMoved = false
  if (save.workspace) {
    const base = save.workspace.baseUpdatedAt
    workspaceMoved = base === null ? workspace !== null : workspace === null || workspace.updatedAt !== base
  }
  if (quests.length === 0 && !workspaceMoved) return null
  return { quests, workspace: workspaceMoved ? workspace : null }
}

