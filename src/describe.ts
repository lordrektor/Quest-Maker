/**
 * Readable lines for quest and pool trees: objectives, requirements, rewards and fail conditions, durations, reset
 * schedules and difficulties. Every line is MiniMessage (an author's `display`, or a generated sentence with its text
 * escaped), so pages render all of them the same way.
 *
 * The keys follow Chronos's docs (types.md and integrations.md); a type nobody describes here gets a generic line.
 */
import { hasOwnParty } from '../shared/quest/canonical'
import { escapeMiniMessage, plainText } from './minimessage'

export type Tree = Record<string, unknown>

/** A line to show: MiniMessage, the placeholders it uses, and an optional hint and quest link. */
export interface Line {
  mini: string
  placeholders?: Record<string, string>
  /** Plain text shown small under the line (filters). */
  hint?: string
  /** A quest id the line refers to (quest_completed, start_quest, ...). */
  quest?: string
}

// =========================================================================
// VALUES
// =========================================================================

export function isTree(value: unknown): value is Tree {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

export function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

/** {@return a single value or a list as a list of texts} */
export function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(str).filter((v): v is string => v !== undefined && v !== '')
  const one = str(value)
  return one ? [one] : []
}

/** {@return a number written for people: `10000` → `10,000`, `2.5` stays} */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * {@return an item, block, entity or other key as words} `minecraft:iron_axe` → `iron axe`, `#minecraft:logs` →
 * `logs (any)`, `tyche_boss:cinder_hydra` → `cinder hydra`, `story/mine_diamond` → `mine diamond`.
 */
export function prettyKey(key: string): string {
  let k = key.trim()
  const tag = k.startsWith('#')
  if (tag) k = k.slice(1)
  const colon = k.indexOf(':')
  if (colon >= 0) k = k.slice(colon + 1)
  k = (k.split('/').pop() ?? k).replace(/[_.]+/g, ' ').trim()
  return tag ? `${k} (any)` : k
}

/** {@return `a`, `a or b`, `a, b or c`; long lists end in `and N more`} */
export function joinWords(words: string[], last = 'or', max = 5): string {
  if (words.length === 0) return ''
  if (words.length > max) return `${words.slice(0, max).join(', ')} and ${words.length - max} more`
  if (words.length === 1) return words[0] as string
  return `${words.slice(0, -1).join(', ')} ${last} ${words[words.length - 1]}`
}

/** {@return the keys of an argument as words, or `fallback` when it lists nothing} */
function keys(value: unknown, fallback: string): string {
  const words = list(value).map(prettyKey)
  return words.length ? joinWords(words) : fallback
}

function words(value: unknown, fallback = ''): string {
  const w = list(value).map((v) => v.replace(/_/g, ' '))
  return w.length ? joinWords(w) : fallback
}

const DIMENSIONS: Record<string, string> = { normal: 'overworld', nether: 'nether', the_end: 'end' }

/** {@return dimension ids (`normal`, `nether`, `the_end`) as `the overworld`, `the nether or the end`} */
function dimensions(value: unknown, fallback: string): string {
  const w = list(value).map((v) => `the ${DIMENSIONS[v.toLowerCase()] ?? v.replace(/_/g, ' ')}`)
  return w.length ? joinWords(w) : fallback
}

/** {@return a Kleos reputation in words: `merchants guild reputation`, or just `reputation`} */
function reputation(name: string): string {
  return name ? `${name} reputation` : 'reputation'
}

/** {@return Crius titles in words: `the dragon slayer title`, or `a title` for any} */
function titleNames(value: unknown): string {
  return list(value).length ? `the ${words(value)} title` : 'a title'
}

/** {@return one Crius title in words: `dragon slayer`} */
function titleName(a: Tree): string {
  return prettyKey(str(a.title) ?? '?')
}

/** {@return Metabasis warps in words: `the hub or market warp`, `a vip warp` (a group), or `a warp` for any} */
function warpNames(a: Tree): string {
  const names: string[] = []
  if (list(a.warps).length) names.push(`the ${words(a.warps)} warp`)
  if (list(a.groups).length) names.push(`a ${words(a.groups)} warp`)
  return names.length ? names.join(' or ') : 'a warp'
}

/** {@return a Convo NPC in words: `guard`, or `an NPC` when unset} */
function npcName(a: Tree): string {
  return prettyKey(str(a.npc) ?? '') || 'an NPC'
}

/** {@return a Convo conversation in words: `the conversation intro`, or `a conversation` for any} */
function convoName(a: Tree): string {
  const convo = prettyKey(str(a.convo) ?? '')
  return convo ? `the conversation ${convo}` : 'a conversation'
}

/** {@return Plutus clusters or groups as names: `Supply crate`, `Rare drops or Epic drops`} */
function plutusNames(value: unknown): string {
  return joinWords(list(value).map((k) => titleCase(prettyKey(k))))
}

/** {@return where Plutus loot comes from: `Supply crate loot or the Rare drops group`, or `Plutus loot` for any} */
function plutusSource(a: Tree): string {
  const sources: string[] = []
  if (list(a.clusters).length) sources.push(`${plutusNames(a.clusters)} loot`)
  if (list(a.groups).length) sources.push(`the ${plutusNames(a.groups)} ${list(a.groups).length === 1 ? 'group' : 'groups'}`)
  return sources.length ? sources.join(' or ') : 'Plutus loot'
}

/** How Metabasis teleports a player (the use_teleport causes), as the command they use. */
const TELEPORT_CAUSES: Record<string, string> = { warp: '/warp', spawn: '/spawn', request: '/tpa', back: '/back' }

const BAG_NAMES: Record<string, string> = { auto_loot: 'Auto Loot Bag', material: 'Material Bag', general: 'General Bag' }

/** {@return an RpgInv bag's name: Material Bag} */
function bagName(bag: string): string {
  return BAG_NAMES[bag.toLowerCase()] ?? (bag ? `${prettyKey(bag)} bag` : 'a bag')
}

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** {@return a type id as words: `kill_tyche_boss` → `Kill tyche boss`} */
export function prettyType(type: string): string {
  return titleCase(type.replace(/_/g, ' '))
}

const COMPARE: Record<string, string> = { '>=': 'at least', '>': 'above', '<=': 'at most', '<': 'below', '==': 'exactly', '!=': 'not' }

/** A compare argument's choices in plain words, for the picker (the YAML keeps >=, <...). */
export const COMPARE_WORDS: Record<string, string> = {
  '>=': 'at least', '>': 'more than', '<=': 'at most', '<': 'less than', '==': 'exactly', '!=': 'anything but',
}

function compared(args: Tree, valueKey = 'value'): string {
  const value = num(args[valueKey])
  const word = COMPARE[str(args.compare) ?? '>='] ?? str(args.compare) ?? 'at least'
  return `${word} ${value === undefined ? str(args[valueKey]) ?? '?' : formatNumber(value)}`
}

function times(n: number): string {
  return n === 1 ? 'once' : `${formatNumber(n)} times`
}

/** ` 5 times` (or nothing for once). */
function timesSuffix(n: number): string {
  return n === 1 ? '' : ` ${formatNumber(n)} times`
}

// =========================================================================
// DURATIONS AND SCHEDULES
// =========================================================================

const UNITS: Record<string, [string, string]> = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'], m: ['minute', 'minutes'], s: ['second', 'seconds'],
}

/** {@return a Chronos duration (`1d12h`, `90m`, `2w`) in words, or the text itself when it does not parse} */
export function humanDuration(value: unknown): string {
  const text = str(value)?.replace(/\s+/g, '').toLowerCase() ?? ''
  if (!text || text === '0') return 'none'
  const parts = [...text.matchAll(/(\d+)([wdhms])/g)]
  if (parts.length === 0 || parts.map((p) => p[0]).join('') !== text) return text
  return parts.map(([, n, unit]) => {
    const [one, many] = UNITS[unit as string] as [string, string]
    return `${n} ${Number(n) === 1 ? one : many}`
  }).join(' ')
}

const WEEKDAYS: Record<string, string> = {
  SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday',
  '1': 'Sunday', '2': 'Monday', '3': 'Tuesday', '4': 'Wednesday', '5': 'Thursday', '6': 'Friday', '7': 'Saturday',
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${s}`
}

/**
 * {@return a Quartz cron (`sec min hour dom month dow [year]`) in words when it is a simple daily, weekly, monthly or
 * every-N-hours schedule, else null}
 */
export function humanCron(cron: string): string | null {
  const f = cron.trim().split(/\s+/)
  if (f.length < 6 || f.length > 7) return null
  const [sec, min, hour, dom, month, dow, year] = f as [string, string, string, string, string, string, string?]
  if (year !== undefined && year !== '*') return null
  if (month !== '*' || !/^\d{1,2}$/.test(sec)) return null
  const any = (v: string) => v === '*' || v === '?'
  const everyHours = /^(?:\*|0)\/(\d+)$/.exec(hour)
  if (everyHours && /^\d{1,2}$/.test(min) && any(dom) && any(dow)) {
    const n = Number(everyHours[1])
    return n === 1 ? 'Resets every hour' : `Resets every ${n} hours`
  }
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour)) return null
  const at = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  if (any(dom) && any(dow)) return `Resets daily at ${at}`
  if (dom === '?' && WEEKDAYS[dow.toUpperCase()]) return `Resets every ${WEEKDAYS[dow.toUpperCase()]} at ${at}`
  if (dom === '?' && /^(MON-FRI|2-6)$/i.test(dow)) return `Resets every weekday at ${at}`
  if (dow === '?' && /^\d{1,2}$/.test(dom)) return `Resets monthly on the ${ordinal(Number(dom))} at ${at}`
  if (dow === '?' && dom.toUpperCase() === 'L') return `Resets on the last day of every month at ${at}`
  return null
}

/** {@return the reset line of a timed pool: humanised when simple, else the cron itself} */
export function resetLine(pool: Tree): string | null {
  const reset = str(pool.reset)
  if (!reset) return null
  const zone = str(pool.timezone)
  const text = humanCron(reset) ?? `Resets on the schedule "${reset}"`
  return zone ? `${text} (${zone})` : text
}

/** {@return "1 easy, 1 medium, 1 hard" for a pool's roll, or null} */
export function rollLine(pool: Tree): string | null {
  if (!isTree(pool.roll)) return null
  const parts = Object.entries(pool.roll)
    .map(([difficulty, count]) => [difficulty, num(count) ?? 0] as const)
    .filter(([, count]) => count > 0)
    .map(([difficulty, count]) => `${formatNumber(count)} ${difficultyLabel(difficulty).toLowerCase()}`)
  return parts.length ? parts.join(', ') : null
}

// =========================================================================
// DIFFICULTIES
// =========================================================================

export type Tone = 'easy' | 'medium' | 'hard' | 'other'

export function difficultyLabel(id: string): string {
  return titleCase(id.replace(/_/g, ' '))
}

export function difficultyTone(id: string | null | undefined): Tone {
  return id === 'easy' || id === 'medium' || id === 'hard' ? id : 'other'
}

// =========================================================================
// OBJECTIVES (also fail.when entries)
// =========================================================================

type Sentence = (a: Tree, n: number) => string

/** {@return " (with the party within 32 blocks)" for a kill credited to the killer's party, else ""} */
function partyCredit(a: Tree): string {
  if (str(a.credit) !== 'party') return ''
  return ` (with the party within ${formatNumber(Math.max(1, num(a.party_range) ?? 32))} blocks)`
}

/** {@return party roles as words: "Tank or Healer"} */
function partyRoles(roles: unknown): string {
  const all = list(roles).map((r) => titleCase(r.toLowerCase()))
  return all.length <= 1 ? all.join('') : `${all.slice(0, -1).join(', ')} or ${all.at(-1)}`
}

const LEAVE_REASONS: Record<string, string> = { left: 'by leaving', kicked: 'by being kicked', disbanded: 'when it is disbanded', expired: 'when it expires' }

/** {@return how a party is left, when only some ways count: " (by being kicked or when it is disbanded)"} */
function partyReasons(a: Tree): string {
  const reasons = list(a.reasons).map((r) => LEAVE_REASONS[r.toLowerCase()] ?? r.replace(/_/g, ' '))
  if (reasons.length === 0) return ''
  return ` (${reasons.length === 1 ? reasons[0] : `${reasons.slice(0, -1).join(', ')} or ${reasons.at(-1)}`})`
}

/** {@return a party's size as words: " of 2 to 5", " of 3 or more", " of up to 5", or ""} */
function partySize(a: Tree): string {
  const min = num(a.min_size)
  const max = num(a.max_size)
  if (min !== undefined && max !== undefined) return min === max ? ` of ${formatNumber(min)}` : ` of ${formatNumber(min)} to ${formatNumber(max)}`
  if (min !== undefined) return ` of ${formatNumber(min)} or more`
  if (max !== undefined) return ` of up to ${formatNumber(max)}`
  return ''
}

const n$ = formatNumber

// =========================================================================
// NAMES of other plugins' ids (/chronos cl refs labels: a Tyche NPC's display name)
// =========================================================================

let refNames: Record<string, Record<string, Record<string, string>>> = {}

/** Sets the display names sentences use for other plugins' ids (the creator does, once it has the catalog). */
export function setRefNames(labels: Record<string, Record<string, Record<string, string>>> | undefined) {
  refNames = labels ?? {}
}

/** {@return an id's display name (plain text), or the id as words: blacksmith → Blacksmith when Tyche sent it, else blacksmith} */
function refName(provider: string, kind: string, id: string): string {
  const label = refNames[provider]?.[kind]?.[id]
  const name = label ? plainText(label).trim() : ''
  return name || prettyKey(id)
}

/** {@return Tyche NPCs by name: "Blacksmith or Caravan Guard", or the fallback for none} */
function tycheNpcNames(value: unknown, fallback: string): string {
  const ids = list(value)
  return ids.length ? joinWords(ids.map((id) => refName('tyche', 'npcs', id))) : fallback
}

/** {@return one Tyche NPC by name (its npc argument), or "the NPC"} */
function tycheNpcName(a: Tree): string {
  const id = str(a.npc)?.trim()
  return id ? refName('tyche', 'npcs', id) : 'the NPC'
}

/**
 * {@return Phantasos cutscenes by name (its cutscenes, or its one cutscene): "Harbor Intro or Gate Fall", or the fallback}.
 * Cutscenes have no display names of their own, so an id reads as a title: harbor_intro → Harbor Intro.
 */
function cutsceneNames(a: Tree, fallback: string): string {
  const ids = [...list(a.cutscenes), ...list(a.cutscene)].map((id) => id.trim()).filter((id) => id.length > 0)
  const name = (id: string) => (refNames.phantasos?.cutscenes?.[id] ? refName('phantasos', 'cutscenes', id) : prettyKey(id).replace(/\b\w/g, (c) => c.toUpperCase()))
  return ids.length ? joinWords(ids.map(name)) : fallback
}

/** What interact_tyche_npc's click reads as: never talking (that is Convo's talk_npc). */
const NPC_CLICKS: Record<string, string> = { right: 'Click', left: 'Hit', any: 'Click' }
const HOSTILITIES = ['peaceful', 'neutral', 'hostile']

function tycheTargets(a: Tree, fallback: string): string {
  const all = [...list(a.bosses), ...list(a.mobs)].map(prettyKey)
  return all.length ? joinWords(all) : fallback
}

const TRAVEL_MODES: Record<string, string> = { walk: 'walking', swim: 'swimming', fly: 'flying', ride: 'riding' }

/** Sentences per objective type. `n` is the amount. */
export const OBJECTIVES: Record<string, Sentence> = {
  // Chronos
  block_break: (a, n) => `Break ${n$(n)} ${keys(a.blocks, 'blocks')}`,
  block_place: (a, n) => `Place ${n$(n)} ${keys(a.blocks, 'blocks')}`,
  kill_mob: (a, n) => `Kill ${n$(n)} ${keys(a.entities, 'mobs')}${partyCredit(a)}`,
  kill_player: (_a, n) => `Kill ${n$(n)} ${n === 1 ? 'player' : 'players'}`,
  craft: (a, n) => `Craft ${n$(n)} ${keys(a.items, 'items')}`,
  smelt: (a, n) => `Smelt ${n$(n)} ${keys(a.items, 'items')}`,
  fish: (a, n) => `Catch ${n$(n)} ${keys(a.items, 'items')} with a fishing rod`,
  consume: (a, n) => `Eat or drink ${n$(n)} ${keys(a.items, 'items')}`,
  enchant: (a, n) => `Enchant ${n$(n)} ${keys(a.items, 'items')}`,
  collect: (a, n) => `Collect ${n$(n)} ${keys(a.items, 'items')}`,
  deliver: (a, n) => `${a.take === false ? 'Hold' : 'Deliver'} ${n$(n)} ${keys(a.items, 'items')}`,
  reach_location: (a) => `Reach ${[a.x, a.y, a.z].map((v) => str(v) ?? '?').join(', ')}${str(a.world) ? ` in ${str(a.world)}` : ''}`,
  travel_distance: (a, n) => `Travel ${n$(n)} blocks${TRAVEL_MODES[str(a.mode) ?? ''] ? ` ${TRAVEL_MODES[str(a.mode) ?? '']}` : ''}`,
  gain_vanilla_experience: (_a, n) => `Gain ${n$(n)} XP`,
  death: (a, n) => `Die${timesSuffix(n)}${list(a.entities).length ? ` to ${keys(a.entities, '')}` : ''}`,
  // Animals and mobs
  breed: (a, n) => `Breed ${n$(n)} ${keys(a.entities, 'animals')}`,
  tame: (a, n) => `Tame ${n$(n)} ${keys(a.entities, 'animals')}`,
  shear: (a, n) => `Shear ${n$(n)} ${keys(a.entities, 'mobs')}`,
  milk: (a, n) => `Milk ${n$(n)} ${keys(a.entities, 'animals')}`,
  bucket_mob: (a, n) => `Catch ${n$(n)} ${keys(a.entities, 'mobs')} in a bucket`,
  cure_villager: (_a, n) => `Cure ${n$(n)} zombie ${n === 1 ? 'villager' : 'villagers'}`,
  // Farming and blocks
  harvest: (a, n) => `Harvest ${n$(n)} ${keys(a.blocks, 'crops')}`,
  bonemeal: (a, n) => `Grow ${n$(n)} ${keys(a.blocks, 'blocks')} with bone meal`,
  strip: (a, n) => `Strip ${n$(n)} ${keys(a.blocks, 'logs')}`,
  till: (a, n) => `Till ${n$(n)} ${keys(a.blocks, 'blocks')}`,
  make_path: (_a, n) => `Make ${n$(n)} dirt ${n === 1 ? 'path' : 'paths'}`,
  wax: (a, n) => `Wax ${n$(n)} ${keys(a.blocks, 'copper blocks')}`,
  scrape: (a, n) => `Scrape ${n$(n)} ${keys(a.blocks, 'copper blocks')}`,
  compost: (a, n) => `Compost ${n$(n)} ${keys(a.items, 'items')}`,
  fill_bucket: (a, n) => `Fill ${n$(n)} ${keys(a.items, 'buckets')}`,
  empty_bucket: (a, n) => `Empty ${n$(n)} ${keys(a.items, 'buckets')}`,
  // Crafting stations
  brew: (a, n) => `Brew ${n$(n)} ${list(a.potions).length ? `potions of ${keys(a.potions, '')}` : keys(a.items, 'potions')}`,
  smith: (a, n) => `Upgrade ${n$(n)} ${keys(a.items, 'items')} at a smithing table`,
  anvil: (a, n) => `Use an anvil${timesSuffix(n)}${list(a.items).length ? ` to make ${keys(a.items, '')}` : ''}`,
  grindstone: (a, n) => `Use a grindstone${timesSuffix(n)}${list(a.items).length ? ` on ${keys(a.items, '')}` : ''}`,
  trade: (a, n) => `Buy ${n$(n)} ${keys(a.items, 'items')} from ${list(a.professions).length ? words(a.professions) : words(a.traders, 'traders')}`,
  // Combat and items
  shoot: (a, n) => `Shoot${timesSuffix(n)}${list(a.items).length ? ` with a ${keys(a.items, '')}` : ''}`,
  throw: (a, n) => `Throw ${n$(n)} ${keys(a.projectiles, 'projectiles')}`,
  deal_vanilla_damage: (a, n) => `Deal ${n$(n)} damage${list(a.entities).length ? ` to ${keys(a.entities, '')}` : ''}`,
  take_vanilla_damage: (a, n) => `Take ${n$(n)} damage${list(a.entities).length ? ` from ${keys(a.entities, '')}` : ''}${list(a.causes).length ? ` (${words(a.causes)})` : ''}`,
  use_totem: (_a, n) => `Be saved by a totem of undying${timesSuffix(n)}`,
  wear_out_item: (a, n) => `Wear out ${n$(n)} ${keys(a.items, 'items')}`,
  pickup: (a, n) => `Pick up ${n$(n)} ${keys(a.items, 'items')}`,
  // Exploration and progress
  enter_biome: (a) => `Enter ${keys(a.biomes, 'a biome')}`,
  find_structure: (a) => `Find ${keys(a.structures, 'a structure')}`,
  change_world: (a, n) => `Travel to ${dimensions(a.dimensions, 'another world')}${timesSuffix(n)}`,
  reach_vanilla_level: (_a, n) => `Reach level ${n$(n)}`,
  advancement: (a, n) => list(a.advancements).length ? `Complete the advancement ${keys(a.advancements, '')}` : `Complete ${n$(n)} advancements`,
  sleep: (_a, n) => `Sleep in a bed${timesSuffix(n)}`,
  open_loot_chest: (_a, n) => `Open ${n$(n)} loot ${n === 1 ? 'chest' : 'chests'}`,
  win_raid: (_a, n) => `Win ${n$(n)} ${n === 1 ? 'raid' : 'raids'}`,
  jump: (_a, n) => `Jump ${times(n)}`,
  playtime: (_a, n) => `Play for ${n$(n)} ${n === 1 ? 'minute' : 'minutes'}`,
  // Chat
  chat: (a, n) => `Send ${n$(n)} chat ${n === 1 ? 'message' : 'messages'}${list(a.words).length ? ` containing ${joinWords(list(a.words).map((w) => `"${w}"`))}` : ''}`,
  run_command: (a, n) => `Run ${list(a.commands).length ? joinWords(list(a.commands).map((c) => `/${c}`)) : 'commands'}${timesSuffix(n)}`,
  // ExperienceTailor
  reach_level: (a) => `Reach level ${str(a.level) ?? '?'}`,
  level_up: (_a, n) => `Gain ${n$(n)} ${n === 1 ? 'level' : 'levels'}`,
  gain_experience: (_a, n) => `Gain ${n$(n)} experience`,
  deal_damage: (a, n) => `Deal ${n$(n)} ${list(a.types).length ? `${words(a.types)} ` : ''}damage${list(a.entities).length ? ` to ${keys(a.entities, '')}` : ''}`,
  take_damage: (a, n) => `Take ${n$(n)} ${list(a.types).length ? `${words(a.types)} ` : ''}damage${list(a.entities).length ? ` from ${keys(a.entities, '')}` : ''}`,
  spend_pool: (a, n) => `Spend ${n$(n)} ${list(a.pools).length ? `${words(a.pools)} ` : ''}points`,
  gain_effect: (a, n) => `Gain ${keys(a.effects, 'an effect')}${timesSuffix(n)}`,
  remove_effect: (a, n) => `Lose ${keys(a.effects, 'an effect')}${timesSuffix(n)}`,
  assign_expertise: (_a, n) => `Assign ${n$(n)} expertise ${n === 1 ? 'point' : 'points'}`,
  assign_expertise_to: (a, n) => `Assign ${n$(n)} ${n === 1 ? 'point' : 'points'} to ${words(a.expertise, 'expertise')}`,
  // Vulcan
  equip_item: (a) => `Equip ${keys(a.items, 'an item')}`,
  activate_set: (a) => `Activate ${list(a.sets).length ? `the ${words(a.sets)} set bonus` : 'a set bonus'}`,
  repair_item: (a, n) => a.count === 'durability' ? `Restore ${n$(n)} durability${list(a.items).length ? ` on ${keys(a.items, '')}` : ''}` : `Repair ${keys(a.items, 'items')}${timesSuffix(n)}`,
  fuse_item: (a, n) => `Fuse ${n$(n)} ${keys(a.items, 'items')}`,
  roll_reforge: (_a, n) => `Roll ${n$(n)} ${n === 1 ? 'reforge' : 'reforges'}`,
  reforge_item: (a, n) => `Reforge ${keys(a.items, 'items')}${timesSuffix(n)}`,
  socket_gem: (a, n) => `Socket ${n$(n)} ${keys(a.gems, 'gems')}`,
  unsocket_gem: (a, n) => `Remove ${n$(n)} ${keys(a.gems, 'gems')}`,
  wear_item: (a, n) => `Wear down ${keys(a.items, 'items')} by ${n$(n)} durability`,
  break_item: (a, n) => `Break ${n$(n)} ${keys(a.items, 'items')}`,
  use_command_item: (a, n) => `Use ${keys(a.items, 'command items')}${timesSuffix(n)}`,
  // Chrysos
  earn_coins: (a, n) => `Earn ${n$(n)} ${words(a.currencies, 'coins')}`,
  spend_coins: (a, n) => `Spend ${n$(n)} ${words(a.currencies, 'coins')}`,
  pay_player: (a, n) => `Pay ${n$(n)} ${words(a.currencies, 'coins')} to other players`,
  receive_payment: (a, n) => `Receive ${n$(n)} ${words(a.currencies, 'coins')} from other players`,
  // Kleos
  gain_reputation: (a, n) => `Gain ${n$(n)} ${reputation(words(a.reputations))}`,
  lose_reputation: (a, n) => `Lose ${n$(n)} ${reputation(words(a.reputations))}`,
  reach_reputation: (a, n) => `Reach ${n$(n)} ${reputation(prettyKey(str(a.reputation) ?? ''))}`,
  // Crius
  unlock_title: (a, n) => `Unlock ${n$(n)} ${n === 1 ? 'title' : 'titles'}${list(a.titles).length ? ` (${words(a.titles)})` : ''}${list(a.groups).length ? ` of the ${words(a.groups)} ${list(a.groups).length === 1 ? 'group' : 'groups'}` : ''}`,
  wear_title: (a, n) => `Wear ${titleNames(a.titles)}${timesSuffix(n)}`,
  lose_title: (a, n) => `Lose ${titleNames(a.titles)}${timesSuffix(n)}`,
  // Metabasis
  use_warp: (a, n) => `Use ${warpNames(a)}${timesSuffix(n)}`,
  use_teleport: (a, n) => `Teleport${list(a.causes).length ? ` with ${joinWords(list(a.causes).map((c) => TELEPORT_CAUSES[c.toLowerCase()] ?? c.replace(/_/g, ' ')))}` : ''}${timesSuffix(n)}`,
  accept_teleport_request: (a, n) => `Accept ${n$(n)} teleport ${n === 1 ? 'request' : 'requests'}`,
  // RpgInv
  upgrade_bag: (a, n) => `Upgrade ${list(a.bags).length ? joinWords(list(a.bags).map(bagName)) : 'a bag'}${timesSuffix(n)}`,
  equip_accessory: (a, n) => `Put on ${keys(a.items, 'an accessory')}${timesSuffix(n)}`,
  toggle_auto_loot: (a, n) => `Switch auto loot ${str(a.state) === 'on' ? 'on' : str(a.state) === 'off' ? 'off' : 'on or off'}${timesSuffix(n)}`,
  unequip_accessory: (a, n) => `Take off ${keys(a.items, 'an accessory')}${timesSuffix(n)}`,
  use_rpg_button: (a, n) => `Click ${list(a.buttons).length ? `the ${joinWords(list(a.buttons).map((b) => b.replace(/_/g, ' ')))} button` : 'an inventory button'}${timesSuffix(n)}`,
  open_rpg_menu: (a, n) => `Open ${list(a.entries).length ? joinWords(list(a.entries).map((e) => titleCase(e.replace(/_/g, ' ')))) : 'an RPG Menu entry'}${timesSuffix(n)}`,
  // Convo
  talk_npc: (a, n) => `Talk to ${keys(a.npcs, 'an NPC')}${timesSuffix(n)}`,
  convo_start: (a, n) => `Start ${convoName(a)} with ${npcName(a)}${timesSuffix(n)}`,
  convo_finish: (a, n) => `Finish ${convoName(a)} with ${npcName(a)}${timesSuffix(n)}`,
  convo_answer: (a, n) => `Answer ${prettyKey(str(a.answer) ?? '') || 'a question'} in ${prettyKey(str(a.convo) ?? '') || 'a conversation'} with ${npcName(a)}${timesSuffix(n)}`,
  // Plutus
  plutus_loot: (a, n) => {
    const noun = n === 1 ? 'node' : 'nodes'
    const nodes = list(a.clusters).length ? `${n$(n)} ${plutusNames(a.clusters)} ${noun}` : n === 1 ? 'a Plutus node' : `${n$(n)} Plutus ${noun}`
    return `Loot ${nodes}${list(a.categories).length ? ` (${words(a.categories)})` : ''}`
  },
  plutus_loot_item: (a, n) => `Get ${n$(n)} ${keys(a.items, 'items')} from ${plutusSource(a)}`,
  plutus_group: (a, n) => `Trigger ${list(a.groups).length ? `the ${plutusNames(a.groups)} ${list(a.groups).length === 1 ? 'group' : 'groups'}` : 'a Plutus loot group'}${list(a.clusters).length ? ` at ${plutusNames(a.clusters)} nodes` : ''}${timesSuffix(n)}`,
  // Tyche
  kill_tyche_boss: (a, n) => `Defeat ${tycheTargets(a, 'a boss')}${timesSuffix(n)}${partyCredit(a)}`,
  kill_tyche_mob: (a, n) => `Kill ${n$(n)} ${tycheTargets(a, 'Tyche mobs')}${partyCredit(a)}`,
  // Hermes
  create_party: (_a, n) => `Create a party${timesSuffix(n)}`,
  join_party: (a, n) => `Join a party${num(a.min_size) !== undefined ? ` (${formatNumber(num(a.min_size)!)}+ members)` : ''}${timesSuffix(n)}`,
  invite_to_party: (_a, n) => `Invite ${n$(n)} ${n === 1 ? 'player' : 'players'} to a party`,
  leave_party: (a, n) => `Leave a party${partyReasons(a)}${timesSuffix(n)}`,
  take_party_role: (a, n) => `Take ${list(a.roles).length ? `the ${partyRoles(a.roles)} role` : 'a party role'}${timesSuffix(n)}`,
  become_party_leader: (_a, n) => `Become party leader${timesSuffix(n)}`,
  damage_tyche: (a, n) => `${a.count === 'hits' ? `Hit ${tycheTargets(a, 'bosses or mobs')}${timesSuffix(n)}` : `Deal ${n$(n)} damage to ${tycheTargets(a, 'bosses or mobs')}`}`,
  damaged_by_tyche: (a, n) => `${a.count === 'hits' ? `Get hit${timesSuffix(n)} by` : `Take ${n$(n)} damage from`} ${list(a.summoned_by).length ? `minions of ${keys(a.summoned_by, '')}` : tycheTargets(a, 'bosses or mobs')}`,
  killed_by_tyche: (a, n) => `Get killed by ${tycheTargets(a, 'a boss or mob')}${list(a.attacks).length ? ` (${words(a.attacks)})` : ''}${timesSuffix(n)}`,
  summon_tyche_boss: (a, n) => `Summon ${keys(a.bosses, 'a boss')}${timesSuffix(n)}`,
  reach_boss_phase: (a) => `Push ${keys(a.bosses, 'a boss')} into ${list(a.phases).length ? `the ${words(a.phases)} phase` : 'a new phase'}`,
  tyche_loot: (a, n) => `Get loot from ${list(a.tables).length ? keys(a.tables, '') : tycheTargets(a, 'Tyche loot tables')}${timesSuffix(n)}`,
  // Tyche NPCs (Tyche 1.24.0)
  interact_tyche_npc: (a, n) => `${NPC_CLICKS[str(a.click) ?? 'right'] ?? 'Click'} ${tycheNpcNames(a.npcs, 'an NPC')}${timesSuffix(n)}`,
  kill_tyche_npc: (a, n) => `Kill ${n$(n)} ${tycheNpcNames(a.npcs, 'Tyche NPCs')}${partyCredit(a)}`,
  tyche_npc_dies: (a, n) => `${titleCase(tycheNpcNames(a.npcs, 'an NPC'))} dies${timesSuffix(n)}`,
  interact_tyche_mob: (a, n) => `Interact with ${tycheTargets(a, 'a boss or mob')}${timesSuffix(n)}`,
  // Phantasos
  // finish_only: a skipped cutscene does not count
  watch_cutscene: (a, n) => `Watch ${cutsceneNames(a, 'a cutscene')}${a.finish_only === true ? ' (to the end)' : ''}${timesSuffix(n)}`,
  // A skip vote counts even when it does not end the cutscene
  skip_cutscene: (a, n) => `Skip ${cutsceneNames(a, 'a cutscene')}${timesSuffix(n)}`,
}

/** {@return the sentence for an objective (or fail.when entry), without its `display`} */
export function objectiveSentence(o: Tree, id?: string): string {
  const type = str(o.type) ?? 'unknown'
  const amount = num(o.amount) ?? 1
  if (type === 'custom') return id ? titleCase(id.replace(/_/g, ' ')) : 'A special task'
  const sentence = OBJECTIVES[type]
  return sentence ? sentence(o, amount) : `${prettyType(type)} × ${formatNumber(amount)}`
}

/** {@return the filters of an objective as a short hint, or undefined} */
export function filtersHint(filters: unknown): string | undefined {
  if (!isTree(filters)) return undefined
  const parts: string[] = []
  const w = filters.worlds
  if (Array.isArray(w) || typeof w === 'string') {
    if (list(w).length) parts.push(`in ${joinWords(list(w))}`)
  } else if (isTree(w)) {
    const values = list(w.values)
    if (values.length) parts.push(`${str(w.mode) === 'blacklist' ? 'not in' : 'in'} ${joinWords(values)}`)
  }
  if (isTree(filters.y)) {
    const min = num(filters.y.min)
    const max = num(filters.y.max)
    if (min !== undefined && max !== undefined) parts.push(`between Y ${min} and ${max}`)
    else if (max !== undefined) parts.push(`at Y ${max} or below`)
    else if (min !== undefined) parts.push(`at Y ${min} or above`)
  }
  const hand = isTree(filters.hand) ? filters.hand.items : filters.hand
  if (list(hand).length) parts.push(`holding ${keys(hand, '')}`)
  return parts.length ? titleCase(parts.join(' · ')) : undefined
}

/** The placeholders of an objective line on a page nobody is playing: progress 0 of `amount`. */
export function objectivePlaceholders(o: Tree, id: string): Record<string, string> {
  return { status: '•', current: '0', required: formatNumber(num(o.amount) ?? 1), id }
}

/** {@return an objective's line: its `display`, or a generated sentence; both start with the status bullet} */
export function describeObjective(id: string, o: Tree): Line {
  const display = str(o.display)
  const mini = display ? (/<status>/i.test(display) ? display : `<status> ${display}`) : `<status> ${escapeMiniMessage(objectiveSentence(o, id))}`
  return { mini, placeholders: objectivePlaceholders(o, id), hint: filtersHint(o.filters) }
}

/** {@return a fail.when entry's line} */
/** Fail conditions that read better in their own words (under "Fails if you:"). */
const FAIL_WHEN: Record<string, (a: Tree) => string> = {
  // Whoever kills it: "Fails if you: let Caravan Guard die"
  tyche_npc_dies: (a) => `Let ${tycheNpcNames(a.npcs, 'an NPC')} die`,
  leave_party: (a) => `Leave their party${partyReasons(a)}`,
}

export function describeFailWhen(o: Tree): Line {
  const display = str(o.display)
  const type = str(o.type) ?? ''
  return {
    mini: display ?? escapeMiniMessage(FAIL_WHEN[type] ? FAIL_WHEN[type](o) : objectiveSentence(o)),
    placeholders: objectivePlaceholders(o, ''),
    hint: filtersHint(o.filters),
  }
}

/** {@return a quest's objectives grouped by stage, lowest first} */
export function objectiveStages(objectives: unknown, stageSettings?: unknown): { stage: number; lines: (Line & { id: string })[]; rewards: Line[] }[] {
  if (!isTree(objectives)) return []
  const stages = new Map<number, (Line & { id: string })[]>()
  for (const [id, raw] of Object.entries(objectives)) {
    if (!isTree(raw)) continue
    const stage = num(raw.stage) ?? 0
    const lines = stages.get(stage) ?? []
    const line: Line & { id: string } = { id, ...describeObjective(id, raw) }
    // Its own rewards, as a hint under it
    const gives = rewardLines(raw.rewards).map((l) => plainText(l.mini, l.placeholders)).filter((t) => t !== '')
    if (gives.length > 0) line.hint = [line.hint, `Gives ${gives.join(', ')}`].filter(Boolean).join(' · ')
    lines.push(line)
    stages.set(stage, lines)
  }
  const settings = isTree(stageSettings) ? stageSettings : {}
  return [...stages.entries()].sort(([a], [b]) => a - b).map(([stage, lines]) => {
    const own = settings[String(stage)]
    return { stage, lines, rewards: isTree(own) ? rewardLines(own.rewards) : [] }
  })
}

// =========================================================================
// REQUIREMENTS (also fail.unless entries)
// =========================================================================

export const REQUIREMENTS: Record<string, (a: Tree) => string> = {
  // Chronos
  quest_completed: (a) => `Complete ${prettyKey(str(a.quest) ?? 'another quest')}`,
  quest_failed: (a) => {
    const times = Math.max(1, num(a.times) ?? 1)
    return `Fail ${prettyKey(str(a.quest) ?? 'another quest')}${times > 1 ? ` ${formatNumber(times)} times` : ''}`
  },
  permission: (a) => `Permission ${str(a.node) ?? '?'}`,
  vanilla_level: (a) => `Level ${compared(a)}`,
  has_item: (a) => `Have ${formatNumber(num(a.amount) ?? 1)} ${keys(a.items, 'items')}`,
  wearing: (a) => `Wear or hold ${keys(a.items, 'an item')}${str(a.slot) && str(a.slot) !== 'any' ? ` (${words(a.slot)})` : ''}`,
  health: (a) => `Health ${compared(a)}`,
  food: (a) => `Hunger ${compared(a)}`,
  potion_effect: (a) => `Have ${prettyKey(str(a.potion) ?? 'an effect')}${(num(a.level) ?? 1) > 1 ? ` ${str(a.level)}` : ''}`,
  gamemode: (a) => `Be in ${words(a.modes, 'a game mode')} mode`,
  advancement_done: (a) => `Advancement ${prettyKey(str(a.advancement) ?? '?')}`,
  statistic: (a) => `${titleCase(words(a.statistic, 'statistic'))}${str(a.target) ? ` (${prettyKey(str(a.target) as string)})` : ''} ${compared(a)}`,
  in_world: (a) => `Be in ${words(a.worlds, 'a world')}`,
  in_dimension: (a) => `Be in ${dimensions(a.dimensions, 'the right dimension')}`,
  in_biome: (a) => `Be in ${keys(a.biomes, 'a biome')}`,
  in_structure: (a) => `Be inside ${keys(a.structures, 'a structure')}`,
  entities_nearby: (a) => nearbyLine(a, list(a.entities).length ? keyNames(list(a.entities)) : 'living entities'),
  container_has_item: (a) => containerLine(a, keyNames(list(a.items))),
  near_location: (a) => `Be within ${str(a.radius) ?? '10'} blocks of ${[a.x, a.y, a.z].map((v) => str(v) ?? '?').join(', ')}${str(a.world) ? ` in ${str(a.world)}` : ''}`,
  time_of_day: (a) => str(a.period) === 'ticks' ? `Between ticks ${str(a.from) ?? '?'} and ${str(a.to) ?? '?'}` : `During the ${str(a.period) === 'night' ? 'night' : 'day'}`,
  weather: (a) => `While the weather is ${str(a.weather) ?? 'clear'}`,
  real_time: (a) => {
    const parts: string[] = []
    if (list(a.days).length) parts.push(`on ${joinWords(list(a.days).map((d) => titleCase(d.toLowerCase())))}`)
    if (str(a.from) || str(a.to)) parts.push(`from ${str(a.from) ?? '00:00'} to ${str(a.to) ?? '24:00'}`)
    if (str(a.start_date) || str(a.end_date)) parts.push(`between ${str(a.start_date) ?? 'now'} and ${str(a.end_date) ?? 'forever'}`)
    return parts.length ? titleCase(parts.join(', ')) : 'At any time'
  },
  quest_active: (a) => `${titleCase(prettyKey(str(a.quest) ?? 'another quest'))} is running`,
  quest_not_started: (a) => `Never started ${prettyKey(str(a.quest) ?? 'another quest')}`,
  quest_completions: (a) => `Completed ${prettyKey(str(a.quest) ?? 'a quest')} ${compared(a)} times`,
  pool_level: (a) => `${titleCase(prettyKey(str(a.quest_pool) ?? 'pool'))} level ${compared(a)}`,
  // ExperienceTailor
  level: (a) => {
    const min = num(a.min)
    const max = num(a.max)
    if (min !== undefined && max !== undefined) return `Level ${min}–${max}`
    if (max !== undefined) return `Level ${max} or lower`
    return `Level ${min ?? 0}+`
  },
  expertise: (a) => `${str(a.key) ?? '?'} expertise at least ${str(a.min) ?? '?'}`,
  stat: (a) => `${str(a.stat) ?? 'Stat'} ${compared(a)}`,
  pool: (a) => `${str(a.pool) ?? 'Pool'}${str(a.check) && str(a.check) !== 'current' ? ` ${str(a.check)}` : ''} ${compared(a)}`,
  effect: (a) => `${prettyKey(str(a.effect) ?? 'effect')} ${str(a.check) ?? 'stacks'} ${compared(a)}`,
  have_effect: (a) => `Have ${prettyKey(str(a.effect) ?? 'an effect')}`,
  not_have_effect: (a) => `Do not have ${prettyKey(str(a.effect) ?? 'an effect')}`,
  // Vulcan
  container_has_vulcan_item: (a) => containerLine(a, (str(a.item) ?? '?').trim().toLowerCase().replace(/^vulcan:/, '').replace(/_/g, ' ')),
  has_vulcan_item: (a) => `Have ${formatNumber(num(a.amount) ?? 1)} ${prettyKey(str(a.item) ?? 'item')}`,
  // Chrysos
  coins: (a) => `${titleCase(compared(a))} ${str(a.currency) ?? 'coins'}`,
  // Kleos
  reputation: (a) => `${titleCase(reputation(prettyKey(str(a.reputation) ?? '')))} ${compared(a)}`,
  // Crius
  has_title: (a) => `Owns the title ${titleName(a)}`,
  wearing_title: (a) => `Wears the title ${titleName(a)}`,
  // Metabasis
  can_use_warp: (a) => `Can use the warp ${prettyKey(str(a.warp) ?? '?')}`,
  // RpgInv
  bag_tier: (a) => `${bagName(str(a.bag) ?? '')} tier ${num(a.tier) ?? '?'} or higher`,
  wearing_accessory: (a) => `Wear ${keys(a.items, 'an accessory')}`,
  auto_loot: (a) => `Auto loot ${str(a.state) === 'off' ? 'off' : 'on'}`,
  // Plutus
  // Hermes
  in_party: (a) => `In a party${partySize(a)}`,
  party_leader: () => 'Leads their party',
  party_role: (a) => `Party role: ${partyRoles(a.roles) || 'any'}`,
  party_balanced: () => 'In a balanced party',
  party_members_near: (a) => {
    const amount = Math.max(1, num(a.amount) ?? 1)
    return `${formatNumber(amount)} party ${amount === 1 ? 'member' : 'members'} within ${formatNumber(Math.min(64, Math.max(1, num(a.radius) ?? 32)))} blocks`
  },
  plutus_pity: (a) => `Pity for ${titleCase(prettyKey(str(a.group) ?? '')) || 'a group'} ${compared(a)}`,
  // Tyche
  tyche_boss_kills: (a) => `Defeated ${prettyKey(str(a.boss) ?? 'a boss')} ${compared(a)} times`,
  tyche_mobs_nearby: (a) => nearbyLine(a, str(a.mob)?.trim() ? keyNames([str(a.mob)!]) : 'Tyche mobs'),
  tyche_bosses_nearby: (a) => nearbyLine(a, str(a.boss)?.trim() ? keyNames([str(a.boss)!]) : 'Tyche bosses'),
  near_tyche_npc: (a) => `Near ${tycheNpcName(a)} (${formatNumber(Math.min(64, Math.max(0, num(a.radius) ?? 16)))} blocks)`,
  tyche_npc_alive: (a) => `${titleCase(tycheNpcName(a))} is alive`,
  tyche_npc_in_combat: (a) => `${titleCase(tycheNpcName(a))} is fighting`,
  tyche_mob_kills: (a) => `Killed ${prettyKey(str(a.mob) ?? 'a mob')} ${compared(a)} times`,
  // Phantasos
  // Finished or skipped before
  seen_cutscene: (a) => `Watched ${cutsceneNames(a, 'a cutscene')}`,
  watching_cutscene: (a) => `Watching ${cutsceneNames(a, 'a cutscene')}`,
}

/** {@return a number as the plugin's menus write it: whole ones without .0} */
function plainNumber(n: number): string {
  return String(n)
}

/** {@return keys without their namespaces, _ as spaces: "zombie, cave spider" (PlaceRequirements.names)} */
function keyNames(keys: string[]): string {
  return keys.map((k) => k.slice(k.indexOf(':') + 1).replace(/_/g, ' ')).join(', ')
}

/** {@return " of <world> <x> <y> <z>" for a spot (a world given), or "" around the player} */
function spotLine(a: Tree): string {
  const world = str(a.world)?.trim()
  if (!world) return ''
  return ` of ${world} ${[a.x, a.y, a.z].map((v) => plainNumber(num(v) ?? 0)).join(' ')}`
}

/**
 * {@return a nearby requirement's line, like the plugin's menus: "At least 3 zombie within 10 blocks", "No Tyche mobs
 * within 16 blocks of arena 0 64 0"}
 */
function nearbyLine(a: Tree, what: string): string {
  const op = str(a.compare) ?? '>='
  const value = Math.trunc(num(a.value) ?? 1)
  const count = value === 0 && (op === '<=' || op === '==') ? 'No' : `${titleCase(COMPARE[op] ?? 'at least')} ${value}`
  const radius = Math.min(64, Math.max(0.5, num(a.radius) ?? 10))
  return `${count} ${what} within ${plainNumber(radius)} blocks${spotLine(a)}`
}

/** {@return a container requirement's line: "The container at arena 10 64 -5 holds 16x diamond"} */
function containerLine(a: Tree, what: string): string {
  const at = spotLine(a).slice(' of'.length) || ' ?'
  return `The container at${at} holds ${Math.max(1, Math.trunc(num(a.amount) ?? 1))}x ${what}`
}

/** Requirements whose reversed line has words of its own (else "Not: <line>"). */
const REVERSED: Record<string, (a: Tree) => string> = {
  in_party: (a) => `Not in a party${partySize(a)}`,
  seen_cutscene: (a) => `Hasn't watched ${cutsceneNames(a, 'a cutscene')} yet`,
  watching_cutscene: (a) => `Not watching ${cutsceneNames(a, 'a cutscene')}`,
}

const QUEST_REFERENCES = new Set(['quest_completed', 'quest_failed', 'quest_active', 'quest_not_started', 'quest_completions'])

function genericLine(type: string, a: Tree): string {
  const args = Object.entries(a)
    .filter(([k]) => k !== 'type' && k !== 'display' && k !== 'not')
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${list(v).join(', ') || (isTree(v) ? '…' : '')}`.trim())
  return args.length ? `${prettyType(type)}: ${args.join(', ')}` : prettyType(type)
}

/**
 * {@return a requirement's line (also for fail.unless)}: reversed (not: true) it reads "Not: <its line>"; a group
 * is one line, "All of: A; B" / reversed "Not all of: A; B", or for any: "Any of: A; B" / reversed "None of: A; B".
 * A display replaces the line.
 */
export function describeRequirement(r: Tree): Line {
  if ('all' in r || 'any' in r) return describeGroup(r)
  const type = str(r.type) ?? 'unknown'
  const sentence = REQUIREMENTS[type]
  const display = str(r.display)
  const quest = QUEST_REFERENCES.has(type) ? str(r.quest) : undefined
  const line = escapeMiniMessage(sentence ? sentence(r) : genericLine(type, r))
  // Some read better reversed in their own words ("Not in a party")
  const reversed = r.not === true ? (REVERSED[type] ? escapeMiniMessage(REVERSED[type](r)) : escapeMiniMessage('Not: ') + line) : line
  return {
    mini: display ?? reversed,
    ...(quest ? { quest } : {}),
  }
}

/** {@return how a group's line starts: All of, Not all of, Any of or None of (a reversed any)} */
export function groupLabel(mode: 'all' | 'any', not: boolean): string {
  if (mode === 'any') return not ? 'None of' : 'Any of'
  return not ? 'Not all of' : 'All of'
}

function describeGroup(group: Tree): Line {
  const mode = 'all' in group ? 'all' : 'any'
  const list = group[mode]
  // A group inside it reads in parentheses: "All of: A; (Any of: B; C)"
  const members = Array.isArray(list) ? list.filter(isTree).map((m) => {
    const line = describeRequirement(m)
    return 'all' in m || 'any' in m ? { ...line, mini: `(${line.mini})` } : line
  }) : []
  const display = str(group.display)
  // A quest link only when the group names one quest
  const quests = [...new Set(members.map((m) => m.quest).filter((q): q is string => q !== undefined))]
  return {
    mini: display ?? escapeMiniMessage(`${groupLabel(mode, group.not === true)}: `) + members.map((m) => m.mini).join('; '),
    ...(quests.length === 1 ? { quest: quests[0] } : {}),
  }
}

// =========================================================================
// REWARDS
// =========================================================================

/** Rewards that only make noise or run something: hidden unless they have a `display`. */
export const SILENT_REWARDS = new Set([
  'command', 'message', 'title', 'sound', 'broadcast', 'firework', 'set_time', 'set_weather', 'lightning',
  // Tyche NPCs
  'set_npc_hostility', 'teleport_to_npc', 'hold_tyche_npc',
  // Quest flow
  'fail_quest', 'abandon_quest', 'complete_quest', 'reset_quest', 'progress_objective',
  // World
  'set_block', 'explosion', 'particles',
  // Player
  'actionbar', 'take_item', 'remove_potion_effect', 'clear_potion_effects',
  // Plugins
  'reset_reputation', 'take_coins', 'take_title', 'equip_title', 'set_warp_enabled', 'start_convo', 'set_hud',
])

export const REWARDS: Record<string, (a: Tree) => string> = {
  // Chronos
  item: (a) => `${formatNumber(num(a.amount) ?? 1)}× ${prettyKey(str(a.item) ?? 'item')}`,
  items: (a) => `${formatNumber(num(a.amount) ?? 1)}× each of ${joinWords(list(a.items).map(prettyKey), 'and') || 'items'}`,
  vanilla_experience: (a) => `${formatNumber(num(a.amount) ?? 0)} XP`,
  vanilla_levels: (a) => `${formatNumber(num(a.amount) ?? 0)} ${num(a.amount) === 1 ? 'level' : 'levels'}`,
  potion_effect: (a) => `${titleCase(prettyKey(str(a.potion) ?? 'effect'))} ${str(a.level) ?? '1'} (${a.infinite === true ? 'until removed' : humanDuration(a.duration ?? '30s')})`,
  heal: (a) => num(a.amount) === undefined ? 'Full health' : `${formatNumber(num(a.amount) as number)} health`,
  feed: (a) => num(a.amount) === undefined ? 'Full hunger' : `${formatNumber(num(a.amount) as number)} food`,
  teleport: (a) => `Teleport to ${str(a.world) ?? 'another place'}`,
  start_quest: (a) => `Starts ${prettyKey(str(a.quest) ?? 'the next quest')}`,
  summon_mob: (a) => `${formatNumber(num(a.amount) ?? 1)}× ${prettyKey(str(a.entity) ?? 'mob')}`,
  custom_item: (a) => `${formatNumber(num(a.amount) ?? 1)}× ${(str(a.name) ? plainText(str(a.name) as string).trim() : '') || prettyKey(str(a.item) ?? 'item')}`,
  // ExperienceTailor
  experience: (a) => `${formatNumber(num(a.amount) ?? 0)} experience`,
  give_effect: (a) => `${titleCase(prettyKey(str(a.effect) ?? 'effect'))}${(num(a.level) ?? 1) > 1 ? ` ${str(a.level)}` : ''}${a.infinite === true ? ' (until removed)' : str(a.duration) ? ` (${humanDuration(a.duration)})` : ''}`,
  remove_effect: (a) => `Removes ${prettyKey(str(a.effect) ?? 'an effect')}`,
  clear_effects: (a) => `Clears ${str(a.category) ?? 'all'} effects`,
  restore_pool: (a) => num(a.amount) === undefined ? `Fills ${str(a.pool) ?? 'a pool'}` : `Restores ${formatNumber(num(a.amount) as number)} ${str(a.pool) ?? ''}`.trim(),
  // Vulcan
  vulcan_item: (a) => `${formatNumber(num(a.amount) ?? 1)}× ${prettyKey(str(a.item) ?? 'item')}${str(a.quality) && !['random', 'none'].includes(str(a.quality) as string) ? ` (${str(a.quality)})` : ''}`,
  vulcan_items: (a) => `${formatNumber(num(a.amount) ?? 1)}× each of ${joinWords(list(a.items).map(prettyKey), 'and') || 'Vulcan items'}${str(a.quality) && !['random', 'none'].includes(str(a.quality) as string) ? ` (${str(a.quality)})` : ''}`,
  // Chrysos
  coins: (a) => `${formatNumber(num(a.amount) ?? 0)} ${str(a.currency) ?? 'coins'}`,
  // Kleos
  reputation: (a) => `${(num(a.amount) ?? 0) > 0 ? '+' : ''}${formatNumber(num(a.amount) ?? 0)} ${reputation(prettyKey(str(a.reputation) ?? ''))}`,
  // Crius
  give_title: (a) => `Title: ${titleName(a)}${str(a.duration) && str(a.duration) !== '0' ? ` (${humanDuration(str(a.duration)!)})` : ''}`,
  // Metabasis
  warp: (a) => `Teleport to ${prettyKey(str(a.warp) ?? 'a warp')}`,
  spawn: (a) => (str(a.world) ? `Teleport to ${prettyKey(str(a.world) as string)} spawn` : 'Teleport to spawn'),
  // RpgInv
  set_bag_tier: (a) => `${bagName(str(a.bag) ?? '')} tier ${num(a.tier) ?? '?'}`,
  // Kleos
  set_reputation: (a) => `${titleCase(reputation(prettyKey(str(a.reputation) ?? '')))} set to ${num(a.value) === undefined ? str(a.value) ?? '?' : formatNumber(num(a.value) as number)}`,
  // Plutus
  plutus_loot: (a) => {
    const cluster = str(a.cluster)?.trim()
    const group = str(a.group)?.trim()
    const what = cluster ? `${titleCase(prettyKey(cluster))} loot` : group ? `${titleCase(prettyKey(group))} group loot` : 'Plutus loot'
    return `${(num(a.rolls) ?? 1) > 1 ? `${formatNumber(num(a.rolls) as number)} rolls of ` : ''}${what}`
  },
  // Tyche
  tyche_loot: (a) => `${(num(a.rolls) ?? 1) > 1 ? `${formatNumber(num(a.rolls) as number)} rolls of ` : ''}${prettyKey(str(a.table) ?? 'Tyche')} loot`,
  summon_tyche_boss: (a) => `Summons ${prettyKey(str(a.boss) ?? 'a boss')}`,
  summon_tyche_mob: (a) => `${formatNumber(num(a.amount) ?? 1)}× ${prettyKey(str(a.mob) ?? 'mob')}`,
  // Phantasos
  // party: the player's Hermes party watches too; force: the cutscene's requirements are ignored
  play_cutscene: (a) => `Plays ${cutsceneNames(a, 'a cutscene')}${a.party === true ? ' (with their party)' : ''}${a.force === true ? ' (forced)' : ''}`,
  stop_cutscene: (a) => `Stops ${cutsceneNames(a, 'the cutscene')}`,
  mark_cutscene_seen: (a) => `Counts ${cutsceneNames(a, 'a cutscene')} as watched`,
}

/**
 * {@return a reward's line, or null for a silent reward without `display`}: a reward with requirements (an optional
 * reward) says when it is given: "3x Diamond, only if: Permission rank.vip".
 */
export function describeReward(r: Tree): Line | null {
  const line = rewardLine(r)
  return line ? onlyIf(party(line, r), r) : null
}

/** {@return a line with " (party)" after it for a party reward (" (party, 32 blocks)" with a range, " (party, anywhere)" for 0)} */
function party(line: Line, r: Tree): Line {
  // A type's own party argument is not a party reward: its sentence says what it does
  if (r.party !== true || hasOwnParty(str(r.type) ?? '')) return line
  const range = num(r.party_range)
  const where = range === undefined ? '' : range === 0 ? ', anywhere' : `, ${formatNumber(range)} blocks`
  return { ...line, mini: `${line.mini}${escapeMiniMessage(` (party${where})`)}` }
}

/** {@return a line with its reward's condition after it: ", only if: A; B" (nothing without requirements)} */
function onlyIf(line: Line, r: Tree): Line {
  const conditions = requirementLines(r.requirements)
  if (conditions.length === 0) return line
  return { ...line, mini: `${line.mini}${escapeMiniMessage(', only if: ')}${conditions.map((c) => c.mini).join('; ')}` }
}

function rewardLine(r: Tree): Line | null {
  const type = str(r.type) ?? 'unknown'
  const display = str(r.display)
  const quest = type === 'start_quest' ? str(r.quest) : undefined
  const extra = quest ? { quest } : {}
  if (display) return { mini: display, ...extra }
  if (SILENT_REWARDS.has(type)) return null
  const sentence = REWARDS[type]
  return { mini: escapeMiniMessage(sentence ? sentence(r) : genericLine(type, r)), ...extra }
}

/** What the silent actions do, for the creator's nodes (players never see these). */
export const ACTIONS: Record<string, (a: Tree) => string> = {
  // Tyche NPCs
  set_npc_hostility: (a) => {
    const hostility = (str(a.hostility) ?? 'hostile').toLowerCase()
    return `${titleCase(tycheNpcName(a))} turns ${HOSTILITIES.includes(hostility) ? hostility : 'hostile'}`
  },
  teleport_to_npc: (a) => `Teleport to ${tycheNpcName(a)}`,
  hold_tyche_npc: (a) => `${titleCase(tycheNpcName(a))} waits ${formatNumber(Math.min(600, Math.max(1, num(a.seconds) ?? 10)))}s, facing the player`,
  command: (a) => `Runs /${(str(a.run) ?? '').replace(/^\//, '')}${str(a.as) === 'player' ? ' as the player' : ''}`,
  message: (a) => `Tells the player "${plainish(str(a.text))}"`,
  broadcast: (a) => `Tells everyone "${plainish(str(a.text))}"`,
  title: (a) => `Shows the title "${plainish(str(a.title) ?? str(a.subtitle))}"`,
  sound: (a) => `Plays ${prettyKey(str(a.sound) ?? 'a sound')}${hasPlace(a) ? atPlace(a) : ''}`,
  firework: (a) => `Bursts a firework${hasPlace(a) ? atPlace(a) : ''}`,
  set_time: (a) => {
    const ticks = num(a.ticks)
    if (ticks !== undefined && a.add === true) return `Moves the time on by ${formatNumber(ticks)} ticks${inWorld(a)}`
    return `Sets the time to ${ticks !== undefined ? `${formatNumber(ticks)} ticks` : str(a.time) ?? '?'}${inWorld(a)}`
  },
  set_weather: (a) => `Sets the weather to ${str(a.weather) ?? '?'}${inWorld(a)}${str(a.duration) ? ` for ${humanDuration(str(a.duration)!)}` : ''}`,
  lightning: (a) => `${a.damage === true ? 'Strikes lightning' : 'Lightning (harmless)'}${atPlace(a)}`,
  // Quest flow
  fail_quest: (a) => `Fails ${questName(a)}${str(a.reason) ? ` ("${plainish(str(a.reason))}")` : ''}`,
  abandon_quest: (a) => `Abandons ${questName(a)}`,
  complete_quest: (a) => `Completes ${questName(a)}`,
  reset_quest: (a) => `Resets ${questName(a)}`,
  progress_objective: (a) => `Adds ${formatNumber(num(a.amount) ?? 1)} to ${prettyKey(str(a.objective) ?? 'an objective')} of ${questName(a)}`,
  // World
  set_block: (a) => `Sets ${prettyKey(str(a.block) ?? 'a block')}${atPlace(a)}`,
  explosion: (a) => {
    const parts: string[] = []
    if (num(a.power) !== undefined) parts.push(`power ${formatNumber(num(a.power) as number)}`)
    if (a.damage !== true) parts.push('harmless')
    if (a.break_blocks === true) parts.push('breaks blocks')
    if (a.fire === true) parts.push('fire')
    return `Explosion${parts.length ? ` (${parts.join(', ')})` : ''}${atPlace(a)}`
  },
  particles: (a) => `Shows ${formatNumber(num(a.count) ?? 20)} ${str(a.particle) ? `${prettyKey(str(a.particle) as string)} ` : ''}particles${atPlace(a)}`,
  // Player
  actionbar: (a) => `Tells the action bar "${plainish(str(a.text))}"`,
  take_item: (a) => `Takes ${formatNumber(num(a.amount) ?? 1)}× ${keys(a.items, 'items')}`,
  remove_potion_effect: (a) => `Removes ${prettyKey(str(a.potion) ?? 'an effect')}`,
  clear_potion_effects: () => 'Clears all potion effects',
  // Kleos
  reset_reputation: (a) => `Resets ${reputation(prettyKey(str(a.reputation) ?? ''))}`,
  // Crius
  take_title: (a) => `Takes the title ${titleName(a)}`,
  equip_title: (a) => `Puts on the title ${titleName(a)}`,
  // Metabasis
  set_warp_enabled: (a) => `${a.enabled === false ? 'Closes' : 'Opens'} the warp ${prettyKey(str(a.warp) ?? '?')}`,
  // ExperienceTailor
  set_hud: (a) => (a.hidden === false ? 'Shows the HUD' : 'Hides the HUD'),
  // Convo
  start_convo: (a) => `Starts the conversation ${prettyKey(str(a.convo) ?? '') || '?'} of ${npcName(a)}`,
  // Chrysos
  take_coins: (a) => `Takes ${formatNumber(num(a.amount) ?? 0)} ${str(a.currency) ?? 'coins'}${str(a.reason) ? ` ("${plainish(str(a.reason))}")` : ''}`,
}

/** {@return the quest a quest-flow action works on, in words} */
function questName(a: Tree): string {
  return prettyKey(str(a.quest) ?? 'the quest')
}

function plainish(text: string | undefined): string {
  // Formatting tags go; the placeholders players see filled in stay
  const t = (text ?? '').replace(/<(?!player>|quest>)[^>]+>/g, '').trim()
  return t.length > 40 ? `${t.slice(0, 39)}…` : t
}

function inWorld(a: Tree): string {
  return str(a.world) ? ` in ${str(a.world)}` : ''
}

/** {@return true when an action names a place (a world or coordinates)} */
function hasPlace(a: Tree): boolean {
  return str(a.world) !== undefined || num(a.x) !== undefined || num(a.y) !== undefined || num(a.z) !== undefined
}

/** {@return where an action happens: " at 100, 64, -20 in world", or " at the player"} */
function atPlace(a: Tree): string {
  const [x, y, z] = [num(a.x), num(a.y), num(a.z)]
  if (x !== undefined && y !== undefined && z !== undefined) return ` at ${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)}${inWorld(a)}`
  return str(a.world) ? ` at the spawn of ${str(a.world)}` : ' at the player'
}

/** Rewards with a player's line that also say where on the node (summons). */
const PLACED = new Set(['summon_mob', 'summon_tyche_boss', 'summon_tyche_mob'])

/**
 * {@return a reward or callback as the creator shows it on its node: the player's line, or for a silent action what
 * it does (a command, a broadcast, the time, lightning); summons and world actions also say where}
 */
export function describeAction(r: Tree): Line {
  const type = str(r.type) ?? 'unknown'
  const line = rewardLine(r)
  if (line && PLACED.has(type) && !str(r.display)) return onlyIf(party({ ...line, mini: line.mini + escapeMiniMessage(atPlace(r)) }, r), r)
  if (line) return onlyIf(party(line, r), r)
  const sentence = ACTIONS[type]
  return onlyIf(party({ mini: escapeMiniMessage(sentence ? sentence(r) : prettyType(type)) }, r), r)
}

/** {@return the shown lines of a reward list} */
export function rewardLines(rewards: unknown): Line[] {
  if (!Array.isArray(rewards)) return []
  return rewards.filter(isTree).map(describeReward).filter((l): l is Line => l !== null)
}

/** {@return the lines of a requirement list} */
export function requirementLines(requirements: unknown): Line[] {
  if (!Array.isArray(requirements)) return []
  return requirements.filter(isTree).map(describeRequirement)
}

// =========================================================================
// FAIL CONDITIONS AND POOL LEVELS
// =========================================================================

export interface FailInfo {
  when: Line[]
  unless: Line[]
  /** What failing does (fail.actions). */
  then: Line[]
  /** What failing costs, e.g. "Progress is lost and the quest locks for 1 hour". */
  result: string
}

/** {@return a quest's fail block in lines, or null when it has none} */
export function describeFail(fail: unknown): FailInfo | null {
  if (!isTree(fail)) return null
  const when = Array.isArray(fail.when) ? fail.when.filter(isTree).map(describeFailWhen) : []
  const unless = requirementLines(fail.unless)
  const then = rewardLines(fail.actions)
  if (when.length === 0 && unless.length === 0 && then.length === 0) return null
  const result = str(fail.result) === 'cooldown'
    ? `Progress is lost and the quest locks for ${humanDuration(fail.cooldown)}.`
    : 'Progress is lost; you can start again right away.'
  return { when, unless, result, then }
}

export interface LevelInfo {
  level: number
  /** Completed quests needed. */
  needs: number
  rewards: Line[]
}

/** {@return a pool's levels with the rewards of each (`default` rewards first)} */
export function poolLevels(pool: Tree): { levels: LevelInfo[]; everyLevel: Line[] } {
  const levels = isTree(pool.levels) ? pool.levels : null
  if (!levels) return { levels: [], everyLevel: [] }
  const thresholds = Array.isArray(levels.thresholds) ? levels.thresholds.map(num).filter((n): n is number => n !== undefined) : []
  const rewards = isTree(levels.rewards) ? levels.rewards : {}
  return {
    everyLevel: rewardLines(rewards.default),
    levels: thresholds.map((needs, i) => ({ level: i + 1, needs, rewards: rewardLines(rewards[String(i + 1)]) })),
  }
}

/** The badges of a quest, in order. */
export interface Badge {
  label: string
  tone: Tone | 'accent' | 'neutral'
}

export function questBadges(q: Tree): Badge[] {
  const badges: Badge[] = []
  const difficulty = str(q.difficulty)
  if (difficulty) badges.push({ label: difficultyLabel(difficulty), tone: difficultyTone(difficulty) })
  if (q.repeatable === true) badges.push({ label: 'Repeatable', tone: 'accent' })
  if (q.repeatable === true && str(q.cooldown) && str(q.cooldown) !== '0') badges.push({ label: `Cooldown ${humanDuration(q.cooldown)}`, tone: 'neutral' })
  if (str(q.time_limit) && str(q.time_limit) !== '0') badges.push({ label: `Time limit ${humanDuration(q.time_limit)}`, tone: 'neutral' })
  if (q.auto_start === true) badges.push({ label: 'Starts automatically', tone: 'neutral' })
  if (q.no_teleport === true) badges.push({ label: 'No teleporting', tone: 'neutral' })
  if (q.hidden_until_unlocked === true) badges.push({ label: 'Hidden until unlocked', tone: 'neutral' })
  // scope: account (ExperienceTailor characters share it); a timed or account pool decides instead
  if (str(q.scope)?.trim().toLowerCase() === 'account') badges.push({ label: 'Shared by characters', tone: 'neutral' })
  return badges
}
