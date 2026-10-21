/**
 * A quest tree in the plugin's canonical form: a port of DefinitionCodec.readQuest + writeQuest and Args.normalize.
 * The web saves exactly what the plugin would store, so a download sees no change unless the quest really changed:
 * the same key order, defaults left out (stage 0, false flags, minecraft:paper), durations written like 1h30m, filters
 * in their long form, list values as text. Reading reports the codec's structural problems with its paths and
 * messages; whether types and items exist is validate.ts's job.
 */
import type { Catalog, Problem, Tree } from '../creator'
import { formatDuration, parseDuration } from './durations'

export const ID = /^[a-z0-9_]{1,64}$/
export const DEFAULT_ICON = 'minecraft:paper'
export const QUEST_KEYS = ['id', 'name', 'description', 'icon', 'difficulty', 'pool', 'repeatable', 'cooldown', 'time_limit', 'auto_start', 'no_teleport',
  'hidden_until_unlocked', 'requirements', 'objectives', 'stages', 'rewards', 'messages', 'fail', 'callbacks', 'notices']
export const OBJECTIVE_COMMON_KEYS = ['type', 'display', 'amount', 'stage', 'filters', 'rewards', 'callbacks']
const FAIL_KEYS = ['when', 'unless', 'result', 'cooldown', 'message', 'actions']
const FILTER_KEYS = ['worlds', 'hand', 'y']
export const NOTICE_EVENTS = ['start', 'complete', 'fail']

/** One argument value as the plugin keeps it (Args.normalize). */
export type Value = string | number | boolean | string[]
export type ArgMap = [string, Value][]

/** A read objective (also a fail.when entry). */
export interface Objective {
  id: string
  type: string
  display: string
  amount: number
  stage: number
  filters: Filters
  args: ArgMap
  /** Given once it is done (once per run). */
  rewards: Entry[]
  /** Actions run once it is done, after its rewards (never listed). */
  callbacks: Entry[]
}

/** The events of a run that have callbacks, in the order they are written. */
export const CALLBACK_EVENTS = ['start', 'complete', 'fail', 'abandon', 'expire'] as const
export type CallbackEvent = (typeof CALLBACK_EVENTS)[number]
/** A quest's callbacks: actions (reward types) run on a run's events, never listed. */
export type Callbacks = Record<CallbackEvent, Entry[]>

export function noCallbacks(): Callbacks {
  return { start: [], complete: [], fail: [], abandon: [], expire: [] }
}

export interface Filters {
  worldMode: 'whitelist' | 'blacklist' | null
  worlds: string[]
  hand: string[]
  minY: number | null
  maxY: number | null
}

/** A read requirement or reward: its type and arguments (display among them). */
export interface Entry {
  type: string
  args: ArgMap
  /**
   * A reward's requirements (an optional reward): it is given only when they hold, else skipped. Read on any reward so
   * they round-trip; only an objective's and the quest's rewards may have them (elsewhere an error). Absent when none.
   */
  requirements?: RequirementEntry[]
  /**
   * A party reward: online party members within {@link partyRange} blocks get it too (written only when true). Read on
   * any reward so it round-trips; only the quest's, a stage's and an objective's rewards may have it.
   */
  party?: boolean
  /** Blocks around the player a party member must be in (0 = anywhere online; absent = the default, 32). */
  partyRange?: number
}

/** The error of party on a reward where it does not work. */
export const REWARD_PARTY_PLACE = 'party only works on rewards of a quest, a stage or an objective'

/** The error of reward requirements where they do not work. */
export const REWARD_REQUIREMENTS_PLACE = "requirements only work on an objective's rewards and the quest's rewards"

/** A requirement: its type, arguments (display among them) and whether it is reversed (true when it is NOT met). */
export interface Requirement extends Entry {
  not: boolean
}

/** How a group joins its requirements: all (and) or any (or); it is also the group's key in the file. */
export type GroupMode = 'all' | 'any'
export const GROUP_MODES: GroupMode[] = ['all', 'any']

/**
 * A group of requirements: true when all of them are (all:) or at least one is (any:), each after its own not; then
 * reversed by its own not (a reversed any group is "none of").
 */
export interface RequirementGroup {
  mode: GroupMode
  /** Requirements and groups (a group at level {@link MAX_GROUP_LEVEL} holds requirements only). */
  group: RequirementEntry[]
  not: boolean
  /** Replaces its line in menus; '' = generated. */
  display: string
}

/** How deep groups nest: a top-level group is level 1, a group at this level holds requirements only. */
export const MAX_GROUP_LEVEL = 3
export const GROUP_DEPTH_MESSAGE = 'groups go 3 levels deep at most: put its requirements in the group above'

/** An entry of requirements or fail.unless: a requirement or a group (groups nest up to {@link MAX_GROUP_LEVEL} levels). */
export type RequirementEntry = Requirement | RequirementGroup

export const GROUP_KEYS = ['all', 'any', 'not', 'display']

/** {@return true for a group} */
export function isGroup(entry: RequirementEntry): entry is RequirementGroup {
  return 'group' in entry
}

/** {@return true for a mapping that is a group (it has all: or any:)} */
function isGroupTree(item: Tree): boolean {
  return 'all' in item || 'any' in item
}

export interface Fail {
  when: Objective[]
  /** The quest fails as soon as one entry is not met. */
  unless: RequirementEntry[]
  result: 'drop' | 'cooldown'
  cooldown: number
  message: string
  /** Run when the quest fails, like rewards (start_quest another quest, command, message...). */
  actions: Entry[]
}

export interface Quest {
  id: string
  name: string
  description: string[]
  icon: string
  difficulty: string | null
  pool: string | null
  repeatable: boolean
  cooldown: number
  timeLimit: number
  autoStart: boolean
  noTeleport: boolean
  hiddenUntilUnlocked: boolean
  /** The quest can start when every entry is met. */
  requirements: RequirementEntry[]
  objectives: Objective[]
  rewards: Entry[]
  messages: [string, string][]
  fail: Fail
  notices: [string, Tree][]
  /** What each stage gives when it is done, by stage number (only stages with rewards), ascending. */
  stageRewards: [number, Entry[]][]
  /** Actions run on the run's events. */
  callbacks: Callbacks
  /** Actions run when a stage is done, after its rewards, by stage number, ascending. */
  stageCallbacks: [number, Entry[]][]
}

export const NO_FILTERS: Filters = { worldMode: null, worlds: [], hand: [], minY: null, maxY: null }

/** Collects problems with their paths. */
export class Problems {
  readonly list: Problem[] = []

  error(path: string, message: string) {
    this.list.push({ path, message, error: true })
  }

  warn(path: string, message: string) {
    this.list.push({ path, message, error: false })
  }

  get hasErrors(): boolean {
    return this.list.some((p) => p.error)
  }
}

// =========================================================================
// VALUES
// =========================================================================

function isMap(value: unknown): value is Tree {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Java's String.valueOf of a normalized value. */
function text(value: unknown): string {
  return String(value)
}

/** {@return a value as the plugin's Args keep it: whole numbers stay numbers, list elements become text; null for nothing or a mapping} */
export function normalize(value: unknown): Value | null {
  if (value === null || value === undefined || isMap(value)) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'boolean' || typeof value === 'string') return value
  if (Array.isArray(value)) {
    const strings: string[] = []
    for (const element of value) {
      if (element === null || element === undefined) continue
      const n = normalize(element)
      // Like String.valueOf: a mapping inside a list becomes "null", a list "[a, b]"
      strings.push(n === null ? 'null' : Array.isArray(n) ? `[${n.join(', ')}]` : text(n))
    }
    return strings
  }
  return String(value)
}

function string(tree: Tree, key: string, path: string, p: Problems): string | null {
  const value = tree[key]
  if (value === null || value === undefined) return null
  if (isMap(value) || Array.isArray(value)) {
    p.error(path, 'must be a single value')
    return null
  }
  return text(normalize(value))
}

function stringList(tree: Tree, key: string, path: string, p: Problems): string[] {
  const value = tree[key]
  if (value === null || value === undefined) return []
  if (isMap(value)) {
    p.error(path, 'must be a list')
    return []
  }
  const normalized = normalize(value)
  return Array.isArray(normalized) ? normalized : [text(normalized)]
}

function flag(tree: Tree, key: string, fallback: boolean, p: Problems): boolean {
  const value = tree[key]
  if (value === null || value === undefined) return fallback
  if (typeof value === 'boolean') return value
  p.error(key, 'must be true or false')
  return fallback
}

function whole(tree: Tree, key: string, fallback: number, path: string, p: Problems): number {
  const value = tree[key]
  if (value === null || value === undefined) return fallback
  const n = normalize(value)
  if (typeof n === 'number' && Number.isInteger(n)) return n
  p.error(path, 'must be a whole number')
  return fallback
}

function duration(tree: Tree, key: string, path: string, p: Problems): number {
  const value = tree[key]
  if (value === null || value === undefined) return 0
  try {
    return parseDuration(text(normalize(value)))
  } catch (e) {
    p.error(path, (e as Error).message)
    return 0
  }
}

function unknownKeys(tree: Tree, known: string[], prefix: string, p: Problems) {
  for (const key of Object.keys(tree)) if (!known.includes(key)) p.warn(prefix + key, 'unknown key, ignored')
}

/** Builds arguments; nested mappings are not allowed. */
function args(raw: [string, unknown][], path: string, p: Problems): ArgMap {
  const clean: ArgMap = []
  for (const [key, value] of raw) {
    if (isMap(value)) p.error(`${path}.${key}`, 'must be a value or a list, not a mapping')
    else {
      const n = normalize(value)
      if (n !== null) clean.push([key, n])
    }
  }
  return clean
}

// =========================================================================
// READING
// =========================================================================

/**
 * Reads a quest stored as {@code id}.
 *
 * @return the quest, or null when it cannot be built at all (an error was recorded)
 */
export function readQuest(tree: Tree, id: string, p: Problems): Quest | null {
  if (!ID.test(id)) {
    p.error('id', `'${id}' is not a valid id (a-z, 0-9 and _, at most 64)`)
    return null
  }
  if (tree.id !== null && tree.id !== undefined && text(tree.id) !== id) {
    p.error('id', `the file says '${text(tree.id)}' but it is stored as '${id}'`)
    return null
  }
  unknownKeys(tree, QUEST_KEYS, '', p)

  const pool = string(tree, 'pool', 'pool', p)
  if (pool === null) p.error('pool', 'missing: every quest belongs to a pool')
  else if (!ID.test(pool)) p.error('pool', `'${pool}' is not a valid pool id`)

  const name = string(tree, 'name', 'name', p)
  const icon = string(tree, 'icon', 'icon', p)
  return {
    id,
    name: name ?? id,
    description: stringList(tree, 'description', 'description', p),
    icon: icon === null || icon.trim() === '' ? DEFAULT_ICON : icon,
    difficulty: string(tree, 'difficulty', 'difficulty', p),
    pool,
    repeatable: flag(tree, 'repeatable', false, p),
    cooldown: duration(tree, 'cooldown', 'cooldown', p),
    timeLimit: duration(tree, 'time_limit', 'time_limit', p),
    autoStart: flag(tree, 'auto_start', false, p),
    noTeleport: flag(tree, 'no_teleport', false, p),
    hiddenUntilUnlocked: flag(tree, 'hidden_until_unlocked', false, p),
    requirements: tree.requirements == null ? [] : requirementEntries(tree.requirements, 'requirements', p),
    objectives: objectives(tree, p),
    rewards: tree.rewards == null ? [] : typedEntries(tree.rewards, 'rewards', p, { requirements: true, party: true }),
    messages: stringMap(tree, 'messages', p),
    fail: fail(tree.fail, p),
    notices: notices(tree.notices, p),
    callbacks: callbacks(tree.callbacks, p),
    ...stagesOf(tree.stages, p),
  }
}

/** Reads {@code callbacks: {start: [...], complete: [...], ...}}: actions run on a run's events. */
function callbacks(raw: unknown, p: Problems): Callbacks {
  const result = noCallbacks()
  if (raw === null || raw === undefined) return result
  if (!isMap(raw)) {
    p.error('callbacks', 'must be a mapping of event (start, complete, fail, abandon, expire) to actions')
    return result
  }
  unknownKeys(raw, [...CALLBACK_EVENTS], 'callbacks.', p)
  for (const event of CALLBACK_EVENTS) {
    if (raw[event] !== null && raw[event] !== undefined) result[event] = typedEntries(raw[event], `callbacks.${event}`, p)
  }
  return result
}

/** Reads {@code stages: {1: {rewards: [...], callbacks: [...]}}}. */
function stagesOf(raw: unknown, p: Problems): { stageRewards: [number, Entry[]][]; stageCallbacks: [number, Entry[]][] } {
  const callbacksByStage: [number, Entry[]][] = []
  const stageRewards = stages(raw, p, callbacksByStage)
  return { stageRewards, stageCallbacks: callbacksByStage.sort(([a], [b]) => a - b) }
}

function stages(raw: unknown, p: Problems, callbacksByStage: [number, Entry[]][]): [number, Entry[]][] {
  if (raw === null || raw === undefined) return []
  if (!isMap(raw)) {
    p.error('stages', 'must be a mapping of stage number to its settings (rewards)')
    return []
  }
  const result: [number, Entry[]][] = []
  for (const [key, value] of Object.entries(raw)) {
    const path = `stages.${key}`
    const stage = /^\s*-?\d+\s*$/.test(key) ? Number(key.trim()) : NaN
    if (!Number.isInteger(stage)) {
      p.error(path, `'${key}' is not a stage number`)
      continue
    }
    if (stage < 0 || stage > 1000) {
      p.error(path, 'must be between 0 and 1000')
      continue
    }
    if (!isMap(value)) {
      p.error(path, 'must be a mapping (rewards)')
      continue
    }
    unknownKeys(value, ['rewards', 'callbacks'], `${path}.`, p)
    if (value.rewards !== null && value.rewards !== undefined) {
      const rewards = typedEntries(value.rewards, `${path}.rewards`, p, { party: true })
      if (rewards.length > 0) result.push([stage, rewards])
    }
    if (value.callbacks !== null && value.callbacks !== undefined) {
      const actions = typedEntries(value.callbacks, `${path}.callbacks`, p)
      if (actions.length > 0) callbacksByStage.push([stage, actions])
    }
  }
  return result.sort(([a], [b]) => a - b)
}

/**
 * Reads a list of rewards (or actions): each with a type, its arguments, and its requirements and party keys (not
 * arguments).
 *
 * @param may What its rewards may have: requirements (the quest's rewards, an objective's) and party (those and a
 *            stage's); elsewhere they are an error.
 */
function typedEntries(raw: unknown, path: string, p: Problems, may: { requirements?: boolean; party?: boolean } = {}): Entry[] {
  if (!Array.isArray(raw)) {
    p.error(path, 'must be a list of entries, each with a type')
    return []
  }
  const entries: Entry[] = []
  raw.forEach((item, i) => {
    const entryPath = `${path}[${i}]`
    if (!isMap(item)) {
      p.error(entryPath, 'must be a mapping with a type')
      return
    }
    const type = string(item, 'type', `${entryPath}.type`, p)
    if (type === null) {
      p.error(`${entryPath}.type`, 'missing')
      return
    }
    // A type with a party argument of its own keeps party and party_range as its arguments (Phantasos: the party watches too)
    const own = reading.has(type)
    const entry: Entry = { type, args: args(Object.entries(item).filter(([k]) => !(own ? ENTRY_KEYS : REWARD_KEYS).includes(k)), entryPath, p) }
    if (!own) readParty(item, entryPath, may.party === true, entry, p)
    if (item.requirements !== null && item.requirements !== undefined) {
      const requirementsPath = `${entryPath}.requirements`
      if (!may.requirements) p.error(requirementsPath, REWARD_REQUIREMENTS_PLACE)
      const requirements = requirementEntries(item.requirements, requirementsPath, p)
      if (requirements.length > 0) entry.requirements = requirements
    }
    entries.push(entry)
  })
  return entries
}

/** A reward's keys that are not arguments of its type. */
const REWARD_KEYS = ['type', 'requirements', 'party', 'party_range']
/** The same for a type with a party argument of its own: party and party_range are its arguments. */
const ENTRY_KEYS = ['type', 'requirements']

/** The reward types with a party argument of their own (see {@link ownPartyTypes}): the creator's, once it has the catalog. */
let ownParty: ReadonlySet<string> = new Set()
/** The ones of the read under way. */
let reading: ReadonlySet<string> = ownParty

/**
 * {@return the reward types that declare a party argument of their own}: on them party and party_range are that
 * argument, not a party reward (no party members get it, it works anywhere), as the plugin reads them.
 */
export function ownPartyTypes(catalog: Catalog | null | undefined): Set<string> {
  return new Set((catalog?.types?.reward ?? []).filter((t) => t.params.some((p) => p.name === 'party')).map((t) => t.id))
}

/** Sets the reward types with a party argument of their own that reads use unless told otherwise (the creator does, once it has the catalog). */
export function setOwnPartyTypes(types: Iterable<string> | undefined) {
  ownParty = new Set(types ?? [])
}

/** {@return true when a reward type keeps party as its own argument} */
export function hasOwnParty(type: string): boolean {
  return ownParty.has(type)
}

/** Reads a reward's party and party_range (kept wherever they are, so the editor can clear them). */
function readParty(item: Tree, path: string, allowed: boolean, entry: Entry, p: Problems) {
  const party = item.party
  if (party !== null && party !== undefined) {
    if (typeof party !== 'boolean') p.error(`${path}.party`, 'must be true or false')
    else if (party) {
      entry.party = true
      if (!allowed) p.error(`${path}.party`, REWARD_PARTY_PLACE)
    }
  }
  const range = item.party_range
  if (range === null || range === undefined) return
  const n = normalize(range)
  if (typeof n !== 'number') {
    p.error(`${path}.party_range`, 'must be a number')
    return
  }
  if (n < 0) p.error(`${path}.party_range`, 'must be 0 or more')
  entry.partyRange = n
  if (!entry.party) p.warn(`${path}.party_range`, 'party_range only counts with party: true')
}

/** Reads {@code not}: true or false, false when missing. */
function reversed(item: Tree, path: string, p: Problems): boolean {
  const value = item.not
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  p.error(`${path}.not`, 'must be true or false')
  return false
}

/** Reads one requirement (a mapping with a type, and not); null when it has none. */
function requirement(item: Tree, path: string, p: Problems): Requirement | null {
  const type = string(item, 'type', `${path}.type`, p)
  if (type === null) {
    p.error(`${path}.type`, 'missing')
    return null
  }
  return { type, args: args(Object.entries(item).filter(([k]) => k !== 'type' && k !== 'not'), path, p), not: reversed(item, path, p) }
}

/** Reads requirements or fail.unless: requirements and groups ({@code all: [...]}, one level). */
function requirementEntries(raw: unknown, path: string, p: Problems): RequirementEntry[] {
  if (!Array.isArray(raw)) {
    p.error(path, 'must be a list of entries, each with a type (or all: / any: for a group)')
    return []
  }
  const entries: RequirementEntry[] = []
  raw.forEach((item, i) => {
    const entryPath = `${path}[${i}]`
    if (!isMap(item)) {
      p.error(entryPath, 'must be a mapping with a type (or all: / any: for a group)')
      return
    }
    const read = isGroupTree(item) ? group(item, entryPath, 1, p) : requirement(item, entryPath, p)
    if (read) entries.push(read)
  })
  return entries
}

/** Reads a group at a level (1 = top level): its requirements, and its groups while it is above the last level. */
function group(item: Tree, path: string, level: number, p: Problems): RequirementGroup {
  // all: when it has both (an error)
  const mode: GroupMode = 'all' in item ? 'all' : 'any'
  if ('all' in item && 'any' in item) p.error(path, 'a group has all or any, not both')
  if ('type' in item) p.error(path, `a group (${mode}:) has no type: put the requirements under ${mode}`)
  for (const key of Object.keys(item)) {
    if (!GROUP_KEYS.includes(key) && key !== 'type') p.warn(`${path}.${key}`, `ignored by a group (it accepts ${GROUP_KEYS.join(', ')})`)
  }
  const members: RequirementEntry[] = []
  const list = item[mode]
  const listPath = `${path}.${mode}`
  if (!Array.isArray(list)) {
    p.error(listPath, 'must be a list of requirements')
  } else {
    list.forEach((member, j) => {
      const memberPath = `${listPath}[${j}]`
      if (!isMap(member)) p.error(memberPath, 'must be a mapping with a type')
      else if (isGroupTree(member)) {
        if (level >= MAX_GROUP_LEVEL) p.error(memberPath, GROUP_DEPTH_MESSAGE)
        else members.push(group(member, memberPath, level + 1, p))
      } else {
        const read = requirement(member, memberPath, p)
        if (read) members.push(read)
      }
    })
    if (list.length === 0) p.error(listPath, 'empty: a group needs requirements')
    else if (list.length === 1) p.warn(listPath, 'a group of one requirement: use the requirement itself')
  }
  return { mode, group: members, not: reversed(item, path, p), display: string(item, 'display', `${path}.display`, p) ?? '' }
}

/** {@return how many levels of groups an entry is: 0 for a requirement, 1 for a group of requirements, ...} */
export function groupDepth(entry: RequirementEntry): number {
  return isGroup(entry) ? 1 + Math.max(0, ...entry.group.map(groupDepth)) : 0
}

/** One requirement of a list, groups' members included. */
export interface RequirementAt {
  requirement: Requirement
  /** Its path in the quest, e.g. requirements[1].all[0] or requirements[2].any[1]. */
  path: string
  /**
   * It must be met for its list to be (so it makes "this quest needs that one"). A top-level entry must be true; a
   * requirement must be met when it must be true and is not reversed, or must be false and is reversed. Inside a group
   * that must be true (after its own not) every member of an all group must be true, none single of an any group;
   * inside one that must be false every member of an any group must be false, none single of an all group. So a
   * reversed any of reversed requirements needs each of them (not any(not A, not B) = A and B).
   */
  needed: boolean
}

/** {@return every requirement of a list, groups' members included, in order} */
export function eachRequirement(entries: RequirementEntry[], path: string): RequirementAt[] {
  const all: RequirementAt[] = []
  // A top-level entry must be true
  entries.forEach((entry, i) => walk(entry, `${path}[${i}]`, true, all))
  return all
}

/**
 * Collects the requirements of an entry that must hold.
 *
 * @param must What the entry must be: true, false, or null when nothing single in it must be anything.
 */
function walk(entry: RequirementEntry, path: string, must: boolean | null, out: RequirementAt[]) {
  if (!isGroup(entry)) {
    // MET when it has to be true and is not reversed, or has to be false and is
    out.push({ requirement: entry, path, needed: must !== null && must !== entry.not })
    return
  }
  // What its members join to must be (after the group's own not)
  const inner = must === null ? null : must !== entry.not
  // true: every member of an all group must be true (no single one of an any); false: every member of an any group must be false
  const each = inner === true ? (entry.mode === 'all' ? true : null) : inner === false ? (entry.mode === 'any' ? false : null) : null
  entry.group.forEach((member, j) => walk(member, `${path}.${entry.mode}[${j}]`, each, out))
}

/**
 * {@return the requirements that must hold, so make "this quest needs that one" (only those quest_completed /
 * quest_failed draw unlock lines and count toward requirement cycles)}
 */
export function dependencies(entries: RequirementEntry[]): Requirement[] {
  return eachRequirement(entries, '').filter((r) => r.needed).map((r) => r.requirement)
}

// =========================================================================
// EVALUATING (the plugin's rules for requirement lists)
// =========================================================================

export type Truth = 'met' | 'unmet' | 'unknown'

/** {@return a truth reversed: met and unmet swap, unknown stays unknown} */
export function reverse(truth: Truth): Truth {
  return truth === 'met' ? 'unmet' : truth === 'unmet' ? 'met' : 'unknown'
}

/** {@return all of some truths: unmet when one is, else unknown when one is, else met} */
export function allOf(truths: Truth[]): Truth {
  if (truths.includes('unmet')) return 'unmet'
  return truths.includes('unknown') ? 'unknown' : 'met'
}

/** {@return any of some truths: met when one is, else unknown when one is, else unmet} */
export function anyOf(truths: Truth[]): Truth {
  if (truths.includes('met')) return 'met'
  return truths.includes('unknown') ? 'unknown' : 'unmet'
}

/**
 * {@return what a list of entries comes to: met when every entry is (requirements: the quest can start), unmet when
 * one is not (fail.unless: the quest fails), else unknown}
 *
 * @param judge What one requirement is, before its not.
 */
export function evaluateEntries(entries: RequirementEntry[], judge: (requirement: Requirement) => Truth): Truth {
  return allOf(entries.map((entry) => evaluateEntry(entry, judge)))
}

/** {@return what one entry comes to after its not (a group: all or any of its requirements, each after its own not)} */
export function evaluateEntry(entry: RequirementEntry, judge: (requirement: Requirement) => Truth): Truth {
  const members = isGroup(entry) ? entry.group.map((r) => evaluateEntry(r, judge)) : []
  const truth = isGroup(entry) ? (entry.mode === 'any' ? anyOf(members) : allOf(members)) : judge(entry)
  return entry.not ? reverse(truth) : truth
}

function objectives(tree: Tree, p: Problems): Objective[] {
  const raw = tree.objectives
  if (raw === null || raw === undefined) {
    p.error('objectives', 'missing: a quest needs at least one objective')
    return []
  }
  if (!isMap(raw)) {
    p.error('objectives', 'must be a mapping of objective id to objective')
    return []
  }
  const list: Objective[] = []
  for (const [objectiveId, value] of Object.entries(raw)) {
    const path = `objectives.${objectiveId}`
    if (!ID.test(objectiveId)) {
      p.error(path, 'objective ids may only use a-z, 0-9 and _ (at most 64)')
      continue
    }
    if (!isMap(value)) {
      p.error(path, 'must be a mapping (type, amount, ...)')
      continue
    }
    const objective = readObjective(objectiveId, value, path, p)
    if (objective) list.push(objective)
  }
  if (list.length === 0 && !p.hasErrors) p.error('objectives', 'a quest needs at least one objective')
  return list
}

/** Reads one objective; null when it has no type. */
export function readObjective(id: string, o: Tree, path: string, p: Problems): Objective | null {
  const type = string(o, 'type', `${path}.type`, p)
  if (type === null) {
    p.error(`${path}.type`, 'missing')
    return null
  }
  let amount = whole(o, 'amount', 1, `${path}.amount`, p)
  if (amount < 1) {
    p.error(`${path}.amount`, 'must be at least 1')
    amount = 1
  }
  let stage = whole(o, 'stage', 0, `${path}.stage`, p)
  if (stage < 0 || stage > 1000) {
    p.error(`${path}.stage`, 'must be between 0 and 1000')
    stage = 0
  }
  return {
    id,
    type,
    display: string(o, 'display', `${path}.display`, p) ?? '',
    amount,
    stage,
    filters: filters(o.filters, `${path}.filters`, p),
    args: args(Object.entries(o).filter(([k]) => !OBJECTIVE_COMMON_KEYS.includes(k)), path, p),
    rewards: o.rewards === null || o.rewards === undefined ? [] : typedEntries(o.rewards, `${path}.rewards`, p, { requirements: true, party: true }),
    callbacks: o.callbacks === null || o.callbacks === undefined ? [] : typedEntries(o.callbacks, `${path}.callbacks`, p),
  }
}

function filters(raw: unknown, path: string, p: Problems): Filters {
  if (raw === null || raw === undefined) return NO_FILTERS
  if (!isMap(raw)) {
    p.error(path, 'must be a mapping (worlds, hand, y)')
    return NO_FILTERS
  }
  unknownKeys(raw, FILTER_KEYS, `${path}.`, p)

  let worldMode: Filters['worldMode'] = null
  let worlds: string[] = []
  const rawWorlds = raw.worlds
  if (Array.isArray(rawWorlds)) {
    worldMode = 'whitelist'
    worlds = stringList(raw, 'worlds', `${path}.worlds`, p)
  } else if (isMap(rawWorlds)) {
    const mode = string(rawWorlds, 'mode', `${path}.worlds.mode`, p)
    if (mode === null || mode.toLowerCase() === 'whitelist') worldMode = 'whitelist'
    else if (mode.toLowerCase() === 'blacklist') worldMode = 'blacklist'
    else p.error(`${path}.worlds.mode`, `'${mode}' is not whitelist or blacklist`)
    worlds = stringList(rawWorlds, 'values', `${path}.worlds.values`, p)
  } else if (rawWorlds !== null && rawWorlds !== undefined) {
    p.error(`${path}.worlds`, 'must be a list of world names, or mode + values')
  }

  let hand: string[] = []
  const rawHand = raw.hand
  if (isMap(rawHand)) hand = stringList(rawHand, 'items', `${path}.hand.items`, p)
  else if (rawHand !== null && rawHand !== undefined) hand = stringList(raw, 'hand', `${path}.hand`, p)

  let minY: number | null = null
  let maxY: number | null = null
  const rawY = raw.y
  if (isMap(rawY)) {
    if ('min' in rawY) minY = whole(rawY, 'min', 0, `${path}.y.min`, p)
    if ('max' in rawY) maxY = whole(rawY, 'max', 0, `${path}.y.max`, p)
    if (minY !== null && maxY !== null && minY > maxY) p.error(`${path}.y`, 'min is above max')
  } else if (rawY !== null && rawY !== undefined) {
    p.error(`${path}.y`, 'must be a mapping with min and/or max')
  }
  return { worldMode, worlds, hand, minY, maxY }
}

function stringMap(tree: Tree, key: string, p: Problems): [string, string][] {
  const value = tree[key]
  if (value === null || value === undefined) return []
  if (!isMap(value)) {
    p.error(key, 'must be a mapping')
    return []
  }
  const result: [string, string][] = []
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined || isMap(v) || Array.isArray(v)) p.error(`${key}.${k}`, 'must be text')
    else result.push([k, text(v)])
  }
  return result
}

/** {@return the counter id of a fail.when entry} */
export function failCounterId(index: number): string {
  return `!fail${index}`
}

function fail(raw: unknown, p: Problems): Fail {
  const none: Fail = { when: [], unless: [], result: 'drop', cooldown: 0, message: '', actions: [] }
  if (raw === null || raw === undefined) return none
  if (!isMap(raw)) {
    p.error('fail', 'must be a mapping (when, unless, result, cooldown, message)')
    return none
  }
  unknownKeys(raw, FAIL_KEYS, 'fail.', p)
  const when: Objective[] = []
  if (Array.isArray(raw.when)) {
    raw.when.forEach((item, i) => {
      const path = `fail.when[${i}]`
      if (!isMap(item)) {
        p.error(path, 'must be a mapping with a type')
        return
      }
      const o = { ...item }
      if ('stage' in o) p.warn(`${path}.stage`, 'ignored: fail conditions count in every stage')
      delete o.stage
      if ('rewards' in o) p.warn(`${path}.rewards`, 'ignored: a fail condition gives no rewards (use fail.actions)')
      delete o.rewards
      if ('callbacks' in o) p.warn(`${path}.callbacks`, 'ignored: a fail condition has no callbacks')
      delete o.callbacks
      const objective = readObjective(failCounterId(i), o, path, p)
      if (objective) when.push(objective)
    })
  } else if (raw.when !== null && raw.when !== undefined) {
    p.error('fail.when', 'must be a list of entries, each with an objective type')
  }
  const unless = raw.unless === null || raw.unless === undefined ? [] : requirementEntries(raw.unless, 'fail.unless', p)

  let result: Fail['result'] = 'drop'
  const rawResult = string(raw, 'result', 'fail.result', p)
  if (rawResult !== null) {
    if (rawResult.toLowerCase() === 'cooldown') result = 'cooldown'
    else if (rawResult.toLowerCase() !== 'drop') p.error('fail.result', `'${rawResult}' is not drop or cooldown`)
  }
  let cooldown = 0
  if (raw.cooldown !== null && raw.cooldown !== undefined) {
    try {
      cooldown = parseDuration(text(normalize(raw.cooldown)))
    } catch (e) {
      p.error('fail.cooldown', (e as Error).message)
    }
  }
  if (result === 'cooldown' && cooldown === 0 && (raw.cooldown === null || raw.cooldown === undefined)) {
    p.error('fail.cooldown', 'missing: result cooldown needs a cooldown, e.g. 1h')
  } else if (result === 'drop' && cooldown !== 0) {
    p.warn('fail.cooldown', 'ignored: result is drop')
  }
  const actions = raw.actions === null || raw.actions === undefined ? [] : typedEntries(raw.actions, 'fail.actions', p)
  if (when.length === 0 && unless.length === 0) {
    p.warn('fail', actions.length === 0 ? 'no when or unless entries: the quest never fails'
      : 'no when or unless entries: the actions run only when a plugin fails the quest')
  }
  return { when, unless, result, cooldown, message: string(raw, 'message', 'fail.message', p) ?? '', actions }
}

function notices(raw: unknown, p: Problems): [string, Tree][] {
  if (raw === null || raw === undefined) return []
  checkNotices(raw, 'notices', p)
  const result: [string, Tree][] = []
  if (isMap(raw)) {
    for (const [key, value] of Object.entries(raw)) if (NOTICE_EVENTS.includes(key) && isMap(value)) result.push([key, value])
  }
  return result
}

// =========================================================================
// NOTICES (NoticeParser.check with override: a quest's notices lay over config.yml's)
// =========================================================================

const NOTICE_PARTS = ['title', 'sound', 'particles', 'firework']
const TITLE_KEYS = ['enabled', 'title', 'subtitle', 'fade_in', 'stay', 'fade_out']
const SOUND_KEYS = ['enabled', 'sound', 'volume', 'pitch']
const PARTICLE_KEYS = ['enabled', 'particle', 'count', 'offset', 'speed', 'height', 'color', 'size', 'viewers']
const FIREWORK_KEYS = ['enabled', 'type', 'colors', 'fades', 'flicker', 'trail']
export const FIREWORK_TYPES = ['ball', 'ball_large', 'star', 'burst', 'creeper']
export const NOTICE_COLORS = ['white', 'silver', 'gray', 'black', 'red', 'maroon', 'yellow', 'olive', 'lime', 'green', 'aqua', 'teal', 'blue',
  'navy', 'fuchsia', 'purple', 'orange', 'gold', 'pink']
const KEY = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/
const HEX = /^#[0-9a-fA-F]{6}$/

export function isNoticeColor(raw: string): boolean {
  return HEX.test(raw) || NOTICE_COLORS.includes(raw.toLowerCase())
}

function checkNotices(tree: unknown, path: string, p: Problems) {
  if (!isMap(tree)) {
    p.error(path, 'must be a mapping of start, complete and fail')
    return
  }
  for (const [event, value] of Object.entries(tree)) {
    if (!NOTICE_EVENTS.includes(event)) p.warn(`${path}.${event}`, `unknown event, ignored (known: ${NOTICE_EVENTS.join(', ')})`)
    else if (value !== null && value !== undefined && !isMap(value)) p.error(`${path}.${event}`, 'must be a mapping of title, sound, particles and firework')
    else if (isMap(value)) checkNotice(value, `${path}.${event}`, p)
  }
}

function checkNotice(tree: Tree, path: string, p: Problems) {
  if (Object.keys(tree).length === 0) return
  for (const key of Object.keys(tree)) {
    if (!NOTICE_PARTS.includes(key)) p.warn(`${path}.${key}`, 'unknown key, ignored (known: title, sound, particles, firework)')
  }
  const part = (key: string): Tree | null => {
    const value = tree[key]
    if (value === null || value === undefined) return null
    if (isMap(value)) return value
    if (value === false) return { enabled: false }
    p.error(`${path}.${key}`, 'must be a mapping (or false to turn it off)')
    return null
  }
  const unknown = (part: Tree, known: string[], at: string) => {
    for (const key of Object.keys(part)) {
      if (!known.includes(key)) p.warn(`${at}.${key}`, `unknown key, ignored (known: ${[...known].sort().join(', ')})`)
    }
  }
  const on = (part: Tree | null, at: string): part is Tree => {
    if (!part) return false
    const enabled = part.enabled
    if (enabled === null || enabled === undefined) return Object.keys(part).length > 0
    if (typeof enabled === 'boolean') return enabled
    p.error(`${at}.enabled`, 'must be true or false')
    return false
  }
  const number = (part: Tree, key: string, at: string): number | null => {
    const value = part[key]
    if (value === null || value === undefined) return null
    const n = normalize(value)
    if (typeof n === 'number' && Number.isInteger(n)) return n
    p.error(`${at}.${key}`, 'must be a whole number')
    return null
  }
  const decimal = (part: Tree, key: string, at: string): number | null => {
    const value = part[key]
    if (value === null || value === undefined) return null
    if (typeof value === 'number') return value
    const n = Number(String(value))
    if (String(value).trim() === '' || Number.isNaN(n)) {
      p.error(`${at}.${key}`, 'must be a number')
      return null
    }
    return n
  }
  const textOf = (part: Tree, key: string, at: string): string => {
    const value = part[key]
    if (value === null || value === undefined) return ''
    if (isMap(value) || Array.isArray(value)) {
      p.error(`${at}.${key}`, 'must be text')
      return ''
    }
    return String(value)
  }
  const key = (part: Tree, name: string, at: string): boolean => {
    const value = part[name]
    if (value === null || value === undefined) return false
    if (!KEY.test(String(value).trim().toLowerCase())) {
      p.error(`${at}.${name}`, `'${String(value)}' is not a key (e.g. minecraft:entity.player.levelup)`)
      return false
    }
    return true
  }
  const ticks = (part: Tree, name: string, fallback: number, at: string) => {
    const value = number(part, name, at)
    if (value !== null && (value < 0 || value > 72_000)) p.warn(`${at}.${name}`, `must be between 0 and 72000 ticks; using ${fallback}`)
  }
  const flagOf = (part: Tree, name: string, at: string) => {
    const value = part[name]
    if (value !== null && value !== undefined && typeof value !== 'boolean') p.error(`${at}.${name}`, 'must be true or false')
  }
  const colors = (part: Tree, name: string, at: string): boolean => {
    const value = part[name]
    if (value === null || value === undefined) return true
    const raw = Array.isArray(value) ? value : [value]
    for (let i = 0; i < raw.length; i++) {
      const color = String(raw[i]).trim()
      if (!isNoticeColor(color)) {
        p.error(`${at}.${name}[${i}]`, `'${color}' is not #RRGGBB or a colour name`)
        return false
      }
    }
    return true
  }

  const title = part('title')
  const titlePath = `${path}.title`
  if (title) unknown(title, TITLE_KEYS, titlePath)
  if (on(title, titlePath)) {
    const big = textOf(title, 'title', titlePath)
    const small = textOf(title, 'subtitle', titlePath)
    if (big !== '' || small !== '') {
      ticks(title, 'fade_in', 10, titlePath)
      ticks(title, 'stay', 50, titlePath)
      ticks(title, 'fade_out', 10, titlePath)
    }
  }

  const sound = part('sound')
  const soundPath = `${path}.sound`
  if (sound) unknown(sound, SOUND_KEYS, soundPath)
  if (on(sound, soundPath) && key(sound, 'sound', soundPath)) {
    const volume = decimal(sound, 'volume', soundPath) ?? 1
    if (volume < 0) p.error(`${soundPath}.volume`, 'must be 0 or more')
    else {
      const pitch = decimal(sound, 'pitch', soundPath) ?? 1
      if (pitch < 0.5 || pitch > 2) p.warn(`${soundPath}.pitch`, 'must be between 0.5 and 2.0; clamped')
    }
  }

  const particles = part('particles')
  const particlesPath = `${path}.particles`
  if (particles) unknown(particles, PARTICLE_KEYS, particlesPath)
  if (on(particles, particlesPath) && key(particles, 'particle', particlesPath)) {
    const count = number(particles, 'count', particlesPath) ?? 20
    if (count < 1 || count > 1000) p.warn(`${particlesPath}.count`, 'must be between 1 and 1000; clamped')
    const color = particles.color === null || particles.color === undefined ? null : String(particles.color).trim()
    if (color !== null && !isNoticeColor(color)) p.error(`${particlesPath}.color`, `'${color}' is not #RRGGBB or a colour name`)
    else {
      const viewers = particles.viewers === null || particles.viewers === undefined ? 'all' : String(particles.viewers).trim().toLowerCase()
      if (viewers !== 'all' && viewers !== 'player') p.warn(`${particlesPath}.viewers`, `'${viewers}' is not all or player; using all`)
      decimal(particles, 'offset', particlesPath)
      decimal(particles, 'speed', particlesPath)
      decimal(particles, 'height', particlesPath)
      decimal(particles, 'size', particlesPath)
    }
  }

  const firework = part('firework')
  const fireworkPath = `${path}.firework`
  if (firework) unknown(firework, FIREWORK_KEYS, fireworkPath)
  if (on(firework, fireworkPath)) {
    const type = firework.type === null || firework.type === undefined ? 'ball' : String(firework.type).trim().toLowerCase()
    if (!FIREWORK_TYPES.includes(type)) p.error(`${fireworkPath}.type`, `'${type}' is not one of ${FIREWORK_TYPES.join(', ')}`)
    else if (colors(firework, 'colors', fireworkPath) && colors(firework, 'fades', fireworkPath)) {
      flagOf(firework, 'flicker', fireworkPath)
      flagOf(firework, 'trail', fireworkPath)
    }
  }
}

// =========================================================================
// WRITING
// =========================================================================

function argTree(args: ArgMap): Tree {
  const tree: Tree = {}
  for (const [key, value] of args) tree[key] = value
  return tree
}

function typed(entry: Entry): Tree {
  const tree: Tree = { type: entry.type, ...argTree(entry.args) }
  // A party reward: after its arguments and display, before its requirements
  if (entry.party) tree.party = true
  if (entry.partyRange !== undefined) tree.party_range = entry.partyRange
  // A reward's requirements: after its arguments and display, only when there are some
  if (entry.requirements && entry.requirements.length > 0) tree.requirements = entry.requirements.map(writeRequirementEntry)
  return tree
}

/** {@return a requirement or group as written: not only when true, a group's display only when set} */
export function writeRequirementEntry(entry: RequirementEntry): Tree {
  if (isGroup(entry)) {
    const tree: Tree = { [entry.mode]: entry.group.map(writeRequirementEntry) }
    if (entry.not) tree.not = true
    if (entry.display !== '') tree.display = entry.display
    return tree
  }
  const tree = typed(entry)
  if (entry.not) tree.not = true
  return tree
}

export function writeObjective(objective: Objective): Tree {
  const tree: Tree = { type: objective.type }
  if (objective.display !== '') tree.display = objective.display
  tree.amount = objective.amount
  if (objective.stage > 0) tree.stage = objective.stage
  for (const [key, value] of objective.args) tree[key] = value
  const f = objective.filters
  if (f.worldMode !== null || f.hand.length > 0 || f.minY !== null || f.maxY !== null) {
    const filters: Tree = {}
    if (f.worldMode !== null) filters.worlds = { mode: f.worldMode, values: f.worlds }
    if (f.hand.length > 0) filters.hand = f.hand
    if (f.minY !== null || f.maxY !== null) {
      const y: Tree = {}
      if (f.minY !== null) y.min = f.minY
      if (f.maxY !== null) y.max = f.maxY
      filters.y = y
    }
    tree.filters = filters
  }
  if (objective.rewards.length > 0) tree.rewards = objective.rewards.map(typed)
  if (objective.callbacks.length > 0) tree.callbacks = objective.callbacks.map(typed)
  return tree
}

/** {@return the canonical tree of a read quest (DefinitionCodec.writeQuest)} */
export function writeQuest(quest: Quest): Tree {
  const tree: Tree = { id: quest.id, name: quest.name }
  if (quest.description.length > 0) tree.description = quest.description
  if (quest.icon !== DEFAULT_ICON) tree.icon = quest.icon
  if (quest.difficulty !== null) tree.difficulty = quest.difficulty
  tree.pool = quest.pool
  if (quest.repeatable) tree.repeatable = true
  if (quest.cooldown !== 0) tree.cooldown = formatDuration(quest.cooldown)
  if (quest.timeLimit !== 0) tree.time_limit = formatDuration(quest.timeLimit)
  if (quest.autoStart) tree.auto_start = true
  if (quest.noTeleport) tree.no_teleport = true
  if (quest.hiddenUntilUnlocked) tree.hidden_until_unlocked = true
  if (quest.requirements.length > 0) tree.requirements = quest.requirements.map(writeRequirementEntry)
  const objectives: Tree = {}
  for (const objective of quest.objectives) objectives[objective.id] = writeObjective(objective)
  tree.objectives = objectives
  const stageRewards = new Map(quest.stageRewards.filter(([, rewards]) => rewards.length > 0))
  const stageCallbacks = new Map(quest.stageCallbacks.filter(([, actions]) => actions.length > 0))
  const stageNumbers = [...new Set([...stageRewards.keys(), ...stageCallbacks.keys()])].sort((a, b) => a - b)
  if (stageNumbers.length > 0) {
    const stagesTree: Tree = {}
    for (const stage of stageNumbers) {
      const settings: Tree = {}
      if (stageRewards.has(stage)) settings.rewards = stageRewards.get(stage)!.map(typed)
      if (stageCallbacks.has(stage)) settings.callbacks = stageCallbacks.get(stage)!.map(typed)
      stagesTree[String(stage)] = settings
    }
    tree.stages = stagesTree
  }
  if (quest.rewards.length > 0) tree.rewards = quest.rewards.map(typed)
  if (quest.messages.length > 0) tree.messages = Object.fromEntries(quest.messages)
  const fail = quest.fail
  if (fail.when.length > 0 || fail.unless.length > 0 || fail.actions.length > 0) {
    const f: Tree = {}
    if (fail.when.length > 0) f.when = fail.when.map(writeObjective)
    if (fail.unless.length > 0) f.unless = fail.unless.map(writeRequirementEntry)
    if (fail.result !== 'drop') f.result = fail.result
    if (fail.cooldown !== 0) f.cooldown = formatDuration(fail.cooldown)
    if (fail.message !== '') f.message = fail.message
    if (fail.actions.length > 0) f.actions = fail.actions.map(typed)
    tree.fail = f
  }
  if (CALLBACK_EVENTS.some((event) => quest.callbacks[event].length > 0)) {
    const callbacksTree: Tree = {}
    for (const event of CALLBACK_EVENTS) if (quest.callbacks[event].length > 0) callbacksTree[event] = quest.callbacks[event].map(typed)
    tree.callbacks = callbacksTree
  }
  if (quest.notices.length > 0) {
    const notices: Tree = {}
    for (const event of NOTICE_EVENTS) {
      const found = quest.notices.find(([e]) => e === event)
      if (found) notices[event] = found[1]
    }
    tree.notices = notices
  }
  return tree
}

/**
 * {@return a quest tree in canonical form, and the problems reading it gave; body is null when it does not read}
 *
 * @param tree The tree.
 * @param id   The id it is stored as.
 * @param ownPartyTypes The reward types with a party argument of their own ({@link ownPartyTypes}); the ones set
 *                      with {@link setOwnPartyTypes} when absent.
 */
export function canonicalQuest(tree: Tree, id: string, ownPartyTypes?: ReadonlySet<string>): { body: Tree | null; quest: Quest | null; problems: Problem[] } {
  const p = new Problems()
  reading = ownPartyTypes ?? ownParty
  try {
    const quest = readQuest(tree, id, p)
    return { body: quest ? writeQuest(quest) : null, quest, problems: p.list }
  } finally {
    reading = ownParty
  }
}
