/**
 * The workspace editor's state and actions, shared by the page, the canvas and the panels (provide/inject). Every
 * change goes through edit(), which records undo history and keeps a draft in this browser.
 */
import { RESERVED_IDS, typedId } from './input'
import { computed, inject, markRaw, provide, reactive, shallowRef, type InjectionKey } from 'vue'
import type { Category, Problem, QuestDoc, WorkspaceDoc } from '../../shared/creator'
import { QUEST_ID } from '../../shared/creator'
import { type GroupMode, ownPartyTypes, setOwnPartyTypes } from '../../shared/quest/canonical'
import { ApiError } from '../api'
import { deleteQuest as deleteCall, fetchCatalog, fetchQuests, fetchSummary, fetchWorkspace, save as saveCall } from './api'
import { CatalogView } from './catalog'
import { setRefNames } from '../describe'
import { dropDraft, loadDraft, saveDraft, type Draft } from './draft'
import { History } from './history'
import { autoLayout, layoutBoxes, resizedBox } from './layout'
import type { EntryCategory, Nid, Parent } from './model'
import {
  addEntry, addGroup, addStage, attach, inRewardRequirements, refusal, requirementTarget, detach, leaveGroup, moveStageAfter, parentOf, removeCallbacks, removeEntry, removeFail, removeStage,
  renumberStages, setGroupMode, setReversed, shift, showCallbacks, showFail, unchainStage,
} from './ops'
import { checkWorkspace } from './problems'
import { drawnSize, interpret, type LineRef, partPositions } from './canvas/flow'
import type { Connection } from '@vue-flow/core'
import {
  applySaved, dirtyQuests, emptyWorkspace, isDirty, layoutDirty, link, linkedIds, links, loadedQuest, loadWorkspace, newQuest, putQuest,
  removeQuest, saveRequest, unlink, type Link, type WorkspaceModel, workspaceDirty,
} from './workspace'

export type Selection =
  | { kind: 'part'; quest: string; key: string }
  | { kind: 'box'; quest: string }
  | { kind: 'link'; holder: string; nid: Nid }
  /** A line of a quest's stage chain: deleting it takes the stage off the chain. */
  | { kind: 'chain'; quest: string; stage: Nid }
  | { kind: 'ghost'; quest: string }
  | null

export interface Notice {
  text: string
  tone: 'info' | 'error' | 'success'
}

export interface Conflict {
  quests: (QuestDoc | { id: string; missing: true })[]
  workspace: WorkspaceDoc | null
}

const KEY: InjectionKey<Editor> = Symbol('editor')

export type Editor = ReturnType<typeof createEditor>

export function provideEditor(editor: Editor) {
  provide(KEY, editor)
}

export function useEditor(): Editor {
  const editor = inject(KEY)
  if (!editor) throw new Error('no editor')
  return editor
}

export function createEditor(name: string) {
  const state = reactive({
    ws: emptyWorkspace(name) as WorkspaceModel,
    loading: true,
    loadError: null as string | null,
    selection: null as Selection,
    notice: null as Notice | null,
    saving: false,
    /** The ids of the quests the last save wrote (for the download hint). */
    saved: null as string[] | null,
    conflict: null as Conflict | null,
    serverProblems: null as Record<string, Problem[]> | null,
    draft: null as Draft | null,
    /** Quest ids checked in D1 (for quest fields): true exists, false does not. */
    known: {} as Record<string, boolean>,
    /** Bumped on undo/redo and loads, so the canvas fits again when needed. */
    version: 0,
    /** A part the canvas moves to and makes pulse (a stage or the fail rules just added); n changes every time. */
    focus: null as { quest: string; key: string; n: number } | null,
  })
  const history = new History<WorkspaceModel>()
  /** What the server knows; outside the reactive state (it is large and never changes after loading). */
  const catalog = shallowRef<CatalogView | null>(null)

  /** What the server knows, for the rules that need it (what each requirement use takes). */
  const types = () => catalog.value?.response.catalog

  const checked = computed(() => checkWorkspace(state.ws, catalog.value, (id) => state.known[id]))
  const dirty = computed(() => dirtyQuests(state.ws))
  const unsaved = computed(() => dirty.value.length > 0 || workspaceDirty(state.ws)
    || state.ws.order.some((id) => layoutDirty(state.ws.quests[id]!)))

  let draftTimer: ReturnType<typeof setTimeout> | undefined
  function keepDraft() {
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      if (unsaved.value) saveDraft(state.ws)
      else dropDraft(state.ws.name)
    }, 500)
  }

  function notify(text: string, tone: Notice['tone'] = 'info') {
    state.notice = { text, tone }
  }

  /** Changes the workspace: records history first; a function answering with text refused (nothing changed). */
  function edit(change: (ws: WorkspaceModel) => string | null | void): boolean {
    const before = JSON.parse(JSON.stringify(state.ws)) as WorkspaceModel
    const refused = change(state.ws)
    if (typeof refused === 'string') {
      // Refused half-way: nothing of it stays
      state.ws = before
      notify(refused, 'error')
      return false
    }
    history.record(before)
    state.saved = null
    keepDraft()
    return true
  }

  function undo() {
    const previous = history.undo(state.ws)
    if (previous) restore(previous)
  }

  function redo() {
    const next = history.redo(state.ws)
    if (next) restore(next)
  }

  function restore(ws: WorkspaceModel) {
    state.ws = ws
    if (state.selection && !selectionExists(state.selection)) state.selection = null
    keepDraft()
  }

  function selectionExists(selection: NonNullable<Selection>): boolean {
    if (selection.kind === 'link') return links(state.ws).some((l) => l.holder === selection.holder && l.nid === selection.nid)
    if (selection.kind === 'ghost') return true
    const q = state.ws.quests[selection.quest]
    if (!q) return false
    if (selection.kind === 'chain') return q.model.chain.includes(selection.stage)
    if (selection.kind === 'box') return true
    return ['start', 'finish', 'fail', 'callbacks'].includes(selection.key) || !!q.model.stages[selection.key] || !!q.model.entries[selection.key]
  }

  // =========================================================================
  // LOADING
  // =========================================================================

  async function load() {
    state.loading = true
    state.loadError = null
    try {
      const [catalogAnswer, workspace] = await Promise.all([fetchCatalog(), fetchWorkspace(name)])
      catalog.value = markRaw(new CatalogView(catalogAnswer))
      // Sentences say other plugins' ids by name (a Tyche NPC's)
      setRefNames(catalogAnswer.refLabels)
      // Before any quest is read: a reward type with a party argument of its own keeps party as that argument
      setOwnPartyTypes(catalogAnswer.ok ? ownPartyTypes(catalogAnswer.catalog) : undefined)
      if (workspace) {
        const { quests } = await fetchQuests(workspace.body.quests.map((b) => b.id))
        const { ws, missing } = loadWorkspace(workspace, quests)
        state.ws = ws
        for (const q of quests) state.known[q.id] = true
        if (missing.length > 0) notify(`Not in the database any more, left out: ${missing.join(', ')}`, 'error')
      } else {
        state.ws = emptyWorkspace(name)
      }
      history.clear()
      const draft = loadDraft(name)
      if (draft && JSON.stringify(draft.ws) !== JSON.stringify(state.ws)) state.draft = draft
      state.version++
    } catch (e) {
      state.loadError = e instanceof Error ? e.message : String(e)
    } finally {
      state.loading = false
    }
  }

  function restoreDraft() {
    if (!state.draft) return
    const draft = state.draft
    edit(() => {
      state.ws = draft.ws
    })
    state.draft = null
    state.version++
  }

  function discardDraft() {
    state.draft = null
    dropDraft(name)
  }

  /** {@return a free spot right of every box} */
  function freeSpot(): { x: number; y: number } {
    let x = 0
    for (const id of state.ws.order) {
      x = Math.max(x, state.ws.boxes[id]!.x + drawnSize(state.ws, id).width + 120)
    }
    return { x, y: 0 }
  }

  /** Adds a quest by id: the one in D1, or a new one. */
  async function addQuest(raw: string, at?: { x: number; y: number }): Promise<boolean> {
    const id = typedId(raw)
    if (!QUEST_ID.test(id)) {
      notify('A quest id uses a-z, 0-9 and _ (at most 64).', 'error')
      return false
    }
    if (state.ws.quests[id]) {
      state.selection = { kind: 'box', quest: id }
      return true
    }
    try {
      const { quests } = await fetchQuests([id])
      const doc = quests[0]
      const spot = at ?? freeSpot()
      if (doc) {
        state.known[id] = true
        edit((ws) => putQuest(ws, loadedQuest(doc), { ...spot, open: true }))
        notify(`Opened ${id}.`, 'success')
      } else if (RESERVED_IDS.includes(id)) {
        notify(`'${id}' is not a valid id for a new quest (the in-game editor keeps new and cancel).`, 'error')
        return false
      } else {
        // Like the in-game editor: the first pool by id
        const pool = (catalog.value?.pools ?? []).map((p) => p.id).sort()[0] ?? null
        edit((ws) => putQuest(ws, newQuest(id, pool), { ...spot, open: true }))
        notify(`${id} is new: it is saved to the database with the workspace.`, 'info')
      }
      state.selection = { kind: 'box', quest: id }
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      return false
    }
  }

  /** Adds the quests a quest names (start_quest, quest_completed) that are in D1. */
  async function loadLinked(quest: string) {
    const ids = linkedIds(state.ws, quest)
    if (ids.length === 0) {
      notify('Every quest it names is on the workspace already.')
      return
    }
    try {
      const { quests, missing } = await fetchQuests(ids)
      const box = state.ws.boxes[quest]
      edit((ws) => {
        quests.forEach((doc, i) => {
          state.known[doc.id] = true
          putQuest(ws, loadedQuest(doc), { x: (box?.x ?? 0) + 900, y: (box?.y ?? 0) + i * 160, open: false })
        })
      })
      for (const id of missing) state.known[id] = false
      notify(`Added ${quests.map((q) => q.id).join(', ') || 'nothing'}${missing.length ? `; not in the database: ${missing.join(', ')}` : ''}.`,
        missing.length ? 'info' : 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  /** Checks whether a quest exists in D1 (for a quest field), once. */
  async function checkQuest(id: string) {
    if (!QUEST_ID.test(id) || id in state.known || state.ws.quests[id]) return
    try {
      state.known[id] = (await fetchSummary(id)).exists
    } catch {
      // Unknown: no warning
    }
  }

  // =========================================================================
  // EDITS
  // =========================================================================

  function model(quest: string) {
    return state.ws.quests[quest]?.model
  }

  /** Freezes the auto-layout's positions of a quest the first time one of its parts is moved by hand. */
  function freeze(quest: string) {
    const q = state.ws.quests[quest]
    if (!q) return
    q.positions = { ...partPositions(q.model, q.positions) }
  }

  function movePart(quest: string, key: string, x: number, y: number) {
    edit((ws) => {
      freeze(quest)
      ws.quests[quest]!.positions[key] = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) }
    })
  }

  function moveBox(quest: string, x: number, y: number) {
    edit((ws) => {
      const box = ws.boxes[quest]
      if (box) Object.assign(box, { x: Math.round(x), y: Math.round(y) })
    })
  }

  /**
   * Resizes an open box from any edge or corner. Dragged by its left or top edge, it moves and its parts stay where
   * they are on the workspace; no edge goes past a part. At (or below) the size its parts need, it goes back to
   * fitting them.
   */
  function resizeBox(quest: string, next: { x: number; y: number; width: number; height: number }) {
    edit((ws) => {
      const box = ws.boxes[quest]
      const q = ws.quests[quest]
      if (!box || !q) return 'no such quest'
      const positions = partPositions(q.model, q.positions)
      const resized = resizedBox(box, positions, q.model, next)
      // Parts placed by the auto-layout keep their place once the box moved under them
      if (resized.positions !== positions) q.positions = { ...resized.positions }
      ws.boxes[quest] = resized.box
      return null
    })
  }

  function toggleBox(quest: string, open?: boolean) {
    edit((ws) => {
      const box = ws.boxes[quest]
      if (box) box.open = open ?? !box.open
    })
  }

  function setAllOpen(open: boolean) {
    edit((ws) => {
      for (const id of ws.order) ws.boxes[id]!.open = open
    })
  }

  function connect(c: Connection) {
    const verdict = interpret(state.ws, c, types())
    if (!verdict.ok) {
      notify(verdict.why, 'error')
      return
    }
    const a = verdict.action
    edit((ws) => {
      switch (a.kind) {
        case 'link':
          return link(ws, a.link, a.from, a.to)
        case 'attach':
          return attach(ws.quests[a.quest]!.model, a.nid, a.parent, undefined, types())
        case 'chain':
          return moveStageAfter(ws.quests[a.quest]!.model, a.stage, a.after) ? null : 'that stage cannot move there'
        case 'chain-end': {
          const m = ws.quests[a.quest]!.model
          moveStageAfter(m, a.stage, m.chain.filter((n) => n !== a.stage).at(-1) ?? null)
          return null
        }
      }
    })
  }

  /**
   * A line's end dragged somewhere else: the line now means the new connection (it moves, it is not added).
   * A chain line's arrow moved from stage B to C: B has no line in any more, so it leaves the chain, and C follows;
   * moved onto Finish, the stage it leaves from becomes the last one (the stages after it leave the chain).
   */
  function reconnect(line: LineRef, c: Connection, oldTarget?: string) {
    if (line.kind === 'chain' && oldTarget && oldTarget !== c.target) {
      const verdict = interpret(state.ws, c, types())
      if (!verdict.ok) {
        notify(verdict.why, 'error')
        return
      }
      const old = oldTarget.split('|')[2]
      edit((ws) => {
        const m = ws.quests[line.quest]!.model
        const a = verdict.action
        if (a.kind === 'chain-end') {
          // A line from the stage to Finish: the stage is the last one
          const at = m.chain.indexOf(a.stage)
          if (at >= 0) m.chain = m.chain.slice(0, at + 1)
          else moveStageAfter(m, a.stage, m.chain.at(-1) ?? null)
          return null
        }
        if (a.kind !== 'chain') return 'a stage line goes from a stage to the next stage or to Finish'
        if (old && m.stages[old] && old !== a.stage) unchainStage(m, old)
        return moveStageAfter(m, a.stage, a.after && m.chain.includes(a.after) ? a.after : a.after === null ? null : m.chain.at(-1) ?? null)
          ? null : 'that stage cannot move there'
      })
      return
    }
    if (line.kind !== 'link') {
      connect(c)
      return
    }
    edit((ws) => {
      const old = links(ws).find((l) => l.holder === line.holder && l.nid === line.nid)
      if (old) unlink(ws, old)
      const verdict = interpret(ws, c, types())
      if (!verdict.ok) return verdict.why
      if (verdict.action.kind !== 'link') return 'a line between quests goes from one quest to another'
      return link(ws, verdict.action.link, verdict.action.from, verdict.action.to)
    })
  }

  /** A line's end dropped on nothing: it lets go (a stage leaves the chain, an entry is loose, a link is gone). */
  function disconnect(line: LineRef) {
    if (line.kind === 'link') {
      const old = links(state.ws).find((l) => l.holder === line.holder && l.nid === line.nid)
      if (old) edit((ws) => unlink(ws, old))
    } else if (line.kind === 'entry') {
      edit((ws) => detach(ws.quests[line.quest]!.model, line.nid))
      notify('Not connected: it is left out of the quest until you connect it again.')
    } else if (line.stage) {
      const stage = line.stage
      edit((ws) => unchainStage(ws.quests[line.quest]!.model, stage))
      notify('The stage is off the chain: its objectives are left out until you connect it again.')
    }
  }

  /** Adds an entry of a type to a quest, put where it belongs (objectives in the selected or last stage). */
  function addPart(quest: string, category: Category, type: string, at?: { x: number; y: number }, into?: Parent): Nid | null {
    const m = model(quest)
    if (!m) return null
    let nid: Nid | null = null
    edit((ws) => {
      const target = ws.quests[quest]!.model
      const sel = state.selection
      let parent: Parent | undefined = into
      if (!parent) {
        // A requirement goes where the selection says: the fail rules, a group, or the requirements
        if (category === 'requirement') parent = requirementTarget(target, sel?.kind === 'part' && sel.quest === quest ? sel.key : null)
        else if (category === 'reward') parent = { kind: 'rewards' }
        else {
          const selectedStage = sel?.kind === 'part' && sel.quest === quest && target.stages[sel.key] ? sel.key : undefined
          const stage = selectedStage ?? target.chain.at(-1) ?? addStage(target)
          parent = { kind: 'stage', stage }
        }
      }
      nid = addEntry(target, category as EntryCategory, type)
      // Not where it cannot go (a type that reads a spot in fail.unless): refused, nothing added
      const why = attach(target, nid, parent, undefined, types())
      if (why) {
        nid = null
        return why
      }
      if (at) {
        freeze(quest)
        ws.quests[quest]!.positions[nid] = at
      }
    })
    if (nid) state.selection = { kind: 'part', quest, key: nid }
    return nid
  }

  /** Moves the canvas to a part and makes it pulse (its box opens first). */
  function focusPart(quest: string, key: string) {
    state.selection = { kind: 'part', quest, key }
    state.focus = { quest, key, n: (state.focus?.n ?? 0) + 1 }
  }

  function addStageTo(quest: string, after?: Nid) {
    let nid: Nid | null = null
    edit((ws) => {
      const box = ws.boxes[quest]
      if (box) box.open = true
      nid = addStage(ws.quests[quest]!.model, after)
    })
    if (nid) focusPart(quest, nid)
  }

  function addFail(quest: string) {
    edit((ws) => {
      const box = ws.boxes[quest]
      if (box) box.open = true
      showFail(ws.quests[quest]!.model)
    })
    focusPart(quest, 'fail')
  }

  /** Adds an empty group of requirements to a quest's requirements (the Start) or its fail.unless (the fail rules). */
  function addGroupTo(quest: string, kind: 'requirements' | 'unless' | { group: Nid } | { reward: Nid }) {
    let nid: Nid | null = null
    edit((ws) => {
      const box = ws.boxes[quest]
      if (box) box.open = true
      // In a group: below the last level only (refused there, nothing added); in a reward's requirements
      const parent: Parent = typeof kind !== 'object' ? { kind } : 'group' in kind ? { kind: 'group', group: kind.group }
        : { kind: 'reward-requirements', reward: kind.reward }
      const m = ws.quests[quest]!.model
      nid = addGroup(m, parent)
      const why = refusal(m, nid, parent)
      if (why && parentOf(m, nid) === null) {
        nid = null
        return why
      }
      return null
    })
    // A reward's requirements are not on the canvas: select it only
    if (nid && inRewardRequirements(model(quest)!, nid)) state.selection = { kind: 'part', quest, key: nid }
    else if (nid) focusPart(quest, nid)
  }

  /** Adds a requirement of a type to a reward's requirements (it is then given only when they hold). */
  function addRewardRequirement(quest: string, reward: Nid, type: string) {
    let nid: Nid | null = null
    edit((ws) => {
      const m = ws.quests[quest]!.model
      nid = addEntry(m, 'requirement', type)
      const why = attach(m, nid, { kind: 'reward-requirements', reward }, undefined, types())
      if (why) {
        nid = null
        return why
      }
      return null
    })
    if (nid) state.selection = { kind: 'part', quest, key: nid }
  }

  /** Puts a requirement into a group, at a place in it (the end without one). */
  function groupInto(quest: string, nid: Nid, group: Nid, index?: number) {
    edit((ws) => attach(ws.quests[quest]!.model, nid, { kind: 'group', group }, index, types()))
  }

  /** Takes a requirement out of its group into the list the group sits in; dropped at a spot, it stays there. */
  function ungroup(quest: string, nid: Nid, at?: { x: number; y: number }) {
    edit((ws) => {
      const why = leaveGroup(ws.quests[quest]!.model, nid)
      if (why) return why
      if (at) {
        freeze(quest)
        ws.quests[quest]!.positions[nid] = { x: Math.max(0, Math.round(at.x)), y: Math.max(0, Math.round(at.y)) }
      } else {
        // Where the auto-layout puts it, not where it sat inside the group
        delete ws.quests[quest]!.positions[nid]
      }
      return null
    })
  }

  /** Makes a group all (and) or any (or). */
  function setGroupJoin(quest: string, nid: Nid, mode: GroupMode) {
    edit((ws) => setGroupMode(ws.quests[quest]!.model, nid, mode))
  }

  /** Sets a requirement or group to Must (met) or Must not (not: true). */
  function setNot(quest: string, nid: Nid, not: boolean) {
    edit((ws) => setReversed(ws.quests[quest]!.model, nid, not))
  }

  function addCallbacks(quest: string) {
    edit((ws) => {
      const box = ws.boxes[quest]
      if (box) box.open = true
      showCallbacks(ws.quests[quest]!.model)
    })
    focusPart(quest, 'callbacks')
  }

  /**
   * Deletes a quest from the database (chronos.cloudflare.delete): gone from the website now, from the game at its
   * next /chronos cl download. A quest never saved only leaves the canvas. The workspace is saved without it.
   * {@return true when it was deleted}
   */
  async function deleteQuest(quest: string): Promise<boolean> {
    const q = state.ws.quests[quest]
    if (!q) return false
    if (q.base) {
      try {
        await deleteCall(quest, state.ws.name)
      } catch (e) {
        notify(`Could not delete ${quest}: ${(e as Error).message}`, 'error')
        return false
      }
    }
    const sel = state.selection
    if (sel && (('quest' in sel && sel.quest === quest) || (sel.kind === 'link' && sel.holder === quest))) state.selection = null
    edit((ws) => removeQuest(ws, quest))
    state.known[quest] = false
    notify(q.base ? `Deleted ${quest}. The game deletes it too at its next /chronos cl download.` : `${quest} was never saved; it is off the canvas.`, 'success')
    if (q.base) void save()
    return true
  }

  /** Deletes what is selected: a part, a line, or a quest from the workspace (never from the database). */
  function deleteSelection() {
    const sel = state.selection
    if (!sel) return
    if (sel.kind === 'link') {
      const line = links(state.ws).find((l) => l.holder === sel.holder && l.nid === sel.nid)
      if (line) edit((ws) => unlink(ws, line))
    } else if (sel.kind === 'chain') {
      edit((ws) => unchainStage(ws.quests[sel.quest]!.model, sel.stage))
      state.selection = { kind: 'part', quest: sel.quest, key: sel.stage }
      notify('The stage is off the chain: its objectives are left out until you connect it again.')
      return
    } else if (sel.kind === 'box') {
      edit((ws) => removeQuest(ws, sel.quest))
    } else if (sel.kind === 'part') {
      const m = model(sel.quest)
      if (!m) return
      if (sel.key === 'start' || sel.key === 'finish') {
        notify('The start and the finish are part of every quest.', 'error')
        return
      }
      edit((ws) => {
        const target = ws.quests[sel.quest]!.model
        if (sel.key === 'fail') removeFail(target)
        else if (sel.key === 'callbacks') removeCallbacks(target)
        else if (target.stages[sel.key]) {
          if (target.chain.length === 1 && target.chain[0] === sel.key) return 'a quest needs at least one stage'
          removeStage(target, sel.key)
        } else removeEntry(target, sel.key)
        return null
      })
    } else {
      return
    }
    state.selection = null
  }

  function detachEntry(quest: string, nid: Nid) {
    edit((ws) => detach(ws.quests[quest]!.model, nid))
  }

  function moveEntry(quest: string, nid: Nid, parent: Parent) {
    edit((ws) => attach(ws.quests[quest]!.model, nid, parent, undefined, types()))
  }

  function shiftEntry(quest: string, nid: Nid, by: -1 | 1) {
    edit((ws) => (shift(ws.quests[quest]!.model, nid, by) ? null : 'it is already at that end'))
  }

  function renumber(quest: string) {
    edit((ws) => renumberStages(ws.quests[quest]!.model))
  }

  /** Lays out one quest's parts again (forgetting where they were moved). */
  function relayout(quest: string) {
    edit((ws) => {
      const q = ws.quests[quest]!
      q.positions = autoLayout(q.model)
    })
  }

  /** Lays out the quest boxes along their lines. */
  function relayoutBoxes() {
    edit((ws) => {
      const sizes: Record<string, { width: number; height: number }> = {}
      for (const id of ws.order) sizes[id] = drawnSize(ws, id)
      const boxes = layoutBoxes(ws, sizes)
      for (const id of ws.order) Object.assign(ws.boxes[id]!, boxes[id])
    })
    state.version++
  }

  // =========================================================================
  // SAVING
  // =========================================================================

  async function save(overwrite = false) {
    if (state.saving) return
    if (checked.value.errors > 0) {
      notify('Fix the errors first: the game would refuse those quests.', 'error')
      return
    }
    const request = saveRequest(state.ws)
    if (overwrite && state.conflict) {
      // Keep mine: save over the newer copies
      for (const q of request.quests) {
        const theirs = state.conflict.quests.find((c) => c.id === q.id)
        if (theirs && !('missing' in theirs)) q.baseUpdatedAt = theirs.updatedAt
        if (theirs && 'missing' in theirs) q.baseUpdatedAt = null
      }
      if (request.workspace) request.workspace.baseUpdatedAt = state.conflict.workspace?.updatedAt ?? null
    }
    state.saving = true
    state.serverProblems = null
    try {
      const answer = await saveCall(request)
      if (answer.ok) {
        const ids = request.quests.filter((q) => answer.quests.some((d) => d.id === q.id)).map((q) => q.id)
        const changed = dirty.value.filter((id) => ids.includes(id))
        applySaved(state.ws, answer.quests, answer.workspace)
        // Saved parts get their saved ids: a selected new part is found again through its quest
        if (state.selection && !selectionExists(state.selection)) {
          state.selection = 'quest' in state.selection && state.ws.quests[state.selection.quest] ? { kind: 'box', quest: state.selection.quest } : null
        }
        for (const q of answer.quests) state.known[q.id] = true
        state.conflict = null
        state.saved = changed
        state.draft = null
        dropDraft(name)
        notify(changed.length > 0 ? `Saved ${changed.join(', ')} to the database.` : 'Saved the workspace.', 'success')
        state.version++
      } else if ('conflicts' in answer) {
        state.conflict = answer.conflicts
        notify('Someone saved these quests after you opened them.', 'error')
      } else {
        state.serverProblems = answer.problems
        notify(answer.error, 'error')
      }
    } catch (e) {
      notify(e instanceof ApiError || e instanceof Error ? e.message : String(e), 'error')
    } finally {
      state.saving = false
    }
  }

  /** Takes the newer copies of a conflict (dropping my changes to those quests). */
  function takeTheirs() {
    const conflict = state.conflict
    if (!conflict) return
    edit((ws) => {
      for (const theirs of conflict.quests) {
        if ('missing' in theirs) {
          const q = ws.quests[theirs.id]
          if (q) q.base = null
        } else {
          putQuest(ws, loadedQuest(theirs))
        }
      }
      if (conflict.workspace) ws.base = conflict.workspace
    })
    state.conflict = null
  }

  return {
    state, catalog, checked, dirty, unsaved, history,
    load, restoreDraft, discardDraft, addQuest, loadLinked, checkQuest,
    edit, undo, redo, notify, movePart, moveBox, resizeBox, toggleBox, setAllOpen, connect, reconnect, disconnect, addPart, addStageTo, addFail, addCallbacks, deleteSelection, deleteQuest,
    addGroupTo, addRewardRequirement, groupInto, ungroup, setNot, setGroupJoin,
    detachEntry, moveEntry, shiftEntry, renumber, relayout, relayoutBoxes, save, takeTheirs,
    isDirty: (quest: string) => (state.ws.quests[quest] ? isDirty(state.ws.quests[quest]!) : false),
    parentOf: (quest: string, nid: Nid) => (model(quest) ? parentOf(model(quest)!, nid) : null),
    lineOf: (holder: string, nid: Nid): Link | undefined => links(state.ws).find((l) => l.holder === holder && l.nid === nid),
  }
}
