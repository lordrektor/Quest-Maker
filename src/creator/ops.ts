/**
 * Edits of one quest model, the rules of the canvas: an entry sits in one place at a time, objectives go in stages or
 * fail.when, requirements before the start or in fail.unless, rewards at the finish. Every function changes the
 * model in place; the caller records history first.
 */
import { CALLBACK_EVENTS, ID, NO_FILTERS, type Value } from '../../shared/quest/canonical'
import { GROUP_DEPTH_MESSAGE, type GroupMode, MAX_GROUP_LEVEL, REWARD_REQUIREMENTS_PLACE } from '../../shared/quest/canonical'
import type { Catalog } from '../../shared/creator'
import { requirementsUse, type RequirementUse, useRefusal } from '../../shared/quest/uses'
import { emptyCallbacks, type EntryCategory, type EntryModel, GROUP_TYPE, isGroupEntry, newNid, type Nid, type Parent, type QuestModel } from './model'

export type ParentKind = Parent['kind']

/** {@return where an entry sits, or null when it is loose} */
export function parentOf(model: QuestModel, nid: Nid): Parent | null {
  if (model.requirements.includes(nid)) return { kind: 'requirements' }
  if (model.rewards.includes(nid)) return { kind: 'rewards' }
  if (model.fail.when.includes(nid)) return { kind: 'when' }
  if (model.fail.unless.includes(nid)) return { kind: 'unless' }
  if (model.fail.actions.includes(nid)) return { kind: 'actions' }
  for (const event of CALLBACK_EVENTS) if (model.callbacks[event].includes(nid)) return { kind: 'callback', event }
  for (const stage of Object.values(model.stages)) {
    if (stage.objectives.includes(nid)) return { kind: 'stage', stage: stage.nid }
    if (stage.rewards.includes(nid)) return { kind: 'stage-rewards', stage: stage.nid }
    if (stage.callbacks.includes(nid)) return { kind: 'stage-callbacks', stage: stage.nid }
  }
  for (const entry of Object.values(model.entries)) {
    if (entry.rewards?.includes(nid)) return { kind: 'objective-rewards', objective: entry.nid }
    if (entry.callbacks?.includes(nid)) return { kind: 'objective-callbacks', objective: entry.nid }
    if (entry.members?.includes(nid)) return { kind: 'group', group: entry.nid }
    if (entry.requires?.includes(nid)) return { kind: 'reward-requirements', reward: entry.nid }
  }
  return null
}

/** {@return the list an entry's place keeps it in} */
function listOf(model: QuestModel, parent: Parent): Nid[] {
  switch (parent.kind) {
    case 'stage':
      return model.stages[parent.stage]!.objectives
    case 'requirements':
      return model.requirements
    case 'rewards':
      return model.rewards
    case 'when':
      return model.fail.when
    case 'unless':
      return model.fail.unless
    case 'actions':
      return model.fail.actions
    case 'objective-rewards':
      return (model.entries[parent.objective]!.rewards ??= [])
    case 'stage-rewards':
      return model.stages[parent.stage]!.rewards
    case 'callback':
      return model.callbacks[parent.event]
    case 'objective-callbacks':
      return (model.entries[parent.objective]!.callbacks ??= [])
    case 'stage-callbacks':
      return model.stages[parent.stage]!.callbacks
    case 'group':
      return (model.entries[parent.group]!.members ??= [])
    case 'reward-requirements':
      return (model.entries[parent.reward]!.requires ??= [])
  }
}

/** The refusal of moving a reward that has requirements where rewards cannot have them (the in-game editor's). */
export const REWARD_REQUIREMENTS_MOVE = "Not moved: only an objective's and the quest's rewards have requirements; remove them first."

/** The refusal of moving a party reward where rewards cannot go to the party (the in-game editor's). */
export const REWARD_PARTY_MOVE = 'Not moved: only rewards of a quest, a stage or an objective can go to the party; turn party off first.'

/** {@return true for the places whose rewards may go to the party: the quest's rewards, a stage's, an objective's} */
export function takesParty(parent: Parent | null): boolean {
  return parent?.kind === 'rewards' || parent?.kind === 'stage-rewards' || parent?.kind === 'objective-rewards'
}

/** {@return true for the places whose rewards may have requirements: the quest's rewards, an objective's} */
export function takesRequirements(parent: Parent | null): boolean {
  return parent?.kind === 'rewards' || parent?.kind === 'objective-rewards'
}

/** {@return the list a requirement or group sits in at the top (through its groups): requirements, unless, a reward's; null when loose} */
export function requirementRoot(model: QuestModel, nid: Nid): Parent | null {
  const parent = parentOf(model, nid)
  return parent?.kind === 'group' ? requirementRoot(model, parent.group) ?? parent : parent
}

/** {@return true for a requirement or group in a reward's requirements (not drawn on the canvas)} */
export function inRewardRequirements(model: QuestModel, nid: Nid): boolean {
  return requirementRoot(model, nid)?.kind === 'reward-requirements'
}

/** Drops a reward's requirements (all of them, groups and all). */
export function clearRewardRequirements(model: QuestModel, reward: Nid) {
  const drop = (nid: Nid) => {
    for (const m of [...(model.entries[nid]?.members ?? []), ...(model.entries[nid]?.requires ?? [])]) drop(m)
    model.loose = model.loose.filter((n) => n !== nid)
    delete model.entries[nid]
  }
  for (const r of model.entries[reward]?.requires ?? []) drop(r)
  if (model.entries[reward]) delete model.entries[reward]!.requires
}

/** {@return the use of a place requirements sit in (what it can read): requirements, fail.unless, a reward's, a group's list; null elsewhere} */
export function useOf(model: QuestModel, parent: Parent | null): RequirementUse | null {
  if (parent?.kind === 'requirements') return requirementsUse(model.settings.autoStart)
  if (parent?.kind === 'unless') return 'fail_unless'
  if (parent?.kind === 'reward-requirements') return 'reward'
  if (parent?.kind === 'group') return useOf(model, parentOf(model, parent.group))
  return null
}

/**
 * {@return where a new requirement goes for what is selected: the fail rules or one of their requirements → fail.unless,
 * a group or one of its requirements → that group, anything else → the quest's requirements}
 */
export function requirementTarget(model: QuestModel, key: string | null): Parent {
  if (key === 'fail') return { kind: 'unless' }
  const entry = key ? model.entries[key] : undefined
  if (entry?.members) return { kind: 'group', group: entry.nid }
  const parent = key ? parentOf(model, key) : null
  if (entry?.category === 'requirement' && (parent?.kind === 'unless' || parent?.kind === 'group')) return parent
  return { kind: 'requirements' }
}

/** {@return why requirements cannot sit in a use (a type, or a filled spot argument, the use refuses), or null} */
function placeRefusal(model: QuestModel, nid: Nid, use: RequirementUse, catalog: Catalog): string | null {
  const entry = model.entries[nid]
  if (!entry) return null
  // A group: each of its requirements, at every level
  if (entry.members) {
    for (const m of entry.members) {
      const why = placeRefusal(model, m, use, catalog)
      if (why) return why
    }
    return null
  }
  return useRefusal(catalog, use, catalog.types?.requirement?.find((t) => t.id === entry.type), entry.args)
}

/** {@return the level of a group: 1 at the top (or loose), 2 inside a group, 3 inside one of those} */
export function groupLevel(model: QuestModel, nid: Nid): number {
  const parent = parentOf(model, nid)
  return parent?.kind === 'group' ? groupLevel(model, parent.group) + 1 : 1
}

/** {@return how many levels of groups an entry is: 0 for a requirement, 1 for a group of requirements, 2 for one holding a group...} */
export function entryDepth(model: QuestModel, nid: Nid): number {
  const members = model.entries[nid]?.members
  return members ? 1 + Math.max(0, ...members.map((m) => entryDepth(model, m))) : 0
}

/** {@return true when a group holds an entry, at any level} */
function holds(model: QuestModel, group: Nid, nid: Nid): boolean {
  return (model.entries[group]?.members ?? []).some((m) => m === nid || holds(model, m, nid))
}

/**
 * {@return why an entry cannot go there, or null when it can}
 *
 * @param catalog What the server knows: with it, a requirement whose type (or a filled spot argument) the place's use
 *                refuses cannot go there either.
 */
export function refusal(model: QuestModel, nid: Nid, parent: Parent, catalog?: Catalog): string | null {
  const entry = model.entries[nid]
  if (!entry) return 'no such part'
  const wants: Record<ParentKind, EntryCategory> = {
    stage: 'objective', when: 'objective', requirements: 'requirement', unless: 'requirement', rewards: 'reward', actions: 'reward',
    'objective-rewards': 'reward', 'stage-rewards': 'reward', callback: 'reward', 'objective-callbacks': 'reward', 'stage-callbacks': 'reward',
    group: 'requirement', 'reward-requirements': 'requirement',
  }
  if (wants[parent.kind] !== entry.category) {
    return { objective: 'an objective goes in a stage or the fail rules (when)', requirement: 'a requirement goes before the start, in the fail rules (unless) or in a group',
      reward: 'a reward goes at the finish, on a stage or an objective, in the fail rules (then) or in the callbacks' }[entry.category]
  }
  if (parent.kind === 'stage' && !model.stages[parent.stage]) return 'no such stage'
  if ((parent.kind === 'stage-rewards' || parent.kind === 'stage-callbacks') && !model.stages[parent.stage]) return 'no such stage'
  if (parent.kind === 'objective-callbacks') {
    const objective = model.entries[parent.objective]
    if (!objective || objective.category !== 'objective') return 'callbacks go on an objective'
    if (model.fail.when.includes(parent.objective)) return 'a fail condition has no callbacks'
  }
  if (parent.kind === 'objective-rewards') {
    const objective = model.entries[parent.objective]
    if (!objective || objective.category !== 'objective') return 'rewards go on an objective'
    if (model.fail.when.includes(parent.objective)) return 'a fail condition gives no rewards (use the fail rules\' then)'
  }
  if (parent.kind === 'group') {
    if (!isGroupEntry(model.entries[parent.group])) return 'no such group'
    if (parent.group === nid || holds(model, nid, parent.group)) return 'a group cannot go inside itself'
    if (groupLevel(model, parent.group) + entryDepth(model, nid) > MAX_GROUP_LEVEL) return GROUP_DEPTH_MESSAGE
  }
  // A reward's requirements belong to it: only an objective's and the quest's rewards take them, and they stay with it
  if (entry.category === 'reward' && (entry.requires ?? []).some((r) => model.entries[r]) && !takesRequirements(parent)) return REWARD_REQUIREMENTS_MOVE
  // A party reward only where rewards go to the party
  if (entry.category === 'reward' && entry.party && !takesParty(parent)) return REWARD_PARTY_MOVE
  if (parent.kind === 'reward-requirements') {
    const reward = model.entries[parent.reward]
    if (!reward || reward.category !== 'reward') return 'requirements go on a reward'
    if (!takesRequirements(parentOf(model, parent.reward))) return REWARD_REQUIREMENTS_PLACE
  }
  if (entry.category === 'requirement') {
    const from = requirementRoot(model, nid)
    const to = parent.kind === 'group' ? requirementRoot(model, parent.group) ?? { kind: 'group' as const, group: parent.group } : parent
    if (from && JSON.stringify(from) !== JSON.stringify(to) && (from.kind === 'reward-requirements' || to.kind === 'reward-requirements')) {
      return "a reward's requirements stay with that reward"
    }
  }
  if (parent.kind === 'when' && entry.type === 'custom') return 'custom cannot be a fail condition (a plugin fails the quest with ChronosAPI#failQuest)'
  const use = catalog && entry.category === 'requirement' ? useOf(model, parent) : null
  return use ? placeRefusal(model, nid, use, catalog!) : null
}

/** Takes an entry out of where it sits (it becomes loose). */
export function detach(model: QuestModel, nid: Nid) {
  const parent = parentOf(model, nid)
  if (parent) {
    const list = listOf(model, parent)
    list.splice(list.indexOf(nid), 1)
  }
  if (!model.loose.includes(nid)) model.loose.push(nid)
}

/**
 * Puts an entry somewhere (moving it from where it was), at the end or at an index.
 * {@return why it could not, or null}
 */
export function attach(model: QuestModel, nid: Nid, parent: Parent, index?: number, catalog?: Catalog): string | null {
  const why = refusal(model, nid, parent, catalog)
  if (why) return why
  const entry = model.entries[nid]!
  const from = parentOf(model, nid)
  if (from) {
    const list = listOf(model, from)
    list.splice(list.indexOf(nid), 1)
  }
  model.loose = model.loose.filter((n) => n !== nid)
  const list = listOf(model, parent)
  list.splice(index === undefined ? list.length : Math.max(0, Math.min(index, list.length)), 0, nid)
  if (parent.kind === 'stage') {
    // An objective needs an id in the objectives map, and a place in its order
    if (!entry.objectiveId) entry.objectiveId = uniqueObjectiveId(model, entry.type, nid)
    if (!model.objectiveOrder.includes(nid)) model.objectiveOrder.push(nid)
  }
  if (parent.kind === 'when' || parent.kind === 'unless' || parent.kind === 'actions') model.fail.shown = true
  if (parent.kind === 'callback') model.callbacksShown = true
  // A fail condition gives no rewards and has no callbacks: an objective's own come off with it
  if (parent.kind === 'when') {
    for (const r of [...(entry.rewards ?? []), ...(entry.callbacks ?? [])]) if (!model.loose.includes(r)) model.loose.push(r)
    entry.rewards = []
    entry.callbacks = []
  }
  return null
}

/** {@return an objective id for a type: kill_mob, kill_mob_2, ...} */
export function uniqueObjectiveId(model: QuestModel, type: string, self?: Nid): string {
  const taken = new Set(Object.values(model.entries).filter((e) => e.nid !== self && e.objectiveId).map((e) => e.objectiveId!))
  const base = type.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60) || 'objective'
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`
}

/** {@return why an objective cannot take this id, or null} */
export function objectiveIdRefusal(model: QuestModel, nid: Nid, id: string): string | null {
  if (!ID.test(id)) return 'a-z, 0-9 and _ only, at most 64'
  if (Object.values(model.entries).some((e) => e.nid !== nid && e.objectiveId === id)) return `another objective is called ${id}`
  return null
}

/**
 * Adds an entry of a type, attached when a place is given (loose otherwise).
 * {@return its nid}
 */
export function addEntry(model: QuestModel, category: EntryCategory, type: string, parent?: Parent, args: [string, Value][] = []): Nid {
  const nid = newNid()
  const entry: EntryModel = { nid, category, type, args: args.map(([k, v]) => [k, v]) }
  if (category === 'objective') {
    entry.display = ''
    entry.amount = 1
    entry.filters = NO_FILTERS
    entry.rewards = []
    entry.callbacks = []
  }
  model.entries[nid] = entry
  model.loose.push(nid)
  if (parent && attach(model, nid, parent) !== null) {
    // It stays loose where it cannot go
  }
  return nid
}

/** Removes an entry entirely. */
export function removeEntry(model: QuestModel, nid: Nid) {
  // A reward's requirements go with it
  clearRewardRequirements(model, nid)
  // An objective's own rewards and callbacks, a group's requirements, stay on the canvas, loose
  for (const r of [...(model.entries[nid]?.rewards ?? []), ...(model.entries[nid]?.callbacks ?? []), ...(model.entries[nid]?.members ?? [])]) {
    if (model.entries[r] && !model.loose.includes(r)) model.loose.push(r)
  }
  const parent = parentOf(model, nid)
  if (parent) {
    const list = listOf(model, parent)
    list.splice(list.indexOf(nid), 1)
  }
  model.loose = model.loose.filter((n) => n !== nid)
  model.objectiveOrder = model.objectiveOrder.filter((n) => n !== nid)
  delete model.entries[nid]
}

/** Moves an entry one place earlier or later among its siblings. {@return true when it moved} */
export function shift(model: QuestModel, nid: Nid, by: -1 | 1): boolean {
  const parent = parentOf(model, nid)
  if (!parent) return false
  const list = listOf(model, parent)
  const i = list.indexOf(nid)
  const j = i + by
  if (j < 0 || j >= list.length) return false
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  return true
}

// =========================================================================
// REQUIREMENT GROUPS
// =========================================================================

/** Adds an empty group of requirements (all of them must be met) to requirements or fail.unless. {@return its nid} */
export function addGroup(model: QuestModel, parent: Parent): Nid {
  const nid = newNid('grp')
  model.entries[nid] = { nid, category: 'requirement', type: GROUP_TYPE, args: [], members: [], display: '' }
  model.loose.push(nid)
  attach(model, nid, parent)
  return nid
}

/**
 * Takes a requirement out of its group, into the list the group sits in (loose when the group is).
 * {@return why it could not, or null}
 */
export function leaveGroup(model: QuestModel, nid: Nid): string | null {
  const from = parentOf(model, nid)
  if (from?.kind !== 'group') return 'it is not in a group'
  const outer = parentOf(model, from.group)
  if (!outer) {
    detach(model, nid)
    return null
  }
  const list = listOf(model, outer)
  return attach(model, nid, outer, list.indexOf(from.group) + 1)
}

/**
 * Takes a group apart: its requirements go where it sat, in its place (loose when it was); the group is gone. A
 * reversed group of one requirement hands its reversal to it, so it still means the same.
 * {@return why it cannot, or null}
 */
export function dissolveGroup(model: QuestModel, nid: Nid): string | null {
  const group = model.entries[nid]
  if (!group?.members) return 'it is not a group'
  const members = group.members.filter((m) => model.entries[m])
  if (group.not && members.length === 1) setReversed(model, members[0]!, !model.entries[members[0]!]!.not)
  const outer = parentOf(model, nid)
  if (outer) {
    const list = listOf(model, outer)
    list.splice(list.indexOf(nid), 1, ...members)
  } else {
    for (const m of members) if (!model.loose.includes(m)) model.loose.push(m)
  }
  group.members = []
  model.loose = model.loose.filter((n) => n !== nid)
  delete model.entries[nid]
  return null
}

/** Makes a group all (and: every requirement) or any (or: at least one). {@return why it cannot, or null} */
export function setGroupMode(model: QuestModel, nid: Nid, mode: GroupMode): string | null {
  const group = model.entries[nid]
  if (!group?.members) return 'it is not a group'
  group.type = mode
  return null
}

/** Reverses a requirement or a group (met when it is NOT), or turns that back. {@return why it cannot, or null} */
export function setReversed(model: QuestModel, nid: Nid, not: boolean): string | null {
  const entry = model.entries[nid]
  if (!entry || entry.category !== 'requirement') return 'only requirements and groups can be reversed'
  if (not) entry.not = true
  else delete entry.not
  return null
}

// =========================================================================
// STAGES
// =========================================================================

/** Adds an empty stage on the chain, after another one (or at the end). {@return its nid} */
export function addStage(model: QuestModel, after?: Nid): Nid {
  const nid = newNid('stage')
  model.stages[nid] = { nid, number: null, objectives: [], rewards: [], callbacks: [] }
  const at = after ? model.chain.indexOf(after) : -1
  model.chain.splice(at < 0 ? model.chain.length : at + 1, 0, nid)
  return nid
}

/** Puts a stage right after another one on the chain (or first, with null); a loose stage joins the chain. */
export function moveStageAfter(model: QuestModel, nid: Nid, after: Nid | null): boolean {
  if (!model.stages[nid] || nid === after) return false
  if (after !== null && !model.chain.includes(after)) return false
  model.chain = model.chain.filter((n) => n !== nid)
  const at = after === null ? 0 : model.chain.indexOf(after) + 1
  model.chain.splice(at, 0, nid)
  return true
}

/** Takes a stage off the chain (it stays on the canvas, loose, with its objectives). */
export function unchainStage(model: QuestModel, nid: Nid) {
  model.chain = model.chain.filter((n) => n !== nid)
}

/** Removes a stage; its objectives become loose. */
export function removeStage(model: QuestModel, nid: Nid) {
  const stage = model.stages[nid]
  if (!stage) return
  for (const part of [...stage.objectives, ...stage.rewards, ...stage.callbacks]) if (!model.loose.includes(part)) model.loose.push(part)
  model.chain = model.chain.filter((n) => n !== nid)
  delete model.stages[nid]
}

/** Numbers every stage of the chain 0, 1, 2... as they are written next (after a reorder players may skip or repeat stages). */
export function renumberStages(model: QuestModel) {
  let n = 0
  for (const nid of model.chain) {
    const stage = model.stages[nid]!
    if (stage.objectives.length === 0) continue
    stage.number = n++
  }
}

// =========================================================================
// FAIL RULES
// =========================================================================

export function showFail(model: QuestModel) {
  model.fail.shown = true
}

/** Removes the fail rules; their entries become loose. */
export function removeFail(model: QuestModel) {
  for (const nid of [...model.fail.when, ...model.fail.unless, ...model.fail.actions]) if (!model.loose.includes(nid)) model.loose.push(nid)
  model.fail = { shown: false, when: [], unless: [], actions: [], result: 'drop', cooldown: 0, message: '' }
}

// =========================================================================
// CALLBACKS
// =========================================================================

export function showCallbacks(model: QuestModel) {
  model.callbacksShown = true
}

/** Removes the Callbacks node; its entries become loose. */
export function removeCallbacks(model: QuestModel) {
  for (const event of CALLBACK_EVENTS) for (const nid of model.callbacks[event]) if (!model.loose.includes(nid)) model.loose.push(nid)
  model.callbacks = emptyCallbacks()
  model.callbacksShown = false
}

/** {@return the problems of the model's own shape: loose parts, empty stages, fail rules that never fail} */
export function shapeWarnings(model: QuestModel): { nid: Nid | null; message: string }[] {
  const warnings: { nid: Nid | null; message: string }[] = []
  for (const nid of model.loose) warnings.push({ nid, message: 'not connected: it is not part of the quest' })
  for (const stage of Object.values(model.stages)) {
    if (!model.chain.includes(stage.nid)) warnings.push({ nid: stage.nid, message: 'not on the stage chain: its objectives are not part of the quest' })
    else if (stage.objectives.length === 0) warnings.push({ nid: stage.nid, message: 'an empty stage is left out' })
  }
  if (model.fail.shown && model.fail.when.length === 0 && model.fail.unless.length === 0 && model.fail.actions.length === 0) {
    warnings.push({ nid: 'fail', message: 'no when, unless or then entries: the fail rules are left out' })
  }
  if (model.callbacksShown && CALLBACK_EVENTS.every((event) => model.callbacks[event].length === 0)) {
    warnings.push({ nid: 'callbacks', message: 'no actions: the callbacks are left out' })
  }
  return warnings
}

/**
 * Changes an entry's type like the in-game editor: the arguments the new type does not have are dropped (an
 * objective keeps its id, amount, display, filters and rewards; a requirement or reward keeps its display).
 *
 * @param params The new type's argument names.
 * @return Returns why it cannot, or null.
 */
export function retype(model: QuestModel, nid: Nid, type: string, params: string[]): string | null {
  const entry = model.entries[nid]
  if (!entry) return 'it is gone'
  if (entry.type === type) return null
  if (isGroupEntry(entry)) return 'a group has no type: it holds requirements'
  if (entry.category === 'objective' && type === 'custom' && model.fail.when.includes(nid)) {
    return 'custom cannot be a fail condition (a plugin fails the quest with ChronosAPI#failQuest)'
  }
  const keep = new Set([...params, ...(entry.category === 'objective' ? [] : ['display'])])
  entry.args = entry.args.filter(([k]) => keep.has(k))
  // Into a type with a party argument of its own: party and party_range become its arguments, as the plugin reads them
  if (entry.category === 'reward' && params.includes('party')) {
    if (entry.party) entry.args.push(['party', true])
    if (entry.partyRange !== undefined && params.includes('party_range')) entry.args.push(['party_range', entry.partyRange])
    delete entry.party
    delete entry.partyRange
  }
  entry.type = type
  return null
}

/** Drops every change a quest makes to one event's notice, so config.yml's applies (the in-game editor's reset). */
export function resetNotice(model: QuestModel, event: string) {
  model.notices = model.notices.filter(([e]) => e !== event)
}
