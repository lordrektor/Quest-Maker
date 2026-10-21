import { describe, expect, it } from 'vitest'
import type { Catalog, CatalogResponse, ParamDto, Tree, TypeDto } from '../shared/creator'
import { canonicalQuest } from '../shared/quest/canonical'
import { accepted, takesParam, takesType, useRefusal } from '../shared/quest/uses'
import { namespaceError, validateQuest } from '../shared/quest/validate'
import { describeRequirement } from '../src/describe'
import { CatalogView } from '../src/creator/catalog'
import { interpret } from '../src/creator/canvas/flow'
import { treeToModel } from '../src/creator/model'
import { addGroup, attach, refusal, requirementTarget, useOf } from '../src/creator/ops'
import { emptyWorkspace, loadedQuest, putQuest } from '../src/creator/workspace'
import { CATALOG } from './fixtures'

const param = (name: string, kind: ParamDto['kind'], extra: Partial<ParamDto> = {}): ParamDto =>
  ({ name, kind, required: false, default: null, min: null, description: name, ...extra })
const spot = (required: boolean) => ['world', 'x', 'y', 'z'].map((name) =>
  param(name, name === 'world' ? 'STRING' : 'DECIMAL', required ? { required: true } : { reads: ['spot'] }))
const nearby = (id: string, first: ParamDto): TypeDto => ({
  id, owner: 'Chronos', description: id, icon: 'minecraft:zombie_head',
  params: [first, param('compare', 'CHOICE', { choices: ['>=', '>', '<=', '<', '==', '!='], default: '>=' }), param('value', 'INTEGER', { default: '1' }),
    param('radius', 'DECIMAL', { default: '10' }), ...spot(false)],
})
const vanillaItems = (name: string) => param(name, 'ITEM_LIST', { required: true, only: 'minecraft', tags: true, pick: ['vanilla:items'] })

/** The fixture catalog with what 1.2.0 sends: requirementUses, reads on types and arguments, vanilla-only items with tags. */
const TYPES: Catalog = {
  ...CATALOG,
  types: {
    ...CATALOG.types!,
    requirement: [
      ...CATALOG.types!.requirement,
      nearby('entities_nearby', param('entities', 'ENTITY_LIST')),
      { id: 'container_has_item', owner: 'Chronos', description: 'container', icon: 'minecraft:barrel', reads: ['spot'],
        params: [...spot(true), vanillaItems('items'), param('amount', 'INTEGER', { default: '1' })] },
      { id: 'has_item', owner: 'Chronos', description: 'has item', icon: 'minecraft:chest', params: [vanillaItems('items'), param('amount', 'INTEGER')] },
    ],
    requirementUses: { start: ['spot'], auto_start: [], fail_unless: [], reward: ['spot'] },
  },
}
const view = new CatalogView({ ok: true, catalog: TYPES, syncedAt: {}, refs: {}, refLabels: {}, pools: [] } satisfies CatalogResponse)
const spec = (id: string) => view.type('requirement', id)!

const container = { type: 'container_has_item', world: 'arena', x: 10, y: 64, z: -5, items: ['minecraft:diamond'] }
const zombies = { type: 'entities_nearby', entities: ['minecraft:zombie'] }

describe('what each requirement use takes (the catalog)', () => {
  it('reads requirementUses, a type\'s reads and an argument\'s reads', () => {
    expect(accepted(TYPES, 'start')).toEqual(['spot'])
    expect(accepted(TYPES, 'fail_unless')).toEqual([])
    expect(spec('container_has_item').reads).toEqual(['spot'])
    expect(spec('entities_nearby').params.filter((p) => p.reads?.includes('spot')).map((p) => p.name)).toEqual(['world', 'x', 'y', 'z'])
    expect(takesType(TYPES, 'start', spec('container_has_item'))).toBe(true)
    expect(takesType(TYPES, 'auto_start', spec('container_has_item'))).toBe(false)
    expect(takesType(TYPES, 'fail_unless', spec('entities_nearby'))).toBe(true)
  })

  it('an older catalog without requirementUses takes everything', () => {
    expect(accepted(CATALOG, 'fail_unless')).toBeNull()
    expect(takesType(CATALOG, 'fail_unless', spec('container_has_item'))).toBe(true)
  })

  it('the inspector hides a spot argument its use refuses', () => {
    const world = spec('entities_nearby').params.find((p) => p.name === 'world')!
    expect(takesParam(TYPES, 'start', world)).toBe(true)
    expect(takesParam(TYPES, 'fail_unless', world)).toBe(false)
    expect(takesParam(TYPES, 'auto_start', world)).toBe(false)
    expect(takesParam(TYPES, 'fail_unless', spec('entities_nearby').params[0]!)).toBe(true)
  })
})

describe('validating requirement uses', () => {
  const check = (tree: Tree) => {
    const read = canonicalQuest({ id: 'q', name: 'Q', pool: 'p', objectives: { o: { type: 'fish' } }, ...tree }, 'q')
    return validateQuest(read.quest!, { catalog: TYPES, pools: null }).filter((p) => p.error).map((p) => `${p.path}: ${p.message}`)
  }
  const AWAY = 'it reads a spot away from the player, which may be far away or not loaded'

  it('a type that reads a spot: fine in requirements, not for an auto_start quest or in fail.unless', () => {
    expect(check({ requirements: [container] })).toEqual([])
    expect(check({ auto_start: true, requirements: [container] }))
      .toEqual([`requirements[0].type: container_has_item cannot be used in the requirements of an auto_start quest: ${AWAY}`])
    expect(check({ fail: { unless: [{ type: 'level', min: 1 }, { all: [{ type: 'level', min: 1 }, container] }] } }))
      .toEqual([`fail.unless[1].all[1].type: container_has_item cannot be used in fail.unless: ${AWAY}`])
    // The type's trait comes first, and nothing else about its use
    expect(check({ fail: { unless: [{ ...container, x: undefined }] } }))
      .toEqual(['fail.unless[0].x: missing: x', `fail.unless[0].type: container_has_item cannot be used in fail.unless: ${AWAY}`])
  })

  it('a spot is all of world, x, y, z or none of them', () => {
    expect(check({ requirements: [{ ...zombies, world: 'arena', x: 1 }] }))
      .toEqual(['requirements[0].y: world, x, y, z go together: all of them for a spot, or none for around the player'])
    expect(check({ requirements: [{ ...zombies, x: 1, y: 2, z: 3 }] }))
      .toEqual(['requirements[0].world: world, x, y, z go together: all of them for a spot, or none for around the player'])
    expect(check({ requirements: [{ ...zombies, world: 'arena', x: 1, y: 2, z: 3 }] })).toEqual([])
  })

  it('a filled spot where its use refuses it is one error; around the player is fine', () => {
    const refused = (label: string) => `a spot cannot be used in ${label}: ${AWAY}; leave world, x, y, z empty to use the player's place`
    expect(check({ fail: { unless: [{ ...zombies, world: 'arena', x: 1, y: 2, z: 3 }] } })).toEqual([`fail.unless[0].world: ${refused('fail.unless')}`])
    expect(check({ fail: { unless: [{ ...zombies, y: 2 }] } })).toEqual([
      'fail.unless[0].world: world, x, y, z go together: all of them for a spot, or none for around the player',
      `fail.unless[0].y: ${refused('fail.unless')}`,
    ])
    expect(check({ auto_start: true, requirements: [{ any: [{ type: 'level', min: 1 }, { ...zombies, world: 'a', x: 0, y: 0, z: 0 }] }] }))
      .toEqual([`requirements[0].any[1].world: ${refused('the requirements of an auto_start quest')}`])
    expect(check({ fail: { unless: [zombies] }, auto_start: true, requirements: [zombies] })).toEqual([])
  })

  it('has_item takes vanilla items and vanilla tags only', () => {
    expect(check({ requirements: [{ type: 'has_item', items: ['minecraft:diamond', '#minecraft:logs', 'cod'] }] })).toEqual([])
    expect(check({ requirements: [{ type: 'has_item', items: ['#vulcan:x', 'vulcan:ember'] }] })).toEqual([
      "requirements[0].items[0]: only vanilla items work here (minecraft:<id>), not '#vulcan:x'",
      "requirements[0].items[1]: only vanilla items work here (minecraft:<id>), not 'vulcan:ember'",
    ])
    const noTags = { ...vanillaItems('items'), tags: false }
    expect(namespaceError(noTags, '#minecraft:logs')).toBe('tags cannot be used here: only vanilla items (minecraft:<id>)')
    expect(namespaceError({ ...noTags, only: 'vulcan' }, '#x')).toBe('tags cannot be used here: only vulcan items (vulcan:<id>)')
    expect(view.suggestions(spec('has_item').params[0]!).map((s) => s.value)).toContain('#minecraft:logs')
  })
})

describe('placing requirements by use on the canvas', () => {
  const body = (extra: Tree = {}) => ({
    id: 'q', name: 'Q', pool: 'p', requirements: [container, { ...zombies, world: 'arena', x: 1, y: 2, z: 3 }, zombies],
    objectives: { o: { type: 'fish', amount: 1 } }, fail: { unless: [{ type: 'level', min: 1 }] }, ...extra,
  })

  it('the use of a place: requirements (auto_start when it starts by itself), fail.unless, a group takes its list\'s', () => {
    const m = treeToModel(body(), 'q')
    expect(useOf(m, { kind: 'requirements' })).toBe('start')
    expect(useOf(m, { kind: 'unless' })).toBe('fail_unless')
    const g = addGroup(m, { kind: 'unless' })
    expect(useOf(m, { kind: 'group', group: g })).toBe('fail_unless')
    expect(useOf(m, null)).toBeNull()
    expect(useOf(treeToModel(body({ auto_start: true }), 'q'), { kind: 'requirements' })).toBe('auto_start')
  })

  it('pickers offer only the types the target takes: a selected fail rules box, or an auto_start quest\'s Start', () => {
    const offered = (m: ReturnType<typeof treeToModel>, key: string | null) =>
      view.list('requirement').filter((t) => takesType(TYPES, useOf(m, requirementTarget(m, key))!, t)).map((t) => t.id)
    const m = treeToModel(body(), 'q')
    expect(offered(m, 'start')).toContain('container_has_item')
    expect(offered(m, 'fail')).not.toContain('container_has_item')
    expect(offered(m, 'fu:0')).not.toContain('container_has_item')
    expect(offered(m, 'fail')).toContain('entities_nearby')
    expect(offered(treeToModel(body({ auto_start: true }), 'q'), 'start')).not.toContain('container_has_item')
    const g = addGroup(m, { kind: 'unless' })
    expect(requirementTarget(m, g)).toEqual({ kind: 'group', group: g })
    expect(offered(m, g)).not.toContain('container_has_item')
  })

  it('moving a requirement where its type or a filled spot is refused says why', () => {
    const m = treeToModel(body(), 'q')
    const AWAY = 'it reads a spot away from the player, which may be far away or not loaded'
    expect(refusal(m, 'req:0', { kind: 'unless' }, TYPES)).toBe(`container_has_item cannot be used in fail.unless: ${AWAY}`)
    expect(refusal(m, 'req:1', { kind: 'unless' }, TYPES))
      .toBe(`a spot cannot be used in fail.unless: ${AWAY}; leave world, x, y, z empty to use the player's place`)
    expect(refusal(m, 'req:2', { kind: 'unless' }, TYPES)).toBeNull()
    expect(refusal(m, 'req:0', { kind: 'unless' })).toBeNull()
    expect(attach(m, 'req:0', { kind: 'unless' }, undefined, TYPES)).toMatch(/^container_has_item cannot be used in fail\.unless/)
    expect(m.requirements).toContain('req:0')
    // A group carries its requirements: it cannot go where one of them cannot
    const g = addGroup(m, { kind: 'requirements' })
    expect(attach(m, 'req:0', { kind: 'group', group: g }, undefined, TYPES)).toBeNull()
    expect(refusal(m, g, { kind: 'unless' }, TYPES)).toMatch(/^container_has_item cannot be used in fail\.unless/)
    // Drawn as a line too
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest({ id: 'q', body: body(), layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    expect(interpret(ws, { source: 'p|q|req:1', sourceHandle: 'out', target: 'p|q|fail', targetHandle: 'unless' }, TYPES))
      .toEqual({ ok: false, why: `a spot cannot be used in fail.unless: ${AWAY}; leave world, x, y, z empty to use the player's place` })
    expect(useRefusal(TYPES, 'start', spec('container_has_item'), [])).toBeNull()
  })
})

describe('sentences of the nearby and container requirements', () => {
  const line = (tree: Tree) => describeRequirement(tree).mini

  it('nearby: count, what, radius, and the spot when there is one', () => {
    expect(line({ type: 'entities_nearby', entities: ['minecraft:zombie'], value: 3 })).toBe('At least 3 zombie within 10 blocks')
    expect(line({ type: 'entities_nearby' })).toBe('At least 1 living entities within 10 blocks')
    expect(line({ type: 'entities_nearby', entities: ['minecraft:zombie', 'minecraft:cave_spider'], compare: '<', value: 2, radius: 2.5 }))
      .toBe('Below 2 zombie, cave spider within 2.5 blocks')
    expect(line({ type: 'tyche_mobs_nearby', compare: '<=', value: 0, radius: 16, world: 'arena', x: 0, y: 64, z: 0 }))
      .toBe('No Tyche mobs within 16 blocks of arena 0 64 0')
    expect(line({ type: 'tyche_mobs_nearby', compare: '==', value: 0, mob: 'ash_wraith' })).toBe('No ash wraith within 10 blocks')
    expect(line({ type: 'tyche_bosses_nearby', compare: '!=', value: 1, radius: 200 })).toBe('Not 1 Tyche bosses within 64 blocks')
    expect(line({ type: 'tyche_bosses_nearby', boss: 'cinder_hydra', radius: 0.1, compare: '>' })).toBe('Above 1 cinder hydra within 0.5 blocks')
  })

  it('container: the spot, the amount and the names', () => {
    expect(line({ ...container, amount: 16 })).toBe('The container at arena 10 64 -5 holds 16x diamond')
    expect(line({ ...container, items: ['minecraft:diamond', '#minecraft:logs'] })).toBe('The container at arena 10 64 -5 holds 1x diamond, logs')
    expect(line({ type: 'container_has_vulcan_item', world: 'arena', x: 1.5, y: 64, z: 2, item: 'vulcan:ember_blade', amount: 2 }))
      .toBe('The container at arena 1.5 64 2 holds 2x ember blade')
  })
})
