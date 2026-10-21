import { describe, expect, it } from 'vitest'
import type { Catalog, ParamDto, Tree, TypeDto } from '../shared/creator'
import { CatalogView } from '../src/creator/catalog'
import { describeAction, describeReward, objectiveSentence, SILENT_REWARDS } from '../src/describe'
import { COUNTS, INTEGRATIONS } from '../src/showcase/capabilities'
import { typeSymbol } from '../src/typeIcons'
import typeIds from './fixtures/type-ids.json'
import { CATALOG } from './fixtures'

const param = (name: string, kind: ParamDto['kind'], extra: Partial<ParamDto> = {}): ParamDto =>
  ({ name, kind, required: false, default: null, min: null, description: name, ...extra })
const type = (id: string, owner: string, params: ParamDto[]): TypeDto => ({ id, owner, description: id, icon: 'minecraft:bell', params })

const INTERACT = type('interact_tyche_npc', 'Tyche', [param('npcs', 'STRING_LIST', { pick: ['refs:tyche:npcs'] }),
  param('click', 'CHOICE', { default: 'right', choices: ['right', 'left', 'any'] })])
const TALK = type('talk_npc', 'Convo', [param('npcs', 'ENTITY_LIST', { only: 'convo' })])

const ids = typeIds as { id: string; category: string }[]
const objective = (tree: Tree) => objectiveSentence({ amount: 1, ...tree })

describe('interact_tyche_npc (was talk_tyche_npc)', () => {
  it('reads as clicks and hits, never as talking', () => {
    expect(objective({ type: 'interact_tyche_npc', npcs: ['blacksmith'], click: 'right' })).toBe('Click blacksmith')
    expect(objective({ type: 'interact_tyche_npc', npcs: ['blacksmith'], click: 'any', amount: 2 })).toBe('Click blacksmith 2 times')
    expect(objective({ type: 'interact_tyche_npc', npcs: ['bandit'], click: 'left' })).toBe('Hit bandit')
    expect(objective({ type: 'interact_tyche_npc', click: 'sideways' })).toBe('Click an NPC')
    for (const click of ['right', 'left', 'any']) expect(objective({ type: 'interact_tyche_npc', click }).toLowerCase()).not.toContain('talk')
  })

  it('the old id is gone everywhere: no sentence, symbol or showcase line of its own', () => {
    expect(objective({ type: 'talk_tyche_npc' })).toBe('Talk tyche npc × 1')
    expect(typeSymbol('objective', 'talk_tyche_npc').known).toBe(false)
    expect(ids.some((t) => t.id === 'talk_tyche_npc')).toBe(false)
    expect(INTEGRATIONS.flatMap((i) => [...i.objectives, ...i.requirements, ...i.rewards])).not.toContain('talk_tyche_npc')
  })

  it('keeps a symbol of its own, unlike any other objective (and not a speech bubble)', () => {
    const symbol = typeSymbol('objective', 'interact_tyche_npc')
    expect(symbol.known).toBe(true)
    expect(symbol.name.startsWith('speech')).toBe(false)
    const look = (s: typeof symbol) => [...s.grid, s.main, s.accent].join('\n')
    expect(ids.filter((t) => t.category === 'objective' && t.id !== 'interact_tyche_npc' && look(typeSymbol('objective', t.id)) === look(symbol))).toEqual([])
  })

  it('points at Convo\'s talk_npc only when the server has both', () => {
    const view = (objectives: TypeDto[]) => {
      const catalog: Catalog = { ...CATALOG, types: { ...CATALOG.types!, objective: [...CATALOG.types!.objective, ...objectives] } }
      return new CatalogView({ ok: true, catalog, syncedAt: {}, refs: {}, refLabels: {}, pools: [] })
    }
    expect(view([INTERACT, TALK]).note('objective', 'interact_tyche_npc')).toBe('To count talking through Convo, use talk_npc')
    expect(view([INTERACT]).note('objective', 'interact_tyche_npc')).toBeUndefined()
    expect(view([INTERACT, TALK]).note('objective', 'talk_npc')).toBeUndefined()
  })
})

describe('set_hud (ExperienceTailor 1.5.0)', () => {
  it('is an action: no menu line, hides the HUD unless hidden is false', () => {
    expect(SILENT_REWARDS.has('set_hud')).toBe(true)
    expect(describeReward({ type: 'set_hud' })).toBeNull()
    expect(describeAction({ type: 'set_hud' }).mini).toBe('Hides the HUD')
    expect(describeAction({ type: 'set_hud', hidden: true }).mini).toBe('Hides the HUD')
    expect(describeAction({ type: 'set_hud', hidden: false }).mini).toBe('Shows the HUD')
    // A display still shows in menus
    expect(describeReward({ type: 'set_hud', display: 'The view clears' })!.mini).toBe('The view clears')
  })

  it('has a symbol of its own, unlike any other reward', () => {
    const symbol = typeSymbol('reward', 'set_hud')
    expect(symbol.known).toBe(true)
    const look = (s: typeof symbol) => [...s.grid, s.main, s.accent].join('\n')
    expect(ids.filter((t) => t.category === 'reward' && t.id !== 'set_hud' && look(typeSymbol('reward', t.id)) === look(symbol))).toEqual([])
  })

  it('shows on the ExperienceTailor card, and the counts still cover every type', () => {
    expect(INTEGRATIONS.find((i) => i.name === 'ExperienceTailor')!.rewards).toContain('set_hud')
    const count = (category: string) => ids.filter((t) => t.category === category).length
    expect(COUNTS).toMatchObject({ objectives: count('objective'), requirements: count('requirement'), rewards: count('reward') })
  })
})
