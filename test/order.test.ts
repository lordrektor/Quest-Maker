import { expect, it } from 'vitest'
import { modelToTree, treeToModel, newQuestName } from '../src/creator/model'
import { attach, detach, moveStageAfter, renumberStages, resetNotice, shift } from '../src/creator/ops'
import { emptyWorkspace, isDirty, loadedQuest, putQuest } from '../src/creator/workspace'
import { typedId } from '../src/creator/input'
import { seedQuests } from './seed'

const body = { id: 'q', name: 'Q', pool: 'p', objectives: {
  a: { type: 'fish', amount: 1 }, x: { type: 'fish', amount: 1, stage: 1 }, b: { type: 'fish', amount: 1 }, y: { type: 'fish', amount: 1, stage: 1 } },
  fail: { when: [{ type: 'die', amount: 1 }] } }
const keys = (m: ReturnType<typeof treeToModel>) => Object.keys(modelToTree(m).objectives as object)

it('order: fail conditions and loose objectives never take a place', () => {
  const m = treeToModel(body, 'q')
  attach(m, 'obj:a', { kind: 'when' })
  expect(keys(m)).toEqual(['x', 'b', 'y'])
  attach(m, 'obj:a', { kind: 'stage', stage: m.chain[0]! })
  expect(m.stages[m.chain[0]!]!.objectives).toEqual(['obj:b', 'obj:a'])
  // shown b, a in stage 0: written in the stage-0 places in that order
  expect(keys(m)).toEqual(['b', 'x', 'a', 'y'])
  detach(m, 'obj:x')
  expect(keys(m)).toEqual(['b', 'a', 'y'])
})

it('order: swapping stages and renumbering keeps each stage as shown', () => {
  const m = treeToModel(body, 'q')
  moveStageAfter(m, m.chain[1]!, null)
  renumberStages(m)
  const t = modelToTree(m).objectives as Record<string, { stage?: number }>
  expect(Object.entries(t).map(([k, v]) => `${k}:${v.stage ?? 0}`)).toEqual(['a:1', 'x:0', 'b:1', 'y:0'])
})

it('order: moving back and forth leaves the quest unchanged (not dirty)', () => {
  const ws = emptyWorkspace('w')
  putQuest(ws, loadedQuest({ id: 'q', body: modelToTree(treeToModel(body, 'q')), layout: null, updatedAt: 1, updatedBy: 's', source: 'server', webPending: false }))
  const m = ws.quests.q!.model
  shift(m, 'obj:b', -1)
  expect(isDirty(ws.quests.q!)).toBe(true)
  shift(m, 'obj:b', 1)
  expect(isDirty(ws.quests.q!)).toBe(false)
})

it('order: every seed quest still opens and saves byte for byte, also after a move and back', () => {
  for (const q of seedQuests()) {
    const m = treeToModel(q.body, q.id)
    const first = m.chain.map((s) => m.stages[s]!.objectives).find((o) => o.length > 1)
    if (first) {
      const moved = first[1]!
      expect(shift(m, moved, -1)).toBe(true)
      expect(JSON.stringify(modelToTree(m))).not.toBe(JSON.stringify(q.body))
      expect(shift(m, moved, 1)).toBe(true)
    }
    expect(JSON.stringify(modelToTree(m))).toBe(JSON.stringify(q.body))
  }
})

it('ids and names like the game', () => {
  expect(typedId('\tHydra  Hunt ')).toBe('hydra__hunt')
  expect(newQuestName('a_b__c')).toBe('<white>a b  c')
})

it('reset notice on a quest without notices does nothing', () => {
  const m = treeToModel(body, 'q')
  resetNotice(m, 'fail')
  expect(modelToTree(m).notices).toBeUndefined()
})
