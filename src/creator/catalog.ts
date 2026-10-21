/**
 * What the server knows, as the editor uses it: the types by category and owner, and the values an argument can
 * take (its `pick` sources). Quests are never listed: a quest field suggests the workspace's own quests only.
 */
import type { CatalogResponse, Category, ParamDto, TypeDto } from '../../shared/creator'
import type { Value } from '../../shared/quest/canonical'
import { scopePath } from '../../shared/quest/validate'

export const BUILTIN_OWNER = 'Chronos'

export function ownerLabel(owner: string): string {
  return owner === BUILTIN_OWNER ? 'Built-in (Chronos)' : owner
}

/** Types easy to take for another: the note shows while the other one is installed too. */
const TYPE_NOTES: { category: Category; type: string; other: string; note: string }[] = [
  // Clicks on a Tyche NPC count even mid-conversation; Convo's talk_npc counts talking
  { category: 'objective', type: 'interact_tyche_npc', other: 'talk_npc', note: 'To count talking through Convo, use talk_npc' },
]

export class CatalogView {
  private readonly types: Record<Category, Map<string, TypeDto>>

  constructor(readonly response: CatalogResponse) {
    const index = (list: TypeDto[] | undefined) => new Map((list ?? []).map((t) => [t.id, t]))
    const t = response.catalog.types
    this.types = { objective: index(t?.objective), requirement: index(t?.requirement), reward: index(t?.reward) }
  }

  /** {@return true once /chronos cl types has sent the types} */
  get ready(): boolean {
    return this.response.catalog.types !== undefined
  }

  get owners(): string[] {
    return this.response.catalog.types?.owners ?? [BUILTIN_OWNER]
  }

  get pools() {
    return this.response.pools
  }

  get difficulties(): string[] {
    return this.response.catalog.server?.difficulties ?? []
  }

  list(category: Category): TypeDto[] {
    return [...this.types[category].values()]
  }

  type(category: Category, id: string): TypeDto | undefined {
    return this.types[category].get(id)
  }

  /** {@return a note on a type easy to take for another one the server has too, or undefined} */
  note(category: Category, id: string): string | undefined {
    const note = TYPE_NOTES.find((n) => n.category === category && n.type === id)
    return note && this.type(category, note.other) ? note.note : undefined
  }

  /** {@return the providers whose ids an argument wants but /chronos cl refs has not sent} */
  /**
   * {@return the plugins whose /chronos cl refs fills this argument's choices: its pick lists, and other plugins' keys
   * offered in item and entity lists (vulcan:<item>, tyche:<mob>, convo:<npc>)}
   */
  refProviders(param: ParamDto): string[] {
    const providers = new Set<string>()
    for (const source of param.pick ?? []) {
      if (!source.startsWith('refs:')) continue
      const provider = source.split(':')[1]
      if (provider) providers.add(provider)
    }
    const keys = param.kind === 'ENTITY_LIST' ? 'entity:' : param.kind === 'ITEM' || param.kind === 'ITEM_LIST' ? 'item:' : null
    if (keys) {
      for (const [key, source] of Object.entries(this.response.catalog.types?.keySources ?? {})) {
        if (!key.startsWith(keys) || (param.only && key !== `${keys}${param.only}`)) continue
        const provider = source.split(':')[1]
        if (provider) providers.add(provider)
      }
    }
    return [...providers].sort()
  }

  missingRefs(param: ParamDto): string[] {
    const missing = new Set<string>()
    for (const source of param.pick ?? []) {
      if (!source.startsWith('refs:')) continue
      const [, provider, kind] = source.split(':')
      if (provider && kind && !this.response.refs[provider]?.[kind]) missing.add(provider)
    }
    return [...missing]
  }

  /**
   * {@return the values to offer for an argument, with the display names /chronos cl refs sent}
   *
   * An argument with a `scope` (a conversation under an NPC) offers the ids under its scoping siblings' values once
   * all of them are set, by their last part; until then it offers every id by its last part, with its path as a hint.
   *
   * @param quests   The workspace's quest ids (for quest arguments; D1's are never listed).
   * @param siblings The entry's argument values by name (for a scoped argument).
   */
  suggestions(param: ParamDto, quests: string[] = [], siblings: Record<string, Value | undefined> = {}): Suggestion[] {
    const out = new Map<string, Suggestion>()
    const add = (value: string, label?: string, hint?: string) => {
      const key = hint === undefined ? value : `${value}\u0000${hint}`
      const known = out.get(key)
      if (!known) out.set(key, { value, ...(label !== undefined ? { label } : {}), ...(hint !== undefined ? { hint } : {}) })
      else if (known.label === undefined && label !== undefined) known.label = label
    }
    const labels = this.response.refLabels ?? {}
    const catalog = this.response.catalog
    const isList = param.kind === 'ITEM_LIST' || param.kind === 'BLOCK_LIST' || param.kind === 'ENTITY_LIST'
    const scope = scopePath(param, siblings)
    for (const choice of param.choices ?? []) add(choice)
    for (const source of param.pick ?? []) {
      const [where, a, b] = source.split(':')
      if (where === 'vanilla' && a === 'items') {
        catalog.vanilla?.items.forEach((k) => add(k))
        // Tags too, unless only one namespace's items count (a vanilla-only list may still take vanilla tags)
        if (isList && (!param.only || (param.tags && param.only === 'minecraft'))) catalog.vanilla?.itemTags.forEach((k) => add(k))
      } else if (where === 'vanilla' && a === 'blocks') {
        catalog.vanilla?.blocks.forEach((k) => add(k))
        if (isList) catalog.vanilla?.blockTags.forEach((k) => add(k))
      } else if (where === 'list' && a && b) {
        catalog.lists?.[`${a}:${b}`]?.forEach((k) => add(k))
      } else if (where === 'refs' && a && b) {
        const named = labels[a]?.[b]
        for (const id of this.response.refs[a]?.[b] ?? []) {
          if (scope === undefined) {
            add(id, named?.[id])
            continue
          }
          const slash = id.lastIndexOf('/')
          const last = id.slice(slash + 1)
          if (scope === null) add(last, named?.[id], slash >= 0 ? id.slice(0, slash) : undefined)
          else if (id.startsWith(`${scope}/`)) {
            // Deeper than the scope: the parts in between say where it is
            const between = slash > scope.length ? id.slice(scope.length + 1, slash) : undefined
            add(last, named?.[id], between)
          }
        }
      } else if (where === 'd1' && a === 'pools') {
        this.response.pools.forEach((p) => add(p.id))
      } else if (where === 'd1' && a === 'quests') {
        quests.forEach((q) => add(q))
      }
    }
    if (param.kind === 'QUEST') quests.forEach((q) => add(q))
    // One block: vanilla keys, never tags
    if (param.kind === 'BLOCK') catalog.vanilla?.blocks.forEach((k) => add(k))
    if (param.kind === 'ENTITY_LIST') {
      // Entity keys of other plugins: tyche:<mob>, tyche_boss:<boss>, convo:<npc>
      for (const [key, source] of Object.entries(catalog.types?.keySources ?? {})) {
        if (!key.startsWith('entity:')) continue
        const prefix = key.slice('entity:'.length)
        const [, provider, kind] = source.split(':')
        if (!provider || !kind) continue
        const named = labels[provider]?.[kind]
        this.response.refs[provider]?.[kind]?.forEach((id) => add(`${prefix}:${id}`, named?.[id]))
      }
      catalog.vanilla?.entityTags.forEach((k) => add(k))
    }
    return [...out.values()]
  }
}

/** A value to offer, with a display name and where it sits (a scoped id's path). */
export interface Suggestion {
  value: string
  label?: string
  hint?: string
}

/** The fields every objective has besides its type's arguments. */
export const OBJECTIVE_FIELDS = {
  display: 'The line in menus (MiniMessage; <status>, <current>, <required>)',
  amount: 'How many times it must happen',
}
