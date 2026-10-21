/**
 * A workspace: one canvas holding several quests, each in a box, joined by lines.
 *   starts   A → B: A has a start_quest reward for B (finishing A starts B)
 *   unlocks  A → B: B has a quest_completed requirement for A (B unlocks after A)
 *   fails    A → B: A has a start_quest in its fail actions (failing A starts B)
 *   fail-unlocks  A → B: B has a quest_failed requirement for A (B unlocks once A failed)
 * The lines are read from the quests themselves; drawing or deleting one edits the quest that holds it.
 */
import type { QuestDoc, QuestLayout, SaveRequest, Tree, WorkspaceBody, WorkspaceDoc } from '../../shared/creator'
import { QUEST_ID } from '../../shared/creator'
import { canonicalQuest } from '../../shared/quest/canonical'
import { argOf, groupMode, looseParts, modelToTree, newQuestModel, type Nid, type QuestModel, savedNids, treeToModel } from './model'
import { addEntry, removeEntry } from './ops'

export type LinkKind = 'starts' | 'unlocks' | 'fails' | 'fail-unlocks'

export interface Link {
  kind: LinkKind
  from: string
  to: string
  /** The quest holding the entry, and the entry. */
  holder: string
  nid: Nid
}

export interface Box {
  x: number
  y: number
  open: boolean
  /** Resized by hand (the box is never smaller than its parts). */
  w?: number
  h?: number
}

export interface QuestState {
  model: QuestModel
  /** As loaded or last saved; null for a quest not in D1 yet. */
  base: QuestDoc | null
  /** Where each part sits inside its box, by nid. */
  positions: Record<Nid, { x: number; y: number }>
}

export interface WorkspaceModel {
  name: string
  base: WorkspaceDoc | null
  /** In the order they were added. */
  order: string[]
  quests: Record<string, QuestState>
  boxes: Record<string, Box>
  viewport?: { x: number; y: number; zoom: number }
}

export function emptyWorkspace(name: string): WorkspaceModel {
  return { name, base: null, order: [], quests: {}, boxes: {} }
}

/** {@return a quest's state from its stored copy} */
export function loadedQuest(doc: QuestDoc): QuestState {
  return { model: treeToModel(doc.body, doc.id, doc.layout), base: doc, positions: { ...(doc.layout?.positions ?? {}) } }
}

/** {@return a new quest (not in D1 yet)} */
export function newQuest(id: string, pool: string | null): QuestState {
  if (!QUEST_ID.test(id)) throw new Error(`'${id}' is not a quest id (a-z, 0-9 and _, at most 64)`)
  return { model: newQuestModel(id, pool), base: null, positions: {} }
}

/** Puts a quest on the workspace (replacing its copy when it is there). */
export function putQuest(ws: WorkspaceModel, state: QuestState, box?: Partial<Box>) {
  const id = state.model.id
  ws.quests[id] = state
  if (!ws.order.includes(id)) ws.order.push(id)
  const old = ws.boxes[id]
  ws.boxes[id] = { x: box?.x ?? old?.x ?? 0, y: box?.y ?? old?.y ?? 0, open: box?.open ?? old?.open ?? true }
  const w = box && 'w' in box ? box.w : old?.w
  const h = box && 'h' in box ? box.h : old?.h
  if (w !== undefined) ws.boxes[id]!.w = w
  if (h !== undefined) ws.boxes[id]!.h = h
}

/** Takes a quest off the workspace (it stays in D1). */
export function removeQuest(ws: WorkspaceModel, id: string) {
  delete ws.quests[id]
  delete ws.boxes[id]
  ws.order = ws.order.filter((q) => q !== id)
}

// =========================================================================
// LINKS
// =========================================================================

function questArg(model: QuestModel, nid: Nid): string | null {
  const value = argOf(model.entries[nid]!, 'quest')
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * {@return the requirements (to start) that must be met, so make "this quest needs that one" (the rule of
 * canonical.eachRequirement, at every level of groups). A reversed quest_completed, or one in a plain any group, draws
 * no unlock line.}
 */
export function neededRequirements(model: QuestModel): Nid[] {
  const needed: Nid[] = []
  const walk = (nid: Nid, must: boolean | null) => {
    const entry = model.entries[nid]
    if (!entry) return
    if (!entry.members) {
      if (must !== null && must !== (entry.not === true)) needed.push(nid)
      return
    }
    const inner = must === null ? null : must !== (entry.not === true)
    const mode = groupMode(entry)
    const each = inner === true ? (mode === 'all' ? true : null) : inner === false ? (mode === 'any' ? false : null) : null
    for (const member of entry.members) walk(member, each)
  }
  for (const nid of model.requirements) walk(nid, true)
  return needed
}

/** {@return every line from or to the workspace's quests; `to`/`from` may be a quest not on it (a ghost)} */
export function links(ws: WorkspaceModel): Link[] {
  const found: Link[] = []
  for (const id of ws.order) {
    const model = ws.quests[id]!.model
    // A start_quest among the quest's rewards, an objective's or a stage's own, or a callback (start, complete, abandon, expire)
    const rewardNids = [...model.rewards, ...model.chain.flatMap((s) => [...model.stages[s]!.rewards, ...model.stages[s]!.callbacks,
      ...model.stages[s]!.objectives.flatMap((o) => [...(model.entries[o]?.rewards ?? []), ...(model.entries[o]?.callbacks ?? [])])]),
    ...model.callbacks.start, ...model.callbacks.complete, ...model.callbacks.abandon, ...model.callbacks.expire]
    for (const nid of rewardNids) {
      if (model.entries[nid]?.type !== 'start_quest') continue
      const target = questArg(model, nid)
      if (target) found.push({ kind: 'starts', from: id, to: target, holder: id, nid })
    }
    for (const nid of neededRequirements(model)) {
      const type = model.entries[nid]!.type
      if (type !== 'quest_completed' && type !== 'quest_failed') continue
      const source = questArg(model, nid)
      if (source) found.push({ kind: type === 'quest_failed' ? 'fail-unlocks' : 'unlocks', from: source, to: id, holder: id, nid })
    }
    for (const nid of [...model.fail.actions, ...model.callbacks.fail]) {
      if (model.entries[nid]!.type !== 'start_quest') continue
      const target = questArg(model, nid)
      if (target) found.push({ kind: 'fails', from: id, to: target, holder: id, nid })
    }
  }
  return found
}

/** {@return the quests named by the workspace's quests that are not on it} */
export function ghosts(ws: WorkspaceModel): string[] {
  const names = new Set<string>()
  for (const link of links(ws)) for (const id of [link.from, link.to]) if (!ws.quests[id]) names.add(id)
  return [...names].sort()
}

/** {@return why a line cannot be drawn, or null} */
export function linkRefusal(ws: WorkspaceModel, kind: LinkKind, from: string, to: string): string | null {
  if (from === to) return kind === 'fails' ? 'a quest cannot start itself when it fails (its result decides whether it can start again)'
    : 'a quest cannot start or unlock itself'
  const holder = kind === 'unlocks' || kind === 'fail-unlocks' ? to : from
  if (!ws.quests[holder]) return `${holder} is not on this workspace`
  if (links(ws).some((l) => l.kind === kind && l.from === from && l.to === to)) return 'that line is already there'
  return null
}

/**
 * Draws a line: adds the start_quest reward to `from`, or the quest_completed requirement to `to`.
 * {@return why it could not, or null}
 */
export function link(ws: WorkspaceModel, kind: LinkKind, from: string, to: string): string | null {
  const why = linkRefusal(ws, kind, from, to)
  if (why) return why
  if (kind === 'starts') addEntry(ws.quests[from]!.model, 'reward', 'start_quest', { kind: 'rewards' }, [['quest', to]])
  else if (kind === 'fails') addEntry(ws.quests[from]!.model, 'reward', 'start_quest', { kind: 'actions' }, [['quest', to]])
  else if (kind === 'fail-unlocks') addEntry(ws.quests[to]!.model, 'requirement', 'quest_failed', { kind: 'requirements' }, [['quest', from]])
  else addEntry(ws.quests[to]!.model, 'requirement', 'quest_completed', { kind: 'requirements' }, [['quest', from]])
  return null
}

/** Deletes a line: the entry that makes it. */
export function unlink(ws: WorkspaceModel, line: Link) {
  const state = ws.quests[line.holder]
  if (state) removeEntry(state.model, line.nid)
}

/** {@return the quests a quest names (to load them with "Load linked")} */
export function linkedIds(ws: WorkspaceModel, id: string): string[] {
  const named = new Set<string>()
  for (const l of links(ws)) {
    if (l.holder !== id) continue
    named.add(l.from === id ? l.to : l.from)
  }
  named.delete(id)
  return [...named].filter((q) => !ws.quests[q]).sort()
}

// =========================================================================
// SAVING
// =========================================================================

/** {@return the quest's tree to save} */
export function treeOf(state: QuestState): Tree {
  return modelToTree(state.model)
}

const storedTrees = new WeakMap<QuestDoc, string>()

/** {@return the stored copy as the canonical JSON it reads as} */
function storedTree(doc: QuestDoc): string {
  let tree = storedTrees.get(doc)
  if (tree === undefined) {
    tree = JSON.stringify(canonicalQuest(doc.body, doc.id).body ?? doc.body)
    storedTrees.set(doc, tree)
  }
  return tree
}

/** {@return true when a quest differs from its stored copy (or is new)} */
export function isDirty(state: QuestState): boolean {
  if (!state.base) return true
  return JSON.stringify(treeOf(state)) !== storedTree(state.base)
}

/** {@return the layout to save: positions under the nids the saved quest gets when opened again, and the loose parts} */
export function layoutOf(state: QuestState): QuestLayout {
  const renamed = savedNids(state.model)
  const positions: QuestLayout['positions'] = {}
  for (const [nid, at] of Object.entries(state.positions)) positions[renamed.get(nid) ?? nid] = { x: Math.round(at.x), y: Math.round(at.y) }
  const loose = looseParts(state.model)
  return loose.length > 0 ? { v: 1, positions, loose } : { v: 1, positions }
}

/** {@return true when the layout differs from the stored one} */
export function layoutDirty(state: QuestState): boolean {
  return JSON.stringify(layoutOf(state)) !== JSON.stringify(state.base?.layout ?? { v: 1, positions: {} })
}

export function workspaceBody(ws: WorkspaceModel): WorkspaceBody {
  return {
    v: 1,
    quests: ws.order.map((id) => {
      const box = ws.boxes[id]!
      return { id, x: Math.round(box.x), y: Math.round(box.y), open: box.open, ...(box.w ? { width: Math.round(box.w) } : {}), ...(box.h ? { height: Math.round(box.h) } : {}) }
    }),
    ...(ws.viewport ? { viewport: ws.viewport } : {}),
  }
}

/** {@return true when the workspace itself (its quests, where they sit) differs from the stored one} */
export function workspaceDirty(ws: WorkspaceModel): boolean {
  const body = workspaceBody(ws)
  const stored = ws.base?.body
  const strip = (b: WorkspaceBody) => JSON.stringify(b.quests)
  if (!stored) return ws.order.length > 0
  return strip(body) !== strip(stored)
}

/** {@return the quests that need saving} */
export function dirtyQuests(ws: WorkspaceModel): string[] {
  return ws.order.filter((id) => isDirty(ws.quests[id]!))
}

/** {@return the save request: the workspace and every quest whose tree or layout changed} */
export function saveRequest(ws: WorkspaceModel): SaveRequest {
  const quests = ws.order.map((id) => ws.quests[id]!).filter((s) => isDirty(s) || layoutDirty(s)).map((s) => ({
    id: s.model.id, body: treeOf(s), layout: layoutOf(s), baseUpdatedAt: s.base?.updatedAt ?? null,
  }))
  return { workspace: { name: ws.name, body: workspaceBody(ws), baseUpdatedAt: ws.base?.updatedAt ?? null }, quests }
}

/** Takes in what the Worker stored: the saved quests are reloaded from their stored copies (their parts get their saved nids). */
export function applySaved(ws: WorkspaceModel, quests: QuestDoc[], workspace: WorkspaceDoc | null) {
  for (const doc of quests) {
    const old = ws.quests[doc.id]
    if (!old) continue
    putQuest(ws, loadedQuest(doc))
  }
  if (workspace) ws.base = workspace
}

/** {@return a workspace from its stored copy and its quests (the ones missing in D1 are left out and named)} */
export function loadWorkspace(doc: WorkspaceDoc, quests: QuestDoc[]): { ws: WorkspaceModel; missing: string[] } {
  const ws = emptyWorkspace(doc.name)
  ws.base = doc
  if (doc.body.viewport) ws.viewport = doc.body.viewport
  const byId = new Map(quests.map((q) => [q.id, q]))
  const missing: string[] = []
  for (const box of doc.body.quests) {
    const quest = byId.get(box.id)
    if (!quest) {
      missing.push(box.id)
      continue
    }
    putQuest(ws, loadedQuest(quest), { x: box.x, y: box.y, open: box.open, w: box.width, h: box.height })
  }
  return { ws, missing }
}

