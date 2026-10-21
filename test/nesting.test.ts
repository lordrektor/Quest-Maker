import { describe, expect, it } from 'vitest'
import type { Tree } from '../shared/creator'
import {
  canonicalQuest, dependencies, evaluateEntries, GROUP_DEPTH_MESSAGE, type Requirement, type RequirementEntry, type Truth,
} from '../shared/quest/canonical'
import { requirementCycles, validateQuest } from '../shared/quest/validate'
import { describeRequirement } from '../src/describe'
import { deriveFlow, interpret } from '../src/creator/canvas/flow'
import { autoLayout, GROUP, memberOffsets, partSize } from '../src/creator/layout'
import { modelToTree, treeToModel } from '../src/creator/model'
import { addGroup, attach, dissolveGroup, entryDepth, groupLevel, leaveGroup, parentOf, refusal } from '../src/creator/ops'
import { checkWorkspace, partOf } from '../src/creator/problems'
import { emptyWorkspace, links, loadedQuest, putQuest } from '../src/creator/workspace'
import { CATALOG } from './fixtures'

const perm = (node: string) => ({ type: 'permission', node })
const needs = (quest: string, not = false) => ({ type: 'quest_completed', quest, ...(not ? { not: true } : {}) })

/** Three levels of groups, in both lists. */
const NEST = {
  id: 'q', name: 'Q', pool: 'p',
  requirements: [
    { all: [perm('rank.vip'), { any: [needs('tutorial'), { all: [{ type: 'vanilla_level', value: 30 }, { type: 'in_world', worlds: ['hub'] }] }] }] },
  ],
  objectives: { o: { type: 'fish', amount: 1 } },
  fail: { unless: [{ any: [{ all: [perm('a'), { any: [perm('b'), perm('c')], not: true }] }, perm('d')], not: true, display: 'Not here' }] },
}
const read = (tree: Tree, id = 'q') => canonicalQuest({ id, name: 'Q', pool: 'p', objectives: { o: { type: 'fish' } }, ...tree }, id)
const problemsOf = (tree: Tree) => read(tree).problems.map((p) => `${p.error ? 'error' : 'warning'} ${p.path}: ${p.message}`)

describe('groups in groups, three levels deep', () => {
  it('read and write back exactly, through the canvas model too', () => {
    const { body, problems } = canonicalQuest(NEST, 'q')
    expect(problems).toEqual([])
    expect(JSON.stringify(body)).toBe(JSON.stringify(NEST))
    const model = treeToModel(NEST, 'q')
    expect(model.entries['req:0']!.members).toEqual(['req:0:0', 'req:0:1'])
    expect(model.entries['req:0:1']!.members).toEqual(['req:0:1:0', 'req:0:1:1'])
    expect(parentOf(model, 'req:0:1:1:0')).toEqual({ kind: 'group', group: 'req:0:1:1' })
    expect([groupLevel(model, 'req:0'), groupLevel(model, 'req:0:1'), groupLevel(model, 'req:0:1:1')]).toEqual([1, 2, 3])
    expect(entryDepth(model, 'req:0')).toBe(3)
    expect(JSON.stringify(modelToTree(model))).toBe(JSON.stringify(NEST))
  })

  it('a group inside a level-3 group is an error; the other group rules apply at every level', () => {
    const one = perm('x')
    const deep = { all: [{ all: [{ all: [{ all: [one, one] }, one] }, one] }, one] }
    expect(problemsOf({ requirements: [deep] })).toEqual([`error requirements[0].all[0].all[0].all[0]: ${GROUP_DEPTH_MESSAGE}`])
    expect(problemsOf({ fail: { unless: [{ any: [one, { all: [one, { any: [{ any: [one, one] }, one] }] }] }] } }))
      .toEqual([`error fail.unless[0].any[1].all[1].any[0]: ${GROUP_DEPTH_MESSAGE}`])
    expect(problemsOf({ requirements: [{ all: [one, { any: [one, { all: [] }] }] }] }))
      .toEqual(['error requirements[0].all[1].any[1].all: empty: a group needs requirements'])
    expect(problemsOf({ requirements: [{ all: [one, { any: [one, { all: [one], any: [one, one], not: 'x', size: 1 }] }] }] })).toEqual([
      'error requirements[0].all[1].any[1]: a group has all or any, not both',
      'warning requirements[0].all[1].any[1].size: ignored by a group (it accepts all, any, not, display)',
      'warning requirements[0].all[1].any[1].all: a group of one requirement: use the requirement itself',
      'error requirements[0].all[1].any[1].not: must be true or false',
    ])
    expect(problemsOf({ requirements: [{ all: [one, { type: 'level', any: [one, one] }] }] }))
      .toEqual(['error requirements[0].all[1]: a group (any:) has no type: put the requirements under any'])
  })

  it('a nested group is a member: its parent joins it after its own not; unknown stays unknown', () => {
    const r = (truth: Truth, not = false): Requirement => ({ type: truth, args: [], not })
    const group = (mode: 'all' | 'any', members: RequirementEntry[], not = false): RequirementEntry => ({ mode, group: members, not, display: '' })
    const judge = (requirement: Requirement) => requirement.type as Truth
    // all[ met, any[ unmet, not all[ met, x ] ] ]
    const three = (x: Truth) => [group('all', [r('met'), group('any', [r('unmet'), group('all', [r('met'), r(x)], true)])])]
    expect(evaluateEntries(three('unknown'), judge)).toBe('unknown')
    expect(evaluateEntries(three('unmet'), judge)).toBe('met')
    expect(evaluateEntries(three('met'), judge)).toBe('unmet')
    // not any[ not met, all[ unknown, unmet ] ]: the all is unmet, so the any is unmet, reversed met
    expect(evaluateEntries([group('any', [r('met', true), group('all', [r('unknown'), r('unmet')])], true)], judge)).toBe('met')
    expect(evaluateEntries([group('any', [r('met', true), group('all', [r('unknown'), r('met')])], true)], judge)).toBe('unknown')
  })

  it('must hold: all the way down an all that must be true; through a reversed any of reversed members', () => {
    const deps = (requirements: unknown[]) => dependencies(read({ requirements }).quest!.requirements).map((r) => r.args[0]![1]).sort()
    expect(deps([{ all: [needs('a'), { all: [needs('b'), { all: [needs('c'), needs('d', true)] }] }] }])).toEqual(['a', 'b', 'c'])
    expect(deps([{ all: [needs('a'), { any: [needs('b'), { all: [needs('c'), needs('d')] }] }] }])).toEqual(['a'])
    // not any(not A, not all(B, C)) = A and B and C
    expect(deps([{ any: [needs('a', true), { all: [needs('b'), needs('c')], not: true }], not: true }])).toEqual(['a', 'b', 'c'])
    // A group that must be false: no single member of an all must be
    expect(deps([{ any: [needs('a', true), { all: [needs('b'), needs('c')] }], not: true }])).toEqual(['a'])
    expect(deps([{ all: [needs('a'), needs('b')], not: true }])).toEqual([])
  })

  it('so a nested quest_completed links quests, or not', () => {
    const quest = (id: string, requirements: unknown[]) => read({ requirements }, id).quest!
    expect([...requirementCycles(new Map([['a', quest('a', [{ all: [perm('x'), { all: [perm('y'), { all: [needs('b'), perm('z')] }] }] }])],
      ['b', quest('b', [needs('a')])]]))].sort()).toEqual(['a', 'b'])
    expect(requirementCycles(new Map([['a', quest('a', [{ all: [perm('x'), { any: [needs('b'), perm('z')] }] }])], ['b', quest('b', [needs('a')])]])))
      .toEqual(new Set())
    const errors = (requirements: unknown[]) => validateQuest(read({ requirements }).quest!, { catalog: CATALOG, pools: null, questExists: () => true })
      .filter((p) => p.error).map((p) => `${p.path}: ${p.message}`)
    expect(errors([{ all: [perm('x'), { all: [needs('q'), perm('y')] }] }])).toEqual(['requirements[0].all[1].all[0].quest: a quest cannot require itself'])
    expect(errors([{ all: [perm('x'), { any: [needs('q'), perm('y')] }] }])).toEqual([])

    const ws = emptyWorkspace('w')
    const body = {
      id: 'b', name: 'B', pool: 'p', objectives: { o: { type: 'fish', amount: 1 } },
      requirements: [{ all: [{ all: [needs('c'), { any: [needs('d'), perm('x')] }] }, { any: [needs('e', true), { all: [needs('f')], not: true }], not: true }] }],
    }
    putQuest(ws, loadedQuest({ id: 'b', body, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    expect(links(ws).map((l) => `${l.from} ${l.kind} ${l.to} (${l.nid})`)).toEqual(['c unlocks b (req:0:0:0)', 'e unlocks b (req:0:1:0)', 'f unlocks b (req:0:1:1:0)'])
  })

  it('read a nested group in parentheses; a display replaces its line at any level', () => {
    expect(describeRequirement(NEST.requirements[0]!).mini).toBe('All of: Permission rank.vip; (Any of: Complete tutorial; (All of: Level at least 30; Be in hub))')
    expect(describeRequirement({ all: [perm('x'), { any: [perm('y'), perm('z')], not: true, display: 'No VIP' }] }).mini).toBe('All of: Permission x; (No VIP)')
    expect(describeRequirement(NEST.fail.unless[0]!).mini).toBe('Not here')
  })
})

describe('nested groups on the canvas', () => {
  it('a group is as big as its members; a group inside is laid out inside it', () => {
    const model = treeToModel(NEST, 'q')
    const inner = partSize(model, 'req:0:1:1')
    expect(inner).toEqual({ w: 240, h: GROUP.header + 64 * 2 + 12 + GROUP.pad })
    expect(partSize(model, 'req:0:1').w).toBe(260)
    expect(partSize(model, 'req:0').w).toBe(280)
    expect(partSize(model, 'req:0:1').h).toBe(GROUP.header + 64 + 12 + inner.h + GROUP.pad)
    const at = autoLayout(model)
    const offsets = memberOffsets(model, 'req:0:1')
    expect(at['req:0:1:1']).toEqual({ x: at['req:0:1']!.x + offsets[1]!.x, y: at['req:0:1']!.y + offsets[1]!.y })
    expect(at['req:0:1:1:1']).toEqual({ x: at['req:0:1:1']!.x + GROUP.pad, y: at['req:0:1:1']!.y + GROUP.header + 64 + 12 })
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest({ id: 'q', body: NEST, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    const ids = deriveFlow(ws, checkWorkspace(ws, null, () => undefined)).nodes.map((n) => n.id)
    expect(ids.indexOf('p|q|req:0')).toBeLessThan(ids.indexOf('p|q|req:0:1'))
    expect(ids.indexOf('p|q|req:0:1')).toBeLessThan(ids.indexOf('p|q|req:0:1:1'))
    expect(ids.indexOf('p|q|req:0:1:1')).toBeLessThan(ids.indexOf('p|q|req:0:1:1:0'))
    expect(partOf(model, 'requirements[0].all[1].any[1].all[0].value')).toBe('req:0:1:1:0')
  })

  it('a drop that would go deeper than 3 levels is refused with the depth message', () => {
    const model = treeToModel(NEST, 'q')
    // Into the level-3 group: a requirement yes, a group no
    expect(refusal(model, 'req:0:0', { kind: 'group', group: 'req:0:1:1' })).toBeNull()
    const g = addGroup(model, { kind: 'requirements' })
    expect(refusal(model, g, { kind: 'group', group: 'req:0:1:1' })).toBe(GROUP_DEPTH_MESSAGE)
    expect(attach(model, g, { kind: 'group', group: 'req:0:1:1' })).toBe(GROUP_DEPTH_MESSAGE)
    expect(addGroup(model, { kind: 'group', group: 'req:0:1:1' })).toBeTruthy()
    expect(model.entries['req:0:1:1']!.members).toHaveLength(2)
    // A two-level group fits in a level-1 group, not in a level-2 one; a group never goes inside itself
    expect(refusal(model, 'req:0:1', { kind: 'group', group: g })).toBeNull()
    expect(refusal(model, 'req:0:1', { kind: 'group', group: 'fu:0:0' })).toBe(GROUP_DEPTH_MESSAGE)
    expect(refusal(model, 'req:0', { kind: 'group', group: 'req:0:1:1' })).toBe('a group cannot go inside itself')
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest({ id: 'q', body: NEST, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    expect(interpret(ws, { source: 'p|q|req:0:1', sourceHandle: 'out', target: 'p|q|fu:0:0', targetHandle: 'req' }))
      .toEqual({ ok: false, why: GROUP_DEPTH_MESSAGE })
  })

  it('out of a group into its parent list; ungrouping puts the members in the parent list', () => {
    const model = treeToModel(NEST, 'q')
    expect(leaveGroup(model, 'req:0:1:1:0')).toBeNull()
    expect(model.entries['req:0:1']!.members).toEqual(['req:0:1:0', 'req:0:1:1', 'req:0:1:1:0'])
    expect(dissolveGroup(model, 'req:0:1')).toBeNull()
    expect(model.entries['req:0']!.members).toEqual(['req:0:0', 'req:0:1:0', 'req:0:1:1', 'req:0:1:1:0'])
    expect(groupLevel(model, 'req:0:1:1')).toBe(2)
    expect(modelToTree(model).requirements).toEqual([{ all: [perm('rank.vip'), needs('tutorial'), { all: [{ type: 'in_world', worlds: ['hub'] }] },
      { type: 'vanilla_level', value: 30 }] }])
  })
})
