/**
 * The web creator's data, shared by the Worker and the site.
 *
 * The catalog is what /chronos cl types sends: the server's quest types with their arguments, a quest's own fields,
 * Chronos's pick lists and the vanilla keys. Each argument's `pick` says where its values come from:
 *   refs:<provider>:<kind>   another plugin's ids (/chronos cl refs <provider>); paths when the argument has a scope
 *   list:chronos:<kind>      catalog.lists
 *   vanilla:items|blocks     catalog.vanilla
 *   d1:quests | d1:pools     the definitions in D1 (quests are only checked by id, never listed)
 */
import type { RefIndex, RefLabels } from './api'

export type Tree = Record<string, unknown>

export const CATALOG_SECTIONS = ['types', 'quest_fields', 'server', 'lists', 'vanilla'] as const
export type CatalogSection = (typeof CATALOG_SECTIONS)[number]

export type ParamKind = 'STRING' | 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DURATION' | 'CHOICE' | 'STRING_LIST' | 'ITEM'
  | 'BLOCK' | 'ITEM_LIST' | 'BLOCK_LIST' | 'ENTITY_LIST' | 'QUEST'

export type Category = 'objective' | 'requirement' | 'reward'

export interface ParamDto {
  name: string
  kind: ParamKind
  required: boolean
  /** As written in YAML, or null. */
  default: string | null
  choices?: string[]
  min: number | null
  description: string
  pick?: string[]
  /** Item or entity keys of this namespace only (vulcan: a Vulcan item type takes vulcan:<id> and nothing else). */
  only?: string
  /** With only: tags of that namespace are allowed too (#minecraft:logs). */
  tags?: boolean
  /** What it reads when it is filled in (spot: a place away from the player); a use that refuses one hides it. */
  reads?: string[]
  /**
   * Sibling arguments of the same entry that narrow this one, outermost first (an answer: ['npc', 'convo']). Its refs
   * ids are then paths, `<npc>/<convo>/<answer>`, and the value is the last part.
   */
  scope?: string[]
}

export interface TypeDto {
  id: string
  owner: string
  description: string
  /** An item key, e.g. minecraft:iron_pickaxe. */
  icon: string
  params: ParamDto[]
  /** What it always reads (spot: a place away from the player); a use that refuses one does not offer it. */
  reads?: string[]
}

export interface TypesSection {
  chronos: string
  /** Chronos first, then the hooked plugins. */
  owners: string[]
  objective: TypeDto[]
  requirement: TypeDto[]
  reward: TypeDto[]
  /** "item:vulcan" / "entity:tyche" → the refs source holding their ids. */
  keySources: Record<string, string>
  /** Where a requirement can sit (start, auto_start, fail_unless, reward) → the traits it accepts there. */
  requirementUses?: Record<string, string[]>
}

export interface QuestFieldsSection {
  fields: ParamDto[]
  fail: ParamDto[]
  /** An objective's filters, as the in-game editor offers them: worlds, mode, hand, min, max. */
  filters?: ParamDto[]
  messages: string[]
  notices: { events: string[]; parts: Record<string, ParamDto[]> }
}

export interface ServerSection {
  name: string
  minecraft: string
  difficulties: string[]
  /** config.yml's notices: what a quest's notices lay over. */
  notices: Record<string, Record<string, unknown>>
}

export type ListsSection = Record<string, string[]>

export interface VanillaSection {
  items: string[]
  blocks: string[]
  entities: string[]
  itemTags: string[]
  blockTags: string[]
  entityTags: string[]
}

export interface Catalog {
  types?: TypesSection
  quest_fields?: QuestFieldsSection
  server?: ServerSection
  lists?: ListsSection
  vanilla?: VanillaSection
}

export interface PoolRef {
  id: string
  name: string
  type: string
}

export interface CatalogResponse {
  ok: true
  catalog: Catalog
  syncedAt: Partial<Record<CatalogSection, number>>
  refs: RefIndex
  /** Display names of reference ids (an NPC's name), shown beside the id in pick lists. */
  refLabels: RefLabels
  pools: PoolRef[]
}

/** A problem with a quest, like the plugin's: errors keep it out of the game, warnings do not. */
export interface Problem {
  path: string
  message: string
  error: boolean
}

/** Where a quest's parts sit inside its box, and the parts not connected to anything (never in the quest). */
export interface QuestLayout {
  v: 1
  positions: Record<string, { x: number; y: number }>
  loose?: unknown[]
}

export interface QuestDoc {
  id: string
  body: Tree
  layout: QuestLayout | null
  updatedAt: number
  updatedBy: string | null
  source: 'server' | 'web'
  /** Saved on the web since the game last downloaded it. */
  webPending: boolean
}

export interface WorkspaceBox {
  id: string
  x: number
  y: number
  open: boolean
  /** A size the box was resized to (never below what its parts need). */
  width?: number
  height?: number
}

export interface WorkspaceBody {
  v: 1
  quests: WorkspaceBox[]
  viewport?: { x: number; y: number; zoom: number }
}

export interface WorkspaceDoc {
  name: string
  body: WorkspaceBody
  createdBy: string | null
  updatedAt: number
  updatedBy: string | null
}

/** One of the signed-in person's own workspaces. */
export interface WorkspaceSummary {
  name: string
  quests: number
  updatedAt: number
  updatedBy: string | null
}

export interface QuestSave {
  id: string
  body: Tree
  layout: QuestLayout | null
  /** The updatedAt it was loaded with; null for a new quest. */
  baseUpdatedAt: number | null
}

export interface SaveRequest {
  workspace?: { name: string; body: WorkspaceBody; baseUpdatedAt: number | null }
  quests: QuestSave[]
}

export type SaveResponse =
  | { ok: true; quests: QuestDoc[]; workspace: WorkspaceDoc | null; warnings: Record<string, Problem[]> }
  /** 422: nothing was written. */
  | { ok: false; error: string; problems: Record<string, Problem[]> }
  /** 409: someone saved in between; nothing was written. */
  | { ok: false; error: string; conflicts: { quests: (QuestDoc | { id: string; missing: true })[]; workspace: WorkspaceDoc | null } }

export const WORKSPACE_NAME = /^[a-z0-9_-]{1,64}$/
export const QUEST_ID = /^[a-z0-9_]{1,64}$/
export const MAX_SAVE_QUESTS = 25
export const MAX_QUEST_BYTES = 256_000
export const MAX_LAYOUT_BYTES = 128_000
export const MAX_WORKSPACE_BYTES = 256_000
export const MAX_FETCH_QUESTS = 50
