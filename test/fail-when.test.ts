import { describe, expect, it } from 'vitest'
import { canonicalQuest } from '../shared/quest/canonical'
import { modelToTree, treeToModel } from '../src/creator/model'
import { addEntry, shift } from '../src/creator/ops'

const body = {
  id: 'q', name: 'Q', pool: 'p', objectives: { o: { type: 'fish', amount: 1 } },
  fail: { when: [{ type: 'death', amount: 1 }, { type: 'change_world', amount: 1, dimensions: ['the_end'] }, { type: 'kill_mob', amount: 3 }] },
}
const types = (tree: Record<string, unknown>) => ((tree.fail as { when: { type: string }[] }).when).map((w) => w.type)

describe('the order of fail.when (the fail rules list)', () => {
  it('moving one up or down changes the written order', () => {
    const model = treeToModel(body, 'q')
    expect(model.fail.when).toEqual(['fw:0', 'fw:1', 'fw:2'])
    expect(shift(model, 'fw:2', -1)).toBe(true)
    expect(types(modelToTree(model))).toEqual(['death', 'kill_mob', 'change_world'])
    expect(shift(model, 'fw:0', 1)).toBe(true)
    expect(types(modelToTree(model))).toEqual(['kill_mob', 'death', 'change_world'])
    // Saved and opened again, the list is in the new order
    expect(treeToModel(modelToTree(model), 'q').fail.when.map((nid) => treeToModel(modelToTree(model), 'q').entries[nid]!.type))
      .toEqual(['kill_mob', 'death', 'change_world'])
  })

  it('stops at the ends, and a new one goes last', () => {
    const model = treeToModel(body, 'q')
    expect(shift(model, 'fw:0', -1)).toBe(false)
    expect(shift(model, 'fw:2', 1)).toBe(false)
    addEntry(model, 'objective', 'jump', { kind: 'when' })
    expect(types(modelToTree(model))).toEqual(['death', 'change_world', 'kill_mob', 'jump'])
  })
})

describe('notices', () => {
  it('particles take a dust size (a number)', () => {
    const read = (size: unknown) => canonicalQuest({ ...body, notices: { complete: { particles: { particle: 'minecraft:dust', color: 'gold', size } } } }, 'q')
    expect(read(1.5).problems).toEqual([])
    expect((read(1.5).body!.notices as Record<string, { particles: { size: number } }>).complete.particles.size).toBe(1.5)
    expect(read('big').problems).toEqual([{ path: 'notices.complete.particles.size', message: 'must be a number', error: true }])
  })
})
