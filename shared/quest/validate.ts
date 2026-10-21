/**
 * Checks a read quest the way the plugin's DefinitionValidator does, with its messages and paths, as far as the web can
 * know: types and their arguments (from the catalog of /chronos cl types), items, blocks and entities (vanilla keys
 * and other plugins' ids), the pool (in D1), difficulties, stages, quest references. The plugin checks again on
 * /chronos cl download; its answer is final.
 */
import type { RefIndex } from '../api'
import type { Catalog, Category, ParamDto, Problem, TypeDto } from '../creator'
import {
  type ArgMap, dependencies, eachRequirement, type Entry, type Filters, Problems, type Quest, type RequirementEntry, type Value, CALLBACK_EVENTS,
} from './canonical'
import { parseDuration } from './durations'
import { requirementsUse, type RequirementUse, useProblems } from './uses'

export const MESSAGE_KEYS = ['start', 'complete', 'abandon', 'expire']
const KNOWN_SHOWN = 12

export interface ValidateContext {
  /** What /chronos cl types sent; without its types, types and arguments are not checked. */
  catalog?: Catalog
  /** Other plugins' ids (/chronos cl refs). */
  refs?: RefIndex
  /** The pools in D1, or null when unknown (not checked). */
  pools?: Map<string, { type: string }> | null
  /** Whether a quest exists (in D1, or saved together); undefined = unknown. */
  questExists?: (id: string) => boolean | undefined
  /** Set while checking a requirement with not: true (a quest that does not exist makes it always pass). */
  reversed?: boolean
}

type KeyKind = 'item' | 'block' | 'entity'

/** A catalog made fast to look up. */
export class TypeIndex {
  readonly byCategory: Record<Category, Map<string, TypeDto>>

  constructor(readonly catalog: Catalog) {
    const index = (list: TypeDto[] | undefined) => new Map((list ?? []).map((t) => [t.id, t]))
    this.byCategory = {
      objective: index(catalog.types?.objective),
      requirement: index(catalog.types?.requirement),
      reward: index(catalog.types?.reward),
    }
  }

  get hasTypes(): boolean {
    return this.catalog.types !== undefined
  }

  get(category: Category, id: string): TypeDto | undefined {
    return this.byCategory[category].get(id)
  }
}

const indexes = new WeakMap<Catalog, { index: TypeIndex; sets: Map<string, Set<string>> }>()

function cached(catalog: Catalog) {
  let entry = indexes.get(catalog)
  if (!entry) {
    entry = { index: new TypeIndex(catalog), sets: new Map() }
    indexes.set(catalog, entry)
  }
  return entry
}

function setOf(catalog: Catalog, name: string, values: string[] | undefined): Set<string> | null {
  if (!values) return null
  const sets = cached(catalog).sets
  let set = sets.get(name)
  if (!set) {
    set = new Set(values)
    sets.set(name, set)
  }
  return set
}

/**
 * {@return the problems of one quest}
 *
 * @param quest The quest, read with canonical.readQuest.
 * @param ctx   What is known about the server.
 */
export function validateQuest(quest: Quest, ctx: ValidateContext): Problem[] {
  const p = new Problems()
  const catalog = ctx.catalog ?? {}
  const index = cached(catalog).index
  const checker = new KeyChecker(catalog, ctx.refs)

  if (quest.pool !== null && ctx.pools) {
    if (!ctx.pools.has(quest.pool)) p.error('pool', `pool '${quest.pool}' does not exist`)
  }
  const pool = quest.pool !== null ? ctx.pools?.get(quest.pool) : undefined
  const difficulties = catalog.server?.difficulties
  if (quest.difficulty === null) {
    if (pool?.type === 'timed_random') p.warn('difficulty', 'missing: timed_random pools roll by difficulty, so this quest is never rolled')
  } else if (difficulties && !difficulties.includes(quest.difficulty)) {
    p.warn('difficulty', `'${quest.difficulty}' is not in config.yml difficulties [${[...difficulties].sort().join(', ')}]`)
  }
  if (quest.cooldown !== 0 && !quest.repeatable) p.warn('cooldown', 'ignored: the quest is not repeatable')
  const iconError = checker.check(quest.icon, 'item', false)
  if (iconError) p.warn('icon', `${iconError}; a default icon is shown`)

  const stages = new Set<number>()
  for (const objective of quest.objectives) {
    const path = `objectives.${objective.id}`
    stages.add(objective.stage)
    if (index.hasTypes) {
      const spec = index.get('objective', objective.type)
      if (!spec) p.error(`${path}.type`, unknownType(index, 'objective', objective.type))
      else checkArgs(spec, objective.args, path, p, ctx, quest.id, [], checker)
    }
    checkFilters(objective.filters, `${path}.filters`, p, checker)
    objective.rewards.forEach((r, i) => {
      checkEntry('reward', r, `${path}.rewards[${i}]`, p, ctx, quest.id, index, checker)
      checkRewardRequirements(r, `${path}.rewards[${i}]`, p, ctx, index, checker)
      checkPartyFarm(quest, r, `${path}.rewards[${i}]`, p)
    })
    objective.callbacks.forEach((r, i) => checkEntry('reward', r, `${path}.callbacks[${i}]`, p, ctx, quest.id, index, checker))
  }
  // What a stage gives when it is done
  for (const [stage, rewards] of quest.stageRewards) {
    if (!stages.has(stage)) p.warn(`stages.${stage}`, `stage ${stage} has no objectives: its rewards are never given`)
    rewards.forEach((r, i) => {
      checkEntry('reward', r, `stages.${stage}.rewards[${i}]`, p, ctx, quest.id, index, checker)
      checkPartyFarm(quest, r, `stages.${stage}.rewards[${i}]`, p)
    })
  }
  // What a stage runs when it is done
  for (const [stage, actions] of quest.stageCallbacks) {
    if (!stages.has(stage)) p.warn(`stages.${stage}`, `stage ${stage} has no objectives: its callbacks never run`)
    actions.forEach((r, i) => checkEntry('reward', r, `stages.${stage}.callbacks[${i}]`, p, ctx, quest.id, index, checker))
  }
  let expected = 0
  for (const stage of [...stages].sort((a, b) => a - b)) {
    if (stage !== expected) {
      p.warn('objectives', `stage ${expected} has no objectives: it completes at once`)
      break
    }
    expected++
  }

  checkRequirements(quest.requirements, 'requirements', requirementsUse(quest.autoStart), p, ctx, quest.id, index, checker)
  quest.fail.when.forEach((entry, i) => {
    const path = `fail.when[${i}]`
    if (index.hasTypes) {
      const spec = index.get('objective', entry.type)
      if (!spec) p.error(`${path}.type`, unknownType(index, 'objective', entry.type))
      else if (entry.type === 'custom') p.error(`${path}.type`, 'custom cannot be a fail condition; a plugin fails the quest with ChronosAPI#failQuest')
      else checkArgs(spec, entry.args, path, p, ctx, quest.id, [], checker)
    }
    checkFilters(entry.filters, `${path}.filters`, p, checker)
  })
  checkRequirements(quest.fail.unless, 'fail.unless', 'fail_unless', p, ctx, quest.id, index, checker)
  quest.rewards.forEach((r, i) => {
    checkEntry('reward', r, `rewards[${i}]`, p, ctx, quest.id, index, checker)
    checkRewardRequirements(r, `rewards[${i}]`, p, ctx, index, checker)
    checkPartyFarm(quest, r, `rewards[${i}]`, p)
  })
  // Run on failure, like rewards
  quest.fail.actions.forEach((r, i) => checkEntry('reward', r, `fail.actions[${i}]`, p, ctx, quest.id, index, checker))
  // Run on the run's events, never listed: any reward type
  for (const event of CALLBACK_EVENTS) {
    quest.callbacks[event].forEach((r, i) => checkEntry('reward', r, `callbacks.${event}[${i}]`, p, ctx, quest.id, index, checker))
  }

  for (const [key] of quest.messages) {
    if (!MESSAGE_KEYS.includes(key)) p.warn(`messages.${key}`, `unknown message, ignored (known: [${[...MESSAGE_KEYS].sort().join(', ')}])`)
  }
  return p.list
}

/**
 * Checks requirements or fail.unless, groups' members like the others. Only a requirement that must hold makes "this
 * quest needs that one" (canonical.eachRequirement); any other may name its own quest. A quest that does not exist is a warning
 * either way, saying what it does: never passes, or always passes when the requirement itself is reversed.
 */
/** Reward types worth something (DefinitionValidator.VALUABLE_TYPES); reputation only when it adds some. */
export const VALUABLE_TYPES = ['item', 'items', 'custom_item', 'vanilla_experience', 'vanilla_levels', 'coins', 'experience', 'vulcan_item', 'tyche_loot',
  'plutus_loot']

/** {@return true when a reward gives the player something worth having (DefinitionValidator.valuable)} */
export function valuable(reward: Entry): boolean {
  if (VALUABLE_TYPES.includes(reward.type)) return true
  const amount = reward.args.find(([k]) => k === 'amount')?.[1]
  return reward.type === 'reputation' && typeof amount === 'number' && amount > 0
}

/** Warns about a valuable party reward of a repeatable quest: the whole party gets it each time anyone completes it. */
function checkPartyFarm(quest: Quest, reward: Entry, path: string, p: Problems) {
  if (reward.party && quest.repeatable && valuable(reward)) p.warn(`${path}.party`, 'every party member gets it each time anyone completes it')
}

/**
 * Checks a reward's requirements (the quest's rewards and an objective's; elsewhere reading them is already an error)
 * like any requirement, in the reward use. They are no quest dependency: a quest_completed naming its own quest means
 * "completed before", and a quest that does not exist is not reported.
 */
function checkRewardRequirements(reward: Entry, path: string, p: Problems, ctx: ValidateContext, index: TypeIndex, checker: KeyChecker) {
  if (!reward.requirements) return
  checkRequirements(reward.requirements, `${path}.requirements`, 'reward', p, { ...ctx, questExists: undefined }, null, index, checker)
}

function checkRequirements(entries: RequirementEntry[], path: string, use: RequirementUse, p: Problems, ctx: ValidateContext, selfId: string | null,
                           index: TypeIndex, checker: KeyChecker) {
  for (const r of eachRequirement(entries, path)) {
    const own = { ...ctx, reversed: r.requirement.not }
    checkEntry('requirement', r.requirement, r.path, p, own, r.needed ? selfId : null, index, checker, use)
  }
}

function checkEntry(category: 'requirement' | 'reward', entry: Entry, path: string, p: Problems, ctx: ValidateContext, selfId: string | null,
                    index: TypeIndex, checker: KeyChecker, use?: RequirementUse) {
  if (!index.hasTypes) return
  const spec = index.get(category, entry.type)
  if (!spec) {
    p.error(`${path}.type`, unknownType(index, category, entry.type))
    return
  }
  checkArgs(spec, entry.args, path, p, ctx, selfId, ['display'], checker)
  // Then what its place (use) takes: a spot away from the player only where it can wait
  if (use) for (const problem of useProblems(ctx.catalog, use, spec, entry.args)) p.error(`${path}.${problem.at}`, problem.message)
}

function unknownType(index: TypeIndex, category: Category, type: string): string {
  const known = [...index.byCategory[category].keys()].sort()
  return `unknown ${category} type '${type}' (known: ${known.join(', ')}; a type of another plugin needs that plugin installed)`
}

function checkFilters(filters: Filters, path: string, p: Problems, checker: KeyChecker) {
  if (filters.worldMode !== null && filters.worlds.length === 0) {
    p.warn(`${path}.worlds`, filters.worldMode === 'whitelist' ? 'an empty whitelist: the objective never counts' : 'an empty blacklist has no effect')
  }
  filters.hand.forEach((key, i) => {
    const error = checker.check(key, 'item', true)
    if (error) p.error(`${path}.hand[${i}]`, error)
  })
}

function checkArgs(spec: TypeDto, args: ArgMap, path: string, p: Problems, ctx: ValidateContext, selfId: string | null, common: string[],
                   checker: KeyChecker) {
  const values = new Map(args)
  for (const key of common) if (Array.isArray(values.get(key))) p.error(`${path}.${key}`, 'must be a single text')
  for (const param of spec.params) {
    const argPath = `${path}.${param.name}`
    const value = values.get(param.name)
    if (value === undefined) {
      if (param.required) p.error(argPath, `missing: ${param.description}`)
      continue
    }
    // Only needing its own completion or failure is a cycle: counting its completions or starting it again is fine
    checkValue(param, value, argPath, p, ctx, spec.id === 'quest_completed' || spec.id === 'quest_failed' ? selfId : null, checker)
    if (param.scope && !Array.isArray(value)) checkScoped(param, String(value), values, argPath, p, ctx.refs)
  }
  for (const name of values.keys()) {
    if (!spec.params.some((param) => param.name === name) && !common.includes(name)) {
      const accepts = spec.params.length === 0 ? 'it takes no arguments' : `it accepts ${spec.params.map((param) => param.name).join(', ')}`
      p.warn(`${path}.${name}`, `ignored by ${spec.id} (${accepts})`)
    }
  }
}

/** What a scoped refs kind is, for its warning: 'intro' is not a conversation of guard. */
const SCOPED_NOUNS: Record<string, string> = { convos: 'a conversation', answers: 'an answer' }

/**
 * {@return the path a scoped argument's ids sit under (its scoping siblings' values joined by `/`, e.g. guard/intro),
 * null when one of them is not set, or undefined for an argument without a scope}
 */
export function scopePath(param: ParamDto, siblings: Record<string, Value | undefined>): string | null | undefined {
  if (!param.scope || param.scope.length === 0) return undefined
  const parts: string[] = []
  for (const name of param.scope) {
    const value = siblings[name]
    const text = value === undefined || Array.isArray(value) ? '' : String(value).trim()
    if (text === '') return null
    parts.push(text)
  }
  return parts.join('/')
}

/**
 * Warns about a scoped value that is not under its siblings' values (a conversation the NPC does not have). Says
 * nothing while a scoping sibling is unset or the plugin never sent the ids.
 */
function checkScoped(param: ParamDto, value: string, siblings: Map<string, Value>, path: string, p: Problems, refs: RefIndex | undefined) {
  const prefix = scopePath(param, Object.fromEntries(siblings))
  const v = value.trim()
  if (!prefix || v === '') return
  let sent = false
  let kind = ''
  for (const source of param.pick ?? []) {
    const [where, provider, refKind] = source.split(':')
    const ids = where === 'refs' && provider && refKind ? refs?.[provider]?.[refKind] : undefined
    if (!ids) continue
    if (ids.includes(`${prefix}/${v}`)) return
    sent = true
    kind ||= refKind!
  }
  if (!sent) return
  const noun = SCOPED_NOUNS[kind]
  p.warn(path, noun ? `'${v}' is not ${noun} of ${prefix}` : `'${v}' is not known under ${prefix}`)
}

/** Warns about a text value its type does not know (a STRING's choices). */
function known(param: ParamDto, value: string, path: string, p: Problems) {
  const choices = param.choices ?? []
  const bare = value.toLowerCase().startsWith('minecraft:') ? value.slice(10) : value
  if (choices.length === 0 || choices.some((c) => c.toLowerCase() === value.toLowerCase() || c.toLowerCase() === bare.toLowerCase())) return
  const shown = choices.slice(0, KNOWN_SHOWN)
  p.warn(path, `'${value}' is not known (known: ${shown.join(', ')}${choices.length > KNOWN_SHOWN ? ', ...' : ''}); it never matches unless a plugin adds it`)
}

function checkMin(param: ParamDto, value: number, path: string, p: Problems) {
  if (param.min !== null && value < param.min) p.error(path, `must be at least ${param.min}`)
}

export function checkValue(param: ParamDto, value: Value, path: string, p: Problems, ctx: ValidateContext, selfId: string | null,
                           checker: KeyChecker) {
  const list = Array.isArray(value)
  switch (param.kind) {
    case 'STRING':
    case 'TEXT':
      if (list) p.error(path, 'must be a single value')
      else known(param, String(value), path, p)
      break
    case 'INTEGER':
      if (typeof value !== 'number' || !Number.isInteger(value)) p.error(path, 'must be a whole number')
      else checkMin(param, value, path, p)
      break
    case 'DECIMAL':
      if (typeof value !== 'number') p.error(path, 'must be a number')
      else checkMin(param, value, path, p)
      break
    case 'BOOLEAN':
      if (typeof value !== 'boolean') p.error(path, 'must be true or false')
      break
    case 'DURATION':
      try {
        parseDuration(String(value))
      } catch (e) {
        p.error(path, (e as Error).message)
      }
      break
    case 'CHOICE':
      if (list || !(param.choices ?? []).includes(String(value))) p.error(path, `'${String(value)}' is not one of ${(param.choices ?? []).join(', ')}`)
      break
    case 'STRING_LIST':
      if (Array.isArray(value)) value.forEach((v, i) => known(param, v, `${path}[${i}]`, p))
      else known(param, String(value), path, p)
      break
    case 'ITEM':
      if (list) p.error(path, 'must be a single item')
      else {
        const error = namespaceError(param, String(value)) ?? checker.check(String(value), 'item', false)
        if (error) p.error(path, error)
      }
      break
    case 'BLOCK':
      if (list) p.error(path, 'must be a single block')
      else {
        const error = namespaceError(param, String(value)) ?? checker.check(String(value), 'block', false)
        if (error) p.error(path, error)
      }
      break
    case 'ITEM_LIST':
    case 'BLOCK_LIST':
    case 'ENTITY_LIST': {
      const kind: KeyKind = param.kind === 'ITEM_LIST' ? 'item' : param.kind === 'BLOCK_LIST' ? 'block' : 'entity'
      const values = Array.isArray(value) ? value : [String(value)]
      values.forEach((v, i) => {
        // A type that only reads one plugin's keys (a Vulcan item) never matches another's
        const error = namespaceError(param, v) ?? checker.check(v, kind, true)
        if (error) p.error(list ? `${path}[${i}]` : path, error)
      })
      break
    }
    case 'QUEST': {
      const target = String(value)
      if (list) p.error(path, 'must be a single quest id')
      else if (target === selfId) p.error(path, 'a quest cannot require itself')
      // Reversed, "not completed <missing quest>" is always true
      else if (ctx.questExists?.(target) === false) p.warn(path, `quest '${target}' does not exist: this ${ctx.reversed ? 'always' : 'never'} passes`)
      break
    }
  }
}

/** {@return what is wrong with a key for an argument that takes one namespace only (ParamSpec.namespaceError), or null} */
export function namespaceError(param: ParamDto, key: string): string | null {
  if (!param.only) return null
  const k = key.trim().toLowerCase()
  const what = param.kind === 'ENTITY_LIST' ? 'mobs' : param.kind === 'BLOCK' || param.kind === 'BLOCK_LIST' ? 'blocks' : 'items'
  // minecraft: is written "vanilla" to players
  const source = param.only === 'minecraft' ? 'vanilla' : param.only
  if (k.startsWith('#') && !param.tags) return `tags cannot be used here: only ${source} ${what} (${param.only}:<id>)`
  const bare = k.startsWith('#') ? k.slice(1) : k
  const namespace = bare.includes(':') ? bare.slice(0, bare.indexOf(':')) : 'minecraft'
  return namespace === param.only ? null : `only ${source} ${what} work here (${param.only}:<id>), not '${key}'`
}

/** Checks item, block and entity keys against what the catalog and the reference ids know. */
export class KeyChecker {
  constructor(private readonly catalog: Catalog, private readonly refs: RefIndex | undefined) {}

  /** {@return what is wrong with a key, or null when it exists or cannot be known here} */
  check(raw: string, kind: KeyKind, allowTags: boolean): string | null {
    const key = raw.trim().toLowerCase()
    if (key === '') return `empty ${kind}`
    const tag = key.startsWith('#')
    const qualified = qualify(tag ? key.slice(1) : key)
    if (qualified === null) return `'${raw}' is not a valid ${kind} key`
    const vanilla = this.catalog.vanilla
    if (tag) {
      if (!allowTags) return `tags are not allowed here, name one ${kind}`
      const tags = vanilla && setOf(this.catalog, `${kind}Tags`, kind === 'item' ? vanilla.itemTags : kind === 'block' ? vanilla.blockTags : vanilla.entityTags)
      return !tags || tags.has(`#${qualified}`) ? null : `unknown ${kind} tag '#${qualified}'`
    }
    const colon = qualified.indexOf(':')
    const namespace = qualified.slice(0, colon)
    const path = qualified.slice(colon + 1)
    if (namespace === 'minecraft') {
      const keys = vanilla && setOf(this.catalog, `${kind}s`, kind === 'item' ? vanilla.items : kind === 'block' ? vanilla.blocks : vanilla.entities)
      return !keys || keys.has(qualified) ? null : `unknown ${kind} '${qualified}'`
    }
    if (kind === 'block') return `only minecraft blocks are supported, not '${qualified}'`
    const sources = this.catalog.types?.keySources
    if (!sources) return null
    const source = sources[`${kind}:${namespace}`]
    if (!source) return `unknown ${kind} source '${namespace}' (no installed plugin provides ${namespace}: ${kind}s)`
    const [, provider, refKind] = source.split(':')
    const ids = provider && refKind ? this.refs?.[provider]?.[refKind] : undefined
    if (!ids) return null
    const set = setOf(this.catalog, `refs:${provider}:${refKind}:${ids.length}`, ids)!
    return set.has(path) || set.has(qualified) ? null : `unknown ${namespace} ${kind} '${path}'`
  }
}

/** {@return namespace:path, adding minecraft: when missing, or null when malformed} */
function qualify(key: string): string | null {
  const qualified = key.includes(':') ? key : `minecraft:${key}`
  return /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(qualified) ? qualified : null
}

/** {@return the quests that sit on a cycle of quest_completed requirements (only the ones that must hold need their quest)} */
export function requirementCycles(quests: Map<string, Quest>): Set<string> {
  const edges = new Map<string, string[]>()
  for (const [id, quest] of quests) {
    edges.set(id, dependencies(quest.requirements).filter((r) => r.type === 'quest_completed').map((r) => argString(r.args, 'quest'))
      .filter((t): t is string => t !== null && quests.has(t)))
  }
  const onCycle = new Set<string>()
  for (const start of quests.keys()) {
    // Is start reachable from itself?
    const seen = new Set<string>()
    const stack = [...(edges.get(start) ?? [])]
    while (stack.length > 0) {
      const next = stack.pop()!
      if (next === start) {
        onCycle.add(start)
        break
      }
      if (seen.has(next)) continue
      seen.add(next)
      stack.push(...(edges.get(next) ?? []))
    }
  }
  return onCycle
}

export const CYCLE_MESSAGE = 'quest_completed requirements form a cycle through this quest: none of them can ever start'

/** {@return an argument as text, or null} */
export function argString(args: ArgMap, name: string): string | null {
  const found = args.find(([key]) => key === name)
  if (!found || Array.isArray(found[1])) return null
  return String(found[1])
}

