import { describe, expect, it } from 'vitest'
import type { Tree } from '../shared/creator'
import {
  canonicalQuest, dependencies, evaluateEntries, evaluateEntry, type GroupMode, type Requirement, type RequirementEntry, type Truth,
} from '../shared/quest/canonical'
import { requirementCycles, validateQuest, type ValidateContext } from '../shared/quest/validate'
import { describeFail, describeRequirement, requirementLines } from '../src/describe'
import { deriveFlow, interpret } from '../src/creator/canvas/flow'
import { autoLayout, GROUP, memberOffset } from '../src/creator/layout'
import { History } from '../src/creator/history'
import { modelToTree, treeToModel } from '../src/creator/model'
import {
  addEntry, addGroup, attach, detach, dissolveGroup, leaveGroup, parentOf, refusal, removeEntry, retype, setGroupMode, setReversed,
} from '../src/creator/ops'
import { checkWorkspace, partOf } from '../src/creator/problems'
import { emptyWorkspace, layoutOf, links, loadedQuest, putQuest, type WorkspaceModel } from '../src/creator/workspace'
import { referencedQuests } from '../worker/creator'
import { CATALOG } from './fixtures'

/** The examples of the YAML contract, as the plugin writes them. */
const EXAMPLE = {
  id: 'q', name: 'Q', pool: 'p',
  requirements: [
    { type: 'quest_completed', quest: 'tutorial', not: true },
    { all: [{ type: 'permission', node: 'rank.vip' }, { type: 'vanilla_level', value: 30 }], not: true, display: 'Not for high-level VIPs' },
  ],
  objectives: { o: { type: 'fish', amount: 1 } },
  fail: {
    unless: [
      { type: 'in_dimension', dimensions: ['nether'], not: true },
      { all: [{ type: 'in_world', worlds: ['arena'] }, { type: 'time_of_day', from: 13000, to: 23000 }], not: true },
    ],
  },
}

const read = (tree: Tree, id = 'q') => canonicalQuest({ id, name: 'Q', pool: 'p', objectives: { o: { type: 'fish' } }, ...tree }, id)
const problemsOf = (tree: Tree) => read(tree).problems.map((p) => `${p.error ? 'error' : 'warning'} ${p.path}: ${p.message}`)

describe('reversed requirements and groups in the canonical form', () => {
  it('the examples read and write back exactly, in both lists', () => {
    const { body, problems } = canonicalQuest(EXAMPLE, 'q')
    expect(problems).toEqual([])
    expect(JSON.stringify(body)).toBe(JSON.stringify(EXAMPLE))
  })

  it('reads them into requirements and groups', () => {
    const quest = canonicalQuest(EXAMPLE, 'q').quest!
    expect(quest.requirements[0]).toEqual({ type: 'quest_completed', args: [['quest', 'tutorial']], not: true })
    expect(quest.requirements[1]).toEqual({
      mode: 'all', group: [{ type: 'permission', args: [['node', 'rank.vip']], not: false }, { type: 'vanilla_level', args: [['value', 30]], not: false }],
      not: true, display: 'Not for high-level VIPs',
    })
    expect(quest.fail.unless[1]).toMatchObject({ not: true, display: '' })
  })

  it('writes not only when it is true, and a group display only when set', () => {
    const { body } = read({
      requirements: [{ type: 'permission', not: false, node: 'a' }, { all: [{ type: 'permission', node: 'b', not: false }, { type: 'permission', node: 'c' }], not: false }],
    })
    expect(body!.requirements).toEqual([{ type: 'permission', node: 'a' }, { all: [{ type: 'permission', node: 'b' }, { type: 'permission', node: 'c' }] }])
  })

  it('reports groups of one, empty groups, groups in groups, a not that is not true or false, unknown group keys', () => {
    const one = { type: 'permission', node: 'a' }
    expect(problemsOf({ requirements: [{ all: [one] }] })).toEqual(['warning requirements[0].all: a group of one requirement: use the requirement itself'])
    expect(problemsOf({ requirements: [{ all: [] }] })).toEqual(['error requirements[0].all: empty: a group needs requirements'])
    expect(problemsOf({ requirements: [{ type: 'permission', all: [one, one] }] }))
      .toEqual(['error requirements[0]: a group (all:) has no type: put the requirements under all'])
    expect(problemsOf({ requirements: [{ all: 'x' }] })).toEqual(['error requirements[0].all: must be a list of requirements'])
    expect(problemsOf({ requirements: [{ ...one, not: 'yes' }] })).toEqual(['error requirements[0].not: must be true or false'])
    expect(problemsOf({ requirements: [{ all: [one, one], not: 1 }] })).toEqual(['error requirements[0].not: must be true or false'])
    expect(problemsOf({ requirements: [one, { all: [one, { ...one, not: 'no' }] }] })).toEqual(['error requirements[1].all[1].not: must be true or false'])
    // A group may hold groups (see the nesting tests)
    expect(problemsOf({ requirements: [{ all: [{ all: [one, one] }, one] }] })).toEqual([])
    expect(problemsOf({ requirements: [{ all: [one, { node: 'x' }] }] })).toEqual(['error requirements[0].all[1].type: missing'])
    expect(problemsOf({ requirements: [{ all: [one, one], every: true }] })).toEqual(['warning requirements[0].every: ignored by a group (it accepts all, any, not, display)'])
    expect(problemsOf({ fail: { unless: [one, { all: [] }] } })).toEqual(['error fail.unless[1].all: empty: a group needs requirements'])
    expect(problemsOf({ fail: { unless: [{ all: [one, { ...one, not: 'x' }] }] } })).toEqual(['error fail.unless[0].all[1].not: must be true or false'])
  })
})

describe('evaluating requirement lists', () => {
  const r = (truth: Truth, not = false): Requirement => ({ type: truth, args: [], not })
  const judge = (requirement: Requirement) => requirement.type as Truth
  const group = (members: Requirement[], not = false, mode: GroupMode = 'all'): RequirementEntry => ({ mode, group: members, not, display: '' })

  it('a requirement, then reversed: unknown stays unknown', () => {
    expect((['met', 'unmet', 'unknown'] as const).map((t) => [t, evaluateEntry(r(t), judge), evaluateEntry(r(t, true), judge)])).toEqual([
      ['met', 'met', 'unmet'],
      ['unmet', 'unmet', 'met'],
      ['unknown', 'unknown', 'unknown'],
    ])
  })

  it('a group is all of its requirements, each after its own not; then the group is reversed', () => {
    const cases: [Requirement[], Truth, Truth][] = [
      [[r('met'), r('met')], 'met', 'unmet'],
      [[r('met'), r('unmet')], 'unmet', 'met'],
      [[r('met'), r('unknown')], 'unknown', 'unknown'],
      [[r('unmet'), r('unknown')], 'unmet', 'met'],
      [[r('unmet', true), r('met')], 'met', 'unmet'],
      [[r('unknown', true), r('met', true)], 'unmet', 'met'],
    ]
    for (const [members, plain, reversed] of cases) {
      expect(evaluateEntry(group(members), judge)).toBe(plain)
      expect(evaluateEntry(group(members, true), judge)).toBe(reversed)
    }
  })

  it('a list is met when every entry is (it can start), unmet as soon as one is not (fail.unless fails)', () => {
    expect(evaluateEntries([], judge)).toBe('met')
    expect(evaluateEntries([r('met'), group([r('met'), r('unmet', true)])], judge)).toBe('met')
    expect(evaluateEntries([r('met'), r('unknown')], judge)).toBe('unknown')
    expect(evaluateEntries([r('unknown'), r('met', true)], judge)).toBe('unmet')
    expect(evaluateEntries([group([r('met'), r('met')], true), r('unknown')], judge)).toBe('unmet')
  })
})

describe('checking requirements in groups', () => {
  const CTX: ValidateContext = { catalog: CATALOG, pools: null, questExists: (id) => ['first_steps', 'q'].includes(id) }
  const check = (tree: Tree) => validateQuest(read(tree).quest!, CTX).map((p) => `${p.error ? 'error' : 'warning'} ${p.path}: ${p.message}`)
  const level = { type: 'level', min: 1 }

  it('checks a group\'s requirements like the others, with their paths', () => {
    expect(check({ requirements: [level, { all: [{ type: 'permission' }, level] }] })).toEqual(['error requirements[1].all[0].node: missing: node'])
    expect(check({ fail: { unless: [level, { all: [{ type: 'level', min: 'x' }, level] }] } }))
      .toEqual(['error fail.unless[1].all[0].min: must be a whole number'])
    expect(check({ requirements: [{ all: [{ type: 'jump' }, level], not: true }] })[0]).toMatch(/^error requirements\[0\]\.all\[0\]\.type: unknown requirement type 'jump'/)
  })

  it('a reversed quest reference needs nothing: it may name itself', () => {
    expect(check({ requirements: [{ type: 'quest_completed', quest: 'q' }] })).toEqual(['error requirements[0].quest: a quest cannot require itself'])
    expect(check({ requirements: [{ type: 'quest_completed', quest: 'q', not: true }] })).toEqual([])
    expect(check({ requirements: [{ all: [{ type: 'quest_completed', quest: 'q' }, level], not: true }] })).toEqual([])
    expect(check({ requirements: [{ all: [{ type: 'quest_completed', quest: 'q' }, level] }] }))
      .toEqual(['error requirements[0].all[0].quest: a quest cannot require itself'])
    expect(check({ requirements: [{ type: 'quest_completed', quest: 'ghost' }] })).toEqual(["warning requirements[0].quest: quest 'ghost' does not exist: this never passes"])
    // A quest that does not exist warns either way, with what it does (the requirement's own not decides)
    expect(check({ requirements: [{ type: 'quest_completed', quest: 'ghost', not: true }] }))
      .toEqual(["warning requirements[0].quest: quest 'ghost' does not exist: this always passes"])
    expect(check({ requirements: [{ all: [{ type: 'quest_failed', quest: 'ghost', not: true }, level], not: true }] }))
      .toEqual(["warning requirements[0].all[0].quest: quest 'ghost' does not exist: this always passes"])
    expect(check({ requirements: [{ all: [{ type: 'quest_completed', quest: 'ghost' }, level], not: true }] }))
      .toEqual(["warning requirements[0].all[0].quest: quest 'ghost' does not exist: this never passes"])
  })

  it('only needed requirements make cycles', () => {
    const quest = (id: string, requirements: unknown[]) => read({ requirements }, id).quest!
    const needs = (q: string, not = false) => ({ type: 'quest_completed', quest: q, ...(not ? { not: true } : {}) })
    expect(requirementCycles(new Map([['a', quest('a', [needs('b', true)])], ['b', quest('b', [needs('a')])]]))).toEqual(new Set())
    expect(requirementCycles(new Map([['a', quest('a', [{ all: [needs('b'), needs('c')], not: true }])], ['b', quest('b', [needs('a')])]])))
      .toEqual(new Set())
    expect([...requirementCycles(new Map([['a', quest('a', [{ all: [needs('b'), needs('c', true)] }])], ['b', quest('b', [needs('a')])]]))].sort())
      .toEqual(['a', 'b'])
  })

  it('the dependencies of a list leave reversed ones and reversed groups out', () => {
    const quest = canonicalQuest(EXAMPLE, 'q').quest!
    expect(dependencies(quest.requirements)).toEqual([])
    expect(dependencies(read({ requirements: [{ all: [{ type: 'quest_completed', quest: 'a' }, { type: 'quest_completed', quest: 'b', not: true }] }] }).quest!.requirements))
      .toEqual([{ type: 'quest_completed', args: [['quest', 'a']], not: false }])
  })

  it('the Worker loads every quest a requirement names (validate warns about each one that does not exist)', () => {
    const quest = read({
      requirements: [{ type: 'quest_completed', quest: 'before' }, { type: 'quest_completed', quest: 'never', not: true },
        { all: [{ type: 'quest_failed', quest: 'grouped' }, { type: 'quest_completed', quest: 'other' }], not: true },
        { all: [{ type: 'quest_failed', quest: 'inside' }, { type: 'level', min: 1 }] }],
      fail: { unless: [{ type: 'quest_completed', quest: 'gone', not: true }] },
    }).quest!
    expect(referencedQuests(quest, {}).sort()).toEqual(['before', 'gone', 'grouped', 'inside', 'never', 'other'])
  })
})

describe('describing reversed requirements and groups', () => {
  it('a reversed requirement reads "Not: <its line>" and keeps its quest link; a display replaces the line', () => {
    expect(describeRequirement({ type: 'quest_completed', quest: 'tutorial', not: true })).toEqual({ mini: 'Not: Complete tutorial', quest: 'tutorial' })
    expect(describeRequirement({ type: 'permission', node: 'rank.vip', not: true, display: '<red>No VIPs' }).mini).toBe('<red>No VIPs')
    expect(describeRequirement({ type: 'mystery', not: true }).mini).toBe('Not: Mystery')
  })

  it('a group is one line: All of / Not all of, or its display', () => {
    const members = [{ type: 'in_world', worlds: ['arena'] }, { type: 'permission', node: 'rank.vip', not: true }]
    expect(describeRequirement({ all: members }).mini).toBe('All of: Be in arena; Not: Permission rank.vip')
    expect(describeRequirement({ all: members, not: true }).mini).toBe('Not all of: Be in arena; Not: Permission rank.vip')
    expect(describeRequirement({ all: members, not: true, display: 'Not for high-level VIPs' }).mini).toBe('Not for high-level VIPs')
    expect(describeRequirement({ all: [{ type: 'quest_completed', quest: 'a' }, { type: 'permission', node: 'x' }] }).quest).toBe('a')
  })

  it('the lists of the preview read the same way', () => {
    expect(requirementLines(EXAMPLE.requirements).map((l) => l.mini)).toEqual(['Not: Complete tutorial', 'Not for high-level VIPs'])
    expect(describeFail(EXAMPLE.fail)!.unless.map((l) => l.mini)[0]).toBe('Not: Be in the nether')
    expect(describeFail(EXAMPLE.fail)!.unless[1]!.mini).toMatch(/^Not all of: Be in arena; /)
  })
})

describe('groups on the canvas', () => {
  const model = () => treeToModel(EXAMPLE, 'q')

  it('open and save unchanged: a group at req:i, its requirements at req:i:j', () => {
    const m = model()
    expect(m.requirements).toEqual(['req:0', 'req:1'])
    expect(m.entries['req:1']).toMatchObject({ category: 'requirement', members: ['req:1:0', 'req:1:1'], not: true, display: 'Not for high-level VIPs' })
    expect(m.entries['req:0']!.not).toBe(true)
    expect(m.fail.unless).toEqual(['fu:0', 'fu:1'])
    expect(parentOf(m, 'fu:1:1')).toEqual({ kind: 'group', group: 'fu:1' })
    expect(JSON.stringify(modelToTree(m))).toBe(JSON.stringify(EXAMPLE))
  })

  it('a requirement goes into a group and out of it again; a group goes in too, never inside itself', () => {
    const m = model()
    const g = addGroup(m, { kind: 'requirements' })
    expect(m.requirements).toEqual(['req:0', 'req:1', g])
    expect(attach(m, 'req:0', { kind: 'group', group: g })).toBeNull()
    const level = addEntry(m, 'requirement', 'level', { kind: 'group', group: g }, [['min', 5]])
    expect(m.entries[g]!.members).toEqual(['req:0', level])
    expect(modelToTree(m).requirements).toEqual([EXAMPLE.requirements[1], { all: [{ type: 'quest_completed', quest: 'tutorial', not: true }, { type: 'level', min: 5 }] }])
    expect(refusal(m, 'req:1', { kind: 'group', group: g })).toBeNull()
    expect(refusal(m, g, { kind: 'group', group: g })).toBe('a group cannot go inside itself')
    expect(refusal(m, 'obj:o', { kind: 'group', group: g })).toMatch(/objective goes/)
    expect(refusal(m, 'req:1:0', { kind: 'group', group: 'req:0' })).toBe('no such group')
    // Out: into the list the group sits in, right after it
    expect(leaveGroup(m, 'req:0')).toBeNull()
    expect(m.requirements).toEqual(['req:1', g, 'req:0'])
    expect(leaveGroup(m, 'req:0')).toBe('it is not in a group')
    // Out of a loose group: loose
    detach(m, g)
    expect(leaveGroup(m, level)).toBeNull()
    expect(m.loose).toContain(level)
  })

  it('reversing, ungrouping and deleting a group', () => {
    const m = model()
    expect(setReversed(m, 'req:1:0', true)).toBeNull()
    expect(setReversed(m, 'req:0', false)).toBeNull()
    expect(setReversed(m, 'obj:o', true)).toBe('only requirements and groups can be reversed')
    expect(modelToTree(m).requirements).toEqual([{ type: 'quest_completed', quest: 'tutorial' },
      { ...EXAMPLE.requirements[1], all: [{ type: 'permission', node: 'rank.vip', not: true }, { type: 'vanilla_level', value: 30 }] }])
    expect(retype(m, 'req:1', 'level', [])).toBe('a group has no type: it holds requirements')
    // Ungrouped, its requirements take its place
    expect(dissolveGroup(m, 'req:1')).toBeNull()
    expect(m.requirements).toEqual(['req:0', 'req:1:0', 'req:1:1'])
    expect(m.entries['req:1']).toBeUndefined()
    // A reversed group of one hands its not to its requirement
    const g = addGroup(m, { kind: 'unless' })
    attach(m, 'req:0', { kind: 'group', group: g })
    setReversed(m, g, true)
    dissolveGroup(m, g)
    expect((modelToTree(m).fail as { unless: unknown[] }).unless.at(-1)).toEqual({ type: 'quest_completed', quest: 'tutorial', not: true })
    // Deleted, its requirements stay on the canvas, loose
    removeEntry(m, 'fu:1')
    expect(m.loose).toEqual(['fu:1:0', 'fu:1:1'])
  })

  it('a loose group keeps its requirements in the layout', () => {
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest({ id: 'q', body: EXAMPLE, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    const state = ws.quests.q!
    detach(state.model, 'req:1')
    const reopened = treeToModel(modelToTree(state.model), 'q', layoutOf(state))
    expect(reopened.loose).toEqual(['req:1'])
    expect(reopened.entries['req:1']!.members).toEqual(['req:1:0', 'req:1:1'])
    expect(reopened.entries['req:1:1']!.type).toBe('vanilla_level')
  })

  it('a problem in a group points at its requirement', () => {
    const m = model()
    expect(partOf(m, 'requirements[1].all[1].value')).toBe('req:1:1')
    expect(partOf(m, 'requirements[1]')).toBe('req:1')
    expect(partOf(m, 'fail.unless[1].all[0]')).toBe('fu:1:0')
  })

  it('lays a group\'s requirements out inside it, and draws them as its children without lines', () => {
    const m = model()
    const at = autoLayout(m)
    expect(at['req:1:1']).toEqual({ x: at['req:1']!.x + memberOffset(1).x, y: at['req:1']!.y + GROUP.header + GROUP.row })
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest({ id: 'q', body: EXAMPLE, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    const { nodes, edges } = deriveFlow(ws, checkWorkspace(ws, null, () => undefined))
    const group = nodes.find((n) => n.id === 'p|q|req:1')!
    expect(group.type).toBe('requirement-group')
    expect(nodes.find((n) => n.id === 'p|q|req:1:0')).toMatchObject({ parentNode: 'p|q|req:1', position: memberOffset(0) })
    expect(nodes.findIndex((n) => n.id === 'p|q|req:1')).toBeLessThan(nodes.findIndex((n) => n.id === 'p|q|req:1:0'))
    expect(edges.some((e) => e.id === 'e|q|req:1:0')).toBe(false)
    expect(edges.find((e) => e.id === 'e|q|req:1')).toMatchObject({ target: 'p|q|start', targetHandle: 'req' })
  })

  it('a requirement wired to a group\'s dot goes into it; a group wires to the Start or the fail rules', () => {
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest({ id: 'q', body: EXAMPLE, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    expect(interpret(ws, { source: 'p|q|req:0', sourceHandle: 'out', target: 'p|q|fu:1', targetHandle: 'req' }))
      .toEqual({ ok: true, action: { kind: 'attach', quest: 'q', nid: 'req:0', parent: { kind: 'group', group: 'fu:1' } } })
    expect(interpret(ws, { source: 'p|q|req:1', sourceHandle: 'out', target: 'p|q|fu:1', targetHandle: 'req' }))
      .toEqual({ ok: true, action: { kind: 'attach', quest: 'q', nid: 'req:1', parent: { kind: 'group', group: 'fu:1' } } })
    expect(interpret(ws, { source: 'p|q|req:1', sourceHandle: 'out', target: 'p|q|fail', targetHandle: 'unless' }))
      .toEqual({ ok: true, action: { kind: 'attach', quest: 'q', nid: 'req:1', parent: { kind: 'unless' } } })
  })

  it('a reversed quest_completed draws no unlock line, nor one in a reversed group; one in a plain group does', () => {
    const ws = emptyWorkspace('w')
    const body = {
      id: 'b', name: 'B', pool: 'p',
      requirements: [
        { type: 'quest_completed', quest: 'a', not: true },
        { all: [{ type: 'quest_completed', quest: 'c' }, { type: 'quest_failed', quest: 'd' }] },
        { all: [{ type: 'quest_completed', quest: 'e' }, { type: 'permission', node: 'x' }], not: true },
        { all: [{ type: 'quest_completed', quest: 'f', not: true }, { type: 'permission', node: 'x' }] },
      ],
      objectives: { o: { type: 'fish', amount: 1 } },
    }
    putQuest(ws, loadedQuest({ id: 'b', body, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    expect(links(ws).map((l) => `${l.from} ${l.kind} ${l.to} (${l.nid})`)).toEqual(['c unlocks b (req:1:0)', 'd fail-unlocks b (req:1:1)'])
  })
})

describe('any groups (or)', () => {
  const ANY = {
    id: 'q', name: 'Q', pool: 'p',
    requirements: [
      { any: [{ type: 'quest_completed', quest: 'a' }, { type: 'permission', node: 'rank.vip' }] },
      { any: [{ type: 'in_world', worlds: ['arena'] }, { type: 'permission', node: 'x', not: true }], not: true, display: 'Not in the arena' },
    ],
    objectives: { o: { type: 'fish', amount: 1 } },
    fail: { unless: [{ type: 'in_world', worlds: ['arena'] }, { any: [{ type: 'in_dimension', dimensions: ['nether'] }, { type: 'permission', node: 'y' }], not: true }] },
  }
  const one = { type: 'permission', node: 'a' }
  const needs = (q: string, not = false) => ({ type: 'quest_completed', quest: q, ...(not ? { not: true } : {}) })

  it('read and write back exactly, in both lists', () => {
    const { body, quest, problems } = canonicalQuest(ANY, 'q')
    expect(problems).toEqual([])
    expect(JSON.stringify(body)).toBe(JSON.stringify(ANY))
    expect(quest!.requirements[1]).toMatchObject({ mode: 'any', not: true, display: 'Not in the arena' })
    expect(JSON.stringify(modelToTree(treeToModel(ANY, 'q')))).toBe(JSON.stringify(ANY))
  })

  it('report the same problems as all groups, with any in the path and the text', () => {
    expect(problemsOf({ requirements: [{ all: [one, one], any: [one, one] }] })).toEqual(['error requirements[0]: a group has all or any, not both'])
    expect(problemsOf({ requirements: [{ any: [] }] })).toEqual(['error requirements[0].any: empty: a group needs requirements'])
    expect(problemsOf({ requirements: [{ any: [one] }] })).toEqual(['warning requirements[0].any: a group of one requirement: use the requirement itself'])
    expect(problemsOf({ requirements: [{ any: [{ all: [one, one] }, one] }] })).toEqual([])
    expect(problemsOf({ requirements: [{ any: [{ any: [one, one] }, one] }] })).toEqual([])
    expect(problemsOf({ requirements: [{ type: 'permission', any: [one, one] }] }))
      .toEqual(['error requirements[0]: a group (any:) has no type: put the requirements under any'])
    expect(problemsOf({ requirements: [{ any: [one, one], every: 1 }] })).toEqual(['warning requirements[0].every: ignored by a group (it accepts all, any, not, display)'])
    expect(problemsOf({ fail: { unless: [{ any: [one, { ...one, not: 'x' }] }] } })).toEqual(['error fail.unless[0].any[1].not: must be true or false'])
  })

  it('an any group is met when one requirement is, else unknown when one is, else unmet; then its not ("none of")', () => {
    const r = (truth: Truth, not = false): Requirement => ({ type: truth, args: [], not })
    const judge = (requirement: Requirement) => requirement.type as Truth
    const any = (members: Requirement[], not = false): RequirementEntry => ({ mode: 'any', group: members, not, display: '' })
    const cases: [Requirement[], Truth, Truth][] = [
      [[r('unmet'), r('met')], 'met', 'unmet'],
      [[r('unknown'), r('met')], 'met', 'unmet'],
      [[r('unmet'), r('unknown')], 'unknown', 'unknown'],
      [[r('unmet'), r('unmet')], 'unmet', 'met'],
      [[r('met', true), r('unmet')], 'unmet', 'met'],
      [[r('met', true), r('unknown', true)], 'unknown', 'unknown'],
      [[r('unmet', true), r('unknown')], 'met', 'unmet'],
    ]
    for (const [members, plain, reversed] of cases) {
      expect(evaluateEntry(any(members), judge)).toBe(plain)
      expect(evaluateEntry(any(members, true), judge)).toBe(reversed)
    }
    expect(evaluateEntries([any([r('unmet'), r('met')]), r('met')], judge)).toBe('met')
    expect(evaluateEntries([any([r('unmet'), r('unmet')]), r('unknown')], judge)).toBe('unmet')
  })

  it('a requirement must hold only in an all group not reversed (itself not reversed) or a reversed any group (itself reversed)', () => {
    const deps = (requirements: unknown[]) => dependencies(read({ requirements }).quest!.requirements).map((r) => r.args[0]![1])
    expect(deps([{ any: [needs('a'), needs('b')] }])).toEqual([])
    expect(deps([{ any: [needs('a', true), needs('b', true)] }])).toEqual([])
    expect(deps([{ any: [needs('a', true), needs('b', true)], not: true }])).toEqual(['a', 'b'])
    expect(deps([{ any: [needs('a', true), needs('b')], not: true }])).toEqual(['a'])
    expect(deps([{ all: [needs('a'), needs('b', true)] }, needs('c'), needs('d', true)])).toEqual(['a', 'c'])
  })

  it('so only those link quests: cycles, "cannot require itself", unlock lines', () => {
    const quest = (id: string, requirements: unknown[]) => read({ requirements }, id).quest!
    expect([...requirementCycles(new Map([['a', quest('a', [{ any: [needs('b', true), needs('c', true)], not: true }])], ['b', quest('b', [needs('a')])]]))].sort())
      .toEqual(['a', 'b'])
    expect(requirementCycles(new Map([['a', quest('a', [{ any: [needs('b'), needs('c')] }])], ['b', quest('b', [needs('a')])]]))).toEqual(new Set())
    const CTX: ValidateContext = { catalog: CATALOG, pools: null, questExists: () => true }
    const errors = (requirements: unknown[]) => validateQuest(read({ requirements }).quest!, CTX).filter((p) => p.error).map((p) => `${p.path}: ${p.message}`)
    expect(errors([{ any: [needs('q'), one] }])).toEqual([])
    expect(errors([{ any: [needs('q', true), { ...one, not: true }], not: true }])).toEqual(['requirements[0].any[0].quest: a quest cannot require itself'])

    const ws = emptyWorkspace('w')
    const body = {
      id: 'b', name: 'B', pool: 'p',
      requirements: [{ any: [needs('a'), needs('c')] }, { any: [needs('d', true), { type: 'quest_failed', quest: 'e', not: true }], not: true }],
      objectives: { o: { type: 'fish', amount: 1 } },
    }
    putQuest(ws, loadedQuest({ id: 'b', body, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    expect(links(ws).map((l) => `${l.from} ${l.kind} ${l.to} (${l.nid})`)).toEqual(['d unlocks b (req:1:0)', 'e fail-unlocks b (req:1:1)'])
  })

  it('read Any of / None of, or their display', () => {
    const members = [{ type: 'in_world', worlds: ['arena'] }, { type: 'permission', node: 'rank.vip', not: true }]
    expect(describeRequirement({ any: members }).mini).toBe('Any of: Be in arena; Not: Permission rank.vip')
    expect(describeRequirement({ any: members, not: true }).mini).toBe('None of: Be in arena; Not: Permission rank.vip')
    expect(describeRequirement({ any: members, display: 'Arena or no VIP' }).mini).toBe('Arena or no VIP')
    expect(requirementLines(ANY.requirements).map((l) => l.mini)).toEqual(['Any of: Complete a; Permission rank.vip', 'Not in the arena'])
    expect(describeFail(ANY.fail)!.unless[1]!.mini).toBe('None of: Be in the nether; Permission y')
  })

  it('on the canvas: a group switches between all and any, kept by undo', () => {
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest({ id: 'q', body: ANY, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
    const m = ws.quests.q!.model
    expect(m.entries['req:0']).toMatchObject({ type: 'any', members: ['req:0:0', 'req:0:1'] })
    expect(partOf(m, 'requirements[1].any[1].node')).toBe('req:1:1')
    const history = new History<WorkspaceModel>()
    history.record(JSON.parse(JSON.stringify(ws)) as WorkspaceModel)
    expect(setGroupMode(m, 'req:0', 'all')).toBeNull()
    expect(modelToTree(m).requirements).toEqual([{ all: ANY.requirements[0]!.any }, ANY.requirements[1]])
    expect(setGroupMode(m, 'obj:o', 'any')).toBe('it is not a group')
    const before = history.undo(ws)!
    expect(modelToTree(before.quests.q!.model).requirements).toEqual(ANY.requirements)
    // A new group is an all group
    const g = addGroup(m, { kind: 'requirements' })
    expect(m.entries[g]!.type).toBe('all')
  })
})
