/**
 * One quest as the canvas edits it. A quest is a chain of stages (objectives in a stage run together), requirements to
 * start it, rewards on completion and optional fail rules. Every part is an entry with a node id (nid); the arrays
 * say where each entry sits and in what order. An entry or stage that sits nowhere is loose: shown on the canvas, kept
 * in the layout, never written into the quest.
 *
 * treeToModel and modelToTree are exact inverses for any canonical quest (test/model.test.ts checks the seed quests),
 * so opening and saving a quest without touching it never changes it.
 */
import type { QuestLayout, Tree } from '../../shared/creator'
import {
  type ArgMap, CALLBACK_EVENTS, type CallbackEvent, canonicalQuest, DEFAULT_ICON, type Entry, failCounterId, type Filters, NO_FILTERS,
  type GroupMode, isGroup, type Objective, type Quest, type Requirement, type RequirementEntry, type Value, writeObjective, writeQuest,
} from '../../shared/quest/canonical'

export type Nid = string
export type EntryCategory = 'objective' | 'requirement' | 'reward'

export interface EntryModel {
  nid: Nid
  /** objective: a stage's objective or a fail.when entry; requirement: a requirement or a fail.unless entry. */
  category: EntryCategory
  type: string
  /** The type's arguments in their order; for requirements and rewards also display. */
  args: ArgMap
  /** Objective-likes only. */
  objectiveId?: string
  display?: string
  amount?: number
  filters?: Filters
  /** An objective's own rewards (entries), given once it is done. */
  rewards?: Nid[]
  /** An objective's callbacks (reward-type entries), run once it is done. */
  callbacks?: Nid[]
  /** Requirements (and groups) only: reversed, it is met when it is NOT. */
  not?: boolean
  /**
   * A group of requirements (category requirement, type all or any, see {@link groupMode}): the requirements in it, met
   * when all of them are (all) or at least one is (any).
   * Its display is in display.
   */
  members?: Nid[]
  /**
   * A reward's requirements (an optional reward: given only when they hold), as requirement and group entries. They are
   * not drawn on the canvas: the reward's line says them, the inspector edits them. Only an objective's and the quest's
   * rewards may have them.
   */
  requires?: Nid[]
  /** A party reward (rewards only): online party members within partyRange get it too. Only the quest's, a stage's and an objective's rewards. */
  party?: boolean
  /** Blocks a party member must be in (0 = anywhere online); absent = the default. */
  partyRange?: number
}

/** The type a new group of requirements has on the canvas (it is written as all: [...]). */
export const GROUP_TYPE: GroupMode = 'all'

/** {@return how a group joins its requirements: its type, all or any} */
export function groupMode(entry: EntryModel): GroupMode {
  return entry.type === 'any' ? 'any' : 'all'
}

/** {@return true for a group of requirements} */
export function isGroupEntry(entry: EntryModel | undefined): boolean {
  return Array.isArray(entry?.members)
}

export interface StageModel {
  nid: Nid
  /** The stage number it was loaded with; null for a new stage. */
  number: number | null
  objectives: Nid[]
  /** Given when the stage is done. */
  rewards: Nid[]
  /** Run when the stage is done, after its rewards. */
  callbacks: Nid[]
}

export interface QuestSettings {
  name: string
  description: string[]
  icon: string
  difficulty: string | null
  pool: string | null
  repeatable: boolean
  /** Seconds; 0 = none. */
  cooldown: number
  timeLimit: number
  autoStart: boolean
  noTeleport: boolean
  hiddenUntilUnlocked: boolean
}

export interface FailModel {
  /** The Fail node is on the canvas (it is written only with a when, unless or then entry). */
  shown: boolean
  when: Nid[]
  unless: Nid[]
  /** Rewards-like entries run when the quest fails (fail.actions). */
  actions: Nid[]
  result: 'drop' | 'cooldown'
  cooldown: number
  message: string
}

export interface QuestModel {
  id: string
  settings: QuestSettings
  messages: [string, string][]
  notices: [string, Tree][]
  entries: Record<Nid, EntryModel>
  /** The stages in order, Start → ... → Finish. */
  chain: Nid[]
  /** Every stage, including loose ones (not on the chain). */
  stages: Record<Nid, StageModel>
  /** The order of the objectives map (it is the menu's order). */
  objectiveOrder: Nid[]
  requirements: Nid[]
  rewards: Nid[]
  fail: FailModel
  /** Actions (reward types) run on the run's events; never listed. */
  callbacks: Record<CallbackEvent, Nid[]>
  /** The Callbacks node is on the canvas (it is written only with an entry). */
  callbacksShown: boolean
  /** Entries attached to nothing. */
  loose: Nid[]
}

/** Where an entry sits. */
export type Parent =
  | { kind: 'stage'; stage: Nid }
  | { kind: 'requirements' }
  | { kind: 'rewards' }
  | { kind: 'when' }
  | { kind: 'unless' }
  | { kind: 'actions' }
  | { kind: 'objective-rewards'; objective: Nid }
  | { kind: 'stage-rewards'; stage: Nid }
  | { kind: 'callback'; event: CallbackEvent }
  | { kind: 'objective-callbacks'; objective: Nid }
  | { kind: 'stage-callbacks'; stage: Nid }
  /** In a group of requirements. */
  | { kind: 'group'; group: Nid }
  /** In a reward's requirements (it is given only when they hold). */
  | { kind: 'reward-requirements'; reward: Nid }

/** {@return an empty callbacks record} */
export function emptyCallbacks(): Record<CallbackEvent, Nid[]> {
  return { start: [], complete: [], fail: [], abandon: [], expire: [] }
}

let counter = 0

/** {@return a node id for a new part, unique in this page} */
export function newNid(prefix = 'n'): Nid {
  counter += 1
  return `${prefix}:${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// =========================================================================
// TREE → MODEL
// =========================================================================

function objectiveEntry(nid: Nid, o: Objective): EntryModel {
  return { nid, category: 'objective', type: o.type, args: o.args.map(([k, v]) => [k, v]), objectiveId: o.id, display: o.display, amount: o.amount,
    filters: o.filters, rewards: [], callbacks: [] }
}

function plainEntry(nid: Nid, category: 'requirement' | 'reward', e: Entry): EntryModel {
  return { nid, category, type: e.type, args: e.args.map(([k, v]) => [k, v]), ...(e.party ? { party: true } : {}),
    ...(e.partyRange !== undefined ? { partyRange: e.partyRange } : {}) }
}

/** A reward, and its requirements at <nid>:if:i (entries of their own, like the quest's requirements). */
function rewardEntry(entries: Record<Nid, EntryModel>, nid: Nid, e: Entry): EntryModel {
  const reward = plainEntry(nid, 'reward', e)
  if (e.requirements && e.requirements.length > 0) reward.requires = requirementList(entries, `${nid}:if`, e.requirements)
  return reward
}

function requirementEntry(nid: Nid, r: Requirement): EntryModel {
  return { ...plainEntry(nid, 'requirement', r), ...(r.not ? { not: true } : {}) }
}

/** Puts a requirement list's entries in: an entry at prefix:i, a group's members at prefix:i:j, theirs at prefix:i:j:k. */
function requirementList(entries: Record<Nid, EntryModel>, prefix: string, items: RequirementEntry[]): Nid[] {
  return items.map((e, i) => {
    const nid = `${prefix}:${i}`
    if (!isGroup(e)) {
      entries[nid] = requirementEntry(nid, e)
      return nid
    }
    const members = requirementList(entries, nid, e.group)
    entries[nid] = { nid, category: 'requirement', type: e.mode, args: [], members, display: e.display, ...(e.not ? { not: true } : {}) }
    return nid
  })
}

/** {@return the model of a read quest} */
export function questToModel(quest: Quest): QuestModel {
  const entries: Record<Nid, EntryModel> = {}
  const stages: Record<Nid, StageModel> = {}
  const objectiveOrder: Nid[] = []
  for (const o of quest.objectives) {
    const nid = `obj:${o.id}`
    entries[nid] = objectiveEntry(nid, o)
    entries[nid]!.rewards = o.rewards.map((r, i) => {
      const rewardNid = `orw:${o.id}:${i}`
      entries[rewardNid] = rewardEntry(entries, rewardNid, r)
      return rewardNid
    })
    entries[nid]!.callbacks = o.callbacks.map((r, i) => {
      const callbackNid = `ocb:${o.id}:${i}`
      entries[callbackNid] = rewardEntry(entries, callbackNid, r)
      return callbackNid
    })
    objectiveOrder.push(nid)
    const stageNid = `stage:${o.stage}`
    ;(stages[stageNid] ??= { nid: stageNid, number: o.stage, objectives: [], rewards: [], callbacks: [] }).objectives.push(nid)
  }
  for (const [n, rewards] of quest.stageRewards) {
    const stageNid = `stage:${n}`
    const stage = (stages[stageNid] ??= { nid: stageNid, number: n, objectives: [], rewards: [], callbacks: [] })
    stage.rewards = rewards.map((r, i) => {
      const rewardNid = `srw:${n}:${i}`
      entries[rewardNid] = rewardEntry(entries, rewardNid, r)
      return rewardNid
    })
  }
  for (const [n, actions] of quest.stageCallbacks) {
    const stageNid = `stage:${n}`
    const stage = (stages[stageNid] ??= { nid: stageNid, number: n, objectives: [], rewards: [], callbacks: [] })
    stage.callbacks = actions.map((r, i) => {
      const callbackNid = `scb:${n}:${i}`
      entries[callbackNid] = rewardEntry(entries, callbackNid, r)
      return callbackNid
    })
  }
  const chain = Object.values(stages).sort((a, b) => a.number! - b.number!).map((s) => s.nid)
  if (chain.length === 0) {
    stages['stage:0'] = { nid: 'stage:0', number: 0, objectives: [], rewards: [], callbacks: [] }
    chain.push('stage:0')
  }
  const list = (prefix: string, category: 'requirement' | 'reward', items: Entry[]) => items.map((e, i) => {
    const nid = `${prefix}:${i}`
    entries[nid] = category === 'reward' ? rewardEntry(entries, nid, e) : plainEntry(nid, category, e)
    return nid
  })
  const requirements = requirementList(entries, 'req', quest.requirements)
  const rewards = list('rew', 'reward', quest.rewards)
  const unless = requirementList(entries, 'fu', quest.fail.unless)
  const actions = list('fa', 'reward', quest.fail.actions)
  const callbacks = emptyCallbacks()
  for (const event of CALLBACK_EVENTS) callbacks[event] = list(`cb:${event}`, 'reward', quest.callbacks[event])
  const when = quest.fail.when.map((o, i) => {
    const nid = `fw:${i}`
    entries[nid] = { ...objectiveEntry(nid, o), objectiveId: undefined }
    return nid
  })
  return {
    id: quest.id,
    settings: {
      name: quest.name,
      description: [...quest.description],
      icon: quest.icon,
      difficulty: quest.difficulty,
      pool: quest.pool,
      repeatable: quest.repeatable,
      cooldown: quest.cooldown,
      timeLimit: quest.timeLimit,
      autoStart: quest.autoStart,
      noTeleport: quest.noTeleport,
      hiddenUntilUnlocked: quest.hiddenUntilUnlocked,
    },
    messages: quest.messages.map(([k, v]) => [k, v]),
    notices: quest.notices.map(([k, v]) => [k, structuredClone(v)]),
    entries,
    chain,
    stages,
    objectiveOrder,
    requirements,
    rewards,
    fail: {
      shown: when.length > 0 || unless.length > 0 || actions.length > 0, when, unless, actions, result: quest.fail.result,
      cooldown: quest.fail.cooldown, message: quest.fail.message,
    },
    callbacks,
    callbacksShown: CALLBACK_EVENTS.some((event) => callbacks[event].length > 0),
    loose: [],
  }
}

/**
 * {@return the model of a stored quest tree, with its loose parts from the layout}
 * @throws Error when the tree does not read at all (a bad id)
 */
export function treeToModel(body: Tree, id: string, layout?: QuestLayout | null): QuestModel {
  const read = canonicalQuest(body, id)
  if (!read.quest) throw new Error(read.problems.map((p) => `${p.path}: ${p.message}`).join('; ') || `quest ${id} does not read`)
  const model = questToModel(read.quest)
  for (const raw of layout?.loose ?? []) restoreLoose(model, raw)
  return model
}

/** A new quest: named after its id, in the given pool, one empty stage. */
/** {@return the name a new quest gets, like the in-game editor's: hydra_hunt is "<white>hydra hunt"} */
export function newQuestName(id: string): string {
  return `<white>${id.replace(/_/g, ' ')}`
}

export function newQuestModel(id: string, pool: string | null): QuestModel {
  return questToModel({
    id, name: newQuestName(id), description: [], icon: DEFAULT_ICON, difficulty: null, pool, repeatable: false, cooldown: 0, timeLimit: 0, autoStart: false, noTeleport: false,
    hiddenUntilUnlocked: false, requirements: [], objectives: [], rewards: [], messages: [], stageRewards: [],
    callbacks: { start: [], complete: [], fail: [], abandon: [], expire: [] }, stageCallbacks: [],
    fail: { when: [], unless: [], result: 'drop', cooldown: 0, message: '', actions: [] }, notices: [],
  })
}

// =========================================================================
// MODEL → TREE
// =========================================================================

/** {@return the stages on the chain that hold objectives, with the number each is written with, and whether that renumbered any} */
export function stageNumbers(model: QuestModel): { numbers: Map<Nid, number>; renumbered: boolean } {
  const used = model.chain.filter((nid) => (model.stages[nid]?.objectives.length ?? 0) > 0)
  const numbers = new Map<Nid, number>()
  let previous = -1
  let keep = true
  for (const nid of used) {
    const stage = model.stages[nid]!
    const n = stage.number ?? previous + 1
    if (n <= previous) {
      keep = false
      break
    }
    numbers.set(nid, n)
    previous = n
  }
  if (keep) return { numbers, renumbered: false }
  numbers.clear()
  used.forEach((nid, i) => numbers.set(nid, i))
  return { numbers, renumbered: used.some((nid, i) => model.stages[nid]!.number !== null && model.stages[nid]!.number !== i) }
}

function toObjective(entry: EntryModel, id: string, stage: number, rewards: Entry[] = [], callbacks: Entry[] = []): Objective {
  return {
    id, type: entry.type, display: entry.display ?? '', amount: entry.amount ?? 1, stage, filters: entry.filters ?? NO_FILTERS,
    args: entry.args.map(([k, v]) => [k, v]), rewards, callbacks,
  }
}

/** {@return the number a stage is written with: its place on the chain, or the number it keeps while it has no objectives} */
function writtenNumber(model: QuestModel, numbers: Map<Nid, number>, stageNid: Nid): number | undefined {
  const n = numbers.get(stageNid)
  if (n !== undefined) return n
  const stage = model.stages[stageNid]
  return stage && model.chain.includes(stageNid) && stage.objectives.length === 0 && stage.number !== null ? stage.number : undefined
}

/**
 * {@return the order the objectives are written in: the places they had in the file, each stage's places filled in the
 * order that stage shows them (moving one up or down, or dropping one at a spot, changes what is written)}
 */
function writtenOrder(model: QuestModel, numbers: Map<Nid, number>): Nid[] {
  const order = model.objectiveOrder.filter((nid) => [...numbers.keys()].some((s) => model.stages[s]!.objectives.includes(nid)))
  for (const stageNid of numbers.keys()) for (const nid of model.stages[stageNid]!.objectives) if (!order.includes(nid)) order.push(nid)
  for (const stageNid of numbers.keys()) {
    const shown = model.stages[stageNid]!.objectives
    const places = order.map((nid, i) => (shown.includes(nid) ? i : -1)).filter((i) => i >= 0)
    places.forEach((place, k) => (order[place] = shown[k]!))
  }
  return order
}

/** {@return the read quest the model stands for (loose parts left out)} */
export function modelToQuest(model: QuestModel): Quest {
  const { numbers } = stageNumbers(model)
  const stageOf = new Map<Nid, number>()
  for (const [stageNid, n] of numbers) for (const nid of model.stages[stageNid]!.objectives) stageOf.set(nid, n)
  const entry = (nid: Nid): Entry => {
    const e = model.entries[nid]!
    const written: Entry = { type: e.type, args: e.args.map(([k, v]) => [k, v]) }
    // A reward's requirements (wherever it is: elsewhere than the rewards that take them they are an error, still kept)
    const requires = (e.requires ?? []).filter((r) => model.entries[r])
    if (e.category === 'reward' && requires.length > 0) written.requirements = requires.map(requirementEntry)
    if (e.category === 'reward' && e.party) written.party = true
    if (e.category === 'reward' && e.partyRange !== undefined) written.partyRange = e.partyRange
    return written
  }
  const requirement = (nid: Nid): Requirement => ({ ...entry(nid), not: model.entries[nid]!.not === true })
  const requirementEntry = (nid: Nid): RequirementEntry => {
    // A group's members are requirements and groups
    const e = model.entries[nid]!
    if (!e.members) return requirement(nid)
    return { mode: groupMode(e), group: e.members.filter((m) => model.entries[m]).map(requirementEntry), not: e.not === true, display: e.display ?? '' }
  }
  const objectives = writtenOrder(model, numbers).map((nid) => {
    const objective = model.entries[nid]!
    return toObjective(objective, objective.objectiveId ?? nid, stageOf.get(nid)!, (objective.rewards ?? []).filter((r) => model.entries[r]).map(entry),
      (objective.callbacks ?? []).filter((r) => model.entries[r]).map(entry))
  })
  const stageRewards: [number, Entry[]][] = []
  const stageCallbacks: [number, Entry[]][] = []
  for (const stageNid of model.chain) {
    const stage = model.stages[stageNid]!
    const n = writtenNumber(model, numbers, stageNid)
    if (n !== undefined && stage.rewards.length > 0) stageRewards.push([n, stage.rewards.map(entry)])
    if (n !== undefined && stage.callbacks.length > 0) stageCallbacks.push([n, stage.callbacks.map(entry)])
  }
  const callbacks = { start: [], complete: [], fail: [], abandon: [], expire: [] } as Record<CallbackEvent, Entry[]>
  for (const event of CALLBACK_EVENTS) callbacks[event] = model.callbacks[event].map(entry)
  const s = model.settings
  return {
    id: model.id,
    name: s.name === '' ? model.id : s.name,
    description: [...s.description],
    icon: s.icon.trim() === '' ? DEFAULT_ICON : s.icon.trim(),
    difficulty: s.difficulty === '' ? null : s.difficulty,
    pool: s.pool,
    repeatable: s.repeatable,
    cooldown: s.cooldown,
    timeLimit: s.timeLimit,
    autoStart: s.autoStart,
    noTeleport: s.noTeleport,
    hiddenUntilUnlocked: s.hiddenUntilUnlocked,
    requirements: model.requirements.map(requirementEntry),
    objectives,
    rewards: model.rewards.map(entry),
    messages: model.messages.map(([k, v]) => [k, v]),
    fail: {
      when: model.fail.when.map((nid, i) => toObjective(model.entries[nid]!, failCounterId(i), 0)),
      unless: model.fail.unless.map(requirementEntry),
      result: model.fail.result,
      cooldown: model.fail.cooldown,
      message: model.fail.message,
      actions: model.fail.actions.map(entry),
    },
    notices: model.notices.map(([k, v]) => [k, v]),
    stageRewards,
    callbacks,
    stageCallbacks,
  }
}

/** {@return the quest tree to save, in canonical form} */
export function modelToTree(model: QuestModel): Tree {
  // Through the canonical reader too, so the tree is exactly what the plugin stores
  const tree = writeQuest(modelToQuest(model))
  return canonicalQuest(tree, model.id).body ?? tree
}

// =========================================================================
// LAYOUT
// =========================================================================

/** {@return the nid a part gets when the saved quest is opened again (so its position is found)} */
export function savedNids(model: QuestModel): Map<Nid, Nid> {
  const map = new Map<Nid, Nid>()
  const { numbers } = stageNumbers(model)
  for (const [nid, n] of numbers) map.set(nid, `stage:${n}`)
  for (const [stageNid] of numbers) {
    for (const nid of model.stages[stageNid]!.objectives) map.set(nid, `obj:${model.entries[nid]!.objectiveId ?? nid}`)
  }
  const requirements = (prefix: string, list: Nid[]): void => list.filter((nid) => model.entries[nid]).forEach((nid, i) => {
    map.set(nid, `${prefix}:${i}`)
    // A group's members, and theirs
    requirements(`${prefix}:${i}`, model.entries[nid]?.members ?? [])
  })
  requirements('req', model.requirements)
  model.rewards.forEach((nid, i) => map.set(nid, `rew:${i}`))
  model.fail.when.forEach((nid, i) => map.set(nid, `fw:${i}`))
  requirements('fu', model.fail.unless)
  model.fail.actions.forEach((nid, i) => map.set(nid, `fa:${i}`))
  for (const event of CALLBACK_EVENTS) model.callbacks[event].forEach((nid, i) => map.set(nid, `cb:${event}:${i}`))
  for (const stageNid of model.chain) {
    const n = writtenNumber(model, numbers, stageNid)
    if (n === undefined) continue
    if (!map.has(stageNid)) map.set(stageNid, `stage:${n}`)
    model.stages[stageNid]!.rewards.forEach((nid, i) => map.set(nid, `srw:${n}:${i}`))
    model.stages[stageNid]!.callbacks.forEach((nid, i) => map.set(nid, `scb:${n}:${i}`))
  }
  for (const [stageNid] of numbers) {
    for (const nid of model.stages[stageNid]!.objectives) {
      const id = model.entries[nid]!.objectiveId ?? nid
      ;(model.entries[nid]!.rewards ?? []).forEach((r, i) => map.set(r, `orw:${id}:${i}`))
      ;(model.entries[nid]!.callbacks ?? []).forEach((r, i) => map.set(r, `ocb:${id}:${i}`))
    }
  }
  return map
}

interface LooseEntry {
  kind: 'entry'
  entry: EntryModel
  /** An objective's own rewards and callbacks, kept with it. */
  rewards?: EntryModel[]
}

interface LooseStage {
  kind: 'stage'
  stage: StageModel
  entries: EntryModel[]
  /** The stage's rewards and callbacks, and its objectives' own. */
  rewards?: EntryModel[]
}

/** {@return the parts that sit nowhere, as the layout keeps them} */
export function looseParts(model: QuestModel): (LooseEntry | LooseStage)[] {
  // An objective's rewards and callbacks; a group's members, and theirs
  // An objective's rewards and callbacks, a group's members, a reward's requirements; and theirs
  const ownNids = (nid: Nid): Nid[] => [...(model.entries[nid]?.rewards ?? []), ...(model.entries[nid]?.callbacks ?? []),
    ...(model.entries[nid]?.members ?? []), ...(model.entries[nid]?.requires ?? [])].flatMap((m) => [m, ...ownNids(m)])
  const own = (nid: Nid) => ownNids(nid).filter((r) => model.entries[r]).map((r) => structuredClone(model.entries[r]!))
  const parts: (LooseEntry | LooseStage)[] = model.loose.map((nid) => {
    const rewards = own(nid)
    return { kind: 'entry' as const, entry: structuredClone(model.entries[nid]!), ...(rewards.length ? { rewards } : {}) }
  })
  for (const stage of Object.values(model.stages)) {
    if (model.chain.includes(stage.nid)) continue
    const rewards = [...stage.rewards, ...stage.callbacks].flatMap((r) => [r, ...ownNids(r)]).filter((r) => model.entries[r])
      .map((r) => structuredClone(model.entries[r]!)).concat(stage.objectives.flatMap(own))
    parts.push({ kind: 'stage', stage: structuredClone(stage), entries: stage.objectives.map((nid) => structuredClone(model.entries[nid]!)),
      ...(rewards.length ? { rewards } : {}) })
  }
  return parts
}

function restoreLoose(model: QuestModel, raw: unknown) {
  if (raw === null || typeof raw !== 'object') return
  const part = raw as { kind?: string; entry?: EntryModel; stage?: StageModel; entries?: EntryModel[]; rewards?: EntryModel[] }
  // The rewards attached to these parts come back with them
  for (const reward of part.rewards ?? []) if (typeof reward?.nid === 'string' && !model.entries[reward.nid]) model.entries[reward.nid] = reward
  if (part.kind === 'entry' && part.entry && typeof part.entry.nid === 'string' && !model.entries[part.entry.nid]) {
    model.entries[part.entry.nid] = { ...part.entry, ...(part.entry.category === 'objective'
      ? { rewards: (part.entry.rewards ?? []).filter((r) => model.entries[r]), callbacks: (part.entry.callbacks ?? []).filter((r) => model.entries[r]) }
      : {}), ...(Array.isArray(part.entry.members) ? { members: part.entry.members.filter((r) => model.entries[r]) } : {}) }
    model.loose.push(part.entry.nid)
  } else if (part.kind === 'stage' && part.stage && typeof part.stage.nid === 'string' && !model.stages[part.stage.nid]) {
    const objectives: Nid[] = []
    for (const entry of part.entries ?? []) {
      if (model.entries[entry.nid]) continue
      model.entries[entry.nid] = { ...entry, rewards: (entry.rewards ?? []).filter((r) => model.entries[r]),
        callbacks: (entry.callbacks ?? []).filter((r) => model.entries[r]) }
      objectives.push(entry.nid)
      model.objectiveOrder.push(entry.nid)
    }
    model.stages[part.stage.nid] = { nid: part.stage.nid, number: null, objectives, rewards: (part.stage.rewards ?? []).filter((r) => model.entries[r]),
      callbacks: (part.stage.callbacks ?? []).filter((r) => model.entries[r]) }
  }
}

/** {@return an entry as its tree in the quest (for the sentences that describe it)} */
export function entryTree(entry: EntryModel, model?: QuestModel): Tree {
  if (entry.category === 'objective') return writeObjective(toObjective(entry, entry.objectiveId ?? 'objective', 0))
  const tree: Tree = { type: entry.type, ...Object.fromEntries(entry.args), ...(entry.category === 'requirement' && entry.not ? { not: true } : {}) }
  // With the model: a reward's requirements too (its line says when it is given)
  const requires = model ? (entry.requires ?? []).filter((r) => model.entries[r]) : []
  if (requires.length > 0) tree.requirements = requires.map((r) => requirementTree(model!, r))
  if (entry.category === 'reward' && entry.party) tree.party = true
  if (entry.category === 'reward' && entry.partyRange !== undefined) tree.party_range = entry.partyRange
  return tree
}

/** {@return a requirement or a group (with its requirements) as its tree in the quest} */
export function requirementTree(model: QuestModel, nid: Nid): Tree {
  const entry = model.entries[nid]
  if (!entry) return {}
  if (!entry.members) return entryTree(entry)
  return {
    [groupMode(entry)]: entry.members.filter((m) => model.entries[m]).map((m) => requirementTree(model, m)),
    ...(entry.not ? { not: true } : {}),
    ...(entry.display ? { display: entry.display } : {}),
  }
}

/** {@return the value of an argument, or undefined} */
export function argOf(entry: EntryModel, name: string): Value | undefined {
  return entry.args.find(([k]) => k === name)?.[1]
}

/** Sets an argument in place (keeping its position), or removes it with undefined. */
export function setArg(entry: EntryModel, name: string, value: Value | undefined) {
  const i = entry.args.findIndex(([k]) => k === name)
  if (value === undefined || (Array.isArray(value) && value.length === 0) || value === '') {
    if (i >= 0) entry.args.splice(i, 1)
  } else if (i >= 0) {
    entry.args[i] = [name, value]
  } else {
    entry.args.push([name, value])
  }
}
