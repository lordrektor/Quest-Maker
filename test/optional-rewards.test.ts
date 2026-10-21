import { describe, expect, it } from 'vitest'
import type { Catalog, Tree } from '../shared/creator'
import { canonicalQuest, GROUP_DEPTH_MESSAGE, REWARD_REQUIREMENTS_PLACE } from '../shared/quest/canonical'
import { requirementCycles, validateQuest } from '../shared/quest/validate'
import { describeAction, describeReward, rewardLines } from '../src/describe'
import { deriveFlow, partPositions } from '../src/creator/canvas/flow'
import { entryTree, modelToTree, treeToModel } from '../src/creator/model'
import {
  addEntry, addGroup, attach, clearRewardRequirements, detach, parentOf, refusal, removeEntry, REWARD_REQUIREMENTS_MOVE, useOf,
} from '../src/creator/ops'
import { checkWorkspace, partOf } from '../src/creator/problems'
import { emptyWorkspace, layoutOf, links, loadedQuest, putQuest } from '../src/creator/workspace'
import { referencedQuests } from '../worker/creator'
import { CATALOG } from './fixtures'

const perm = (node: string) => ({ type: 'permission', node })
const needs = (quest: string) => ({ type: 'quest_completed', quest })

/** Optional rewards: the quest's and an objective's, with requirements (groups too). */
const OPT = {
  id: 'q', name: 'Q', pool: 'p',
  objectives: {
    kill: { type: 'kill_mob', amount: 1, rewards: [{ type: 'vanilla_experience', amount: 5, requirements: [{ any: [perm('a'), { all: [perm('b'), needs('c')] }] }] }] },
  },
  rewards: [
    { type: 'item', item: 'minecraft:diamond', amount: 3, display: 'Gems', requirements: [perm('rank.vip')] },
    { type: 'item', item: 'minecraft:cod' },
  ],
}
const read = (tree: Tree, id = 'q') => canonicalQuest({ id, name: 'Q', pool: 'p', objectives: { o: { type: 'fish' } }, ...tree }, id)
const errors = (tree: Tree) => read(tree).problems.filter((p) => p.error).map((p) => `${p.path}: ${p.message}`)
const doc = (body: Tree, id = 'q') => loadedQuest({ id, body, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false })

describe('optional rewards in the canonical form', () => {
  it('read and write back exactly: requirements after the arguments and display, out of the type\'s arguments', () => {
    const { body, quest, problems } = canonicalQuest(OPT, 'q')
    expect(problems).toEqual([])
    expect(JSON.stringify(body)).toBe(JSON.stringify(OPT))
    expect(quest!.rewards[0]).toEqual({ type: 'item', args: [['item', 'minecraft:diamond'], ['amount', 3], ['display', 'Gems']],
      requirements: [{ type: 'permission', args: [['node', 'rank.vip']], not: false }] })
    expect(quest!.rewards[1]!.requirements).toBeUndefined()
    expect(JSON.stringify(modelToTree(treeToModel(OPT, 'q')))).toBe(JSON.stringify(OPT))
    // Written only when there are some
    expect(read({ rewards: [{ type: 'item', item: 'minecraft:cod', requirements: [] }] }).body!.rewards).toEqual([{ type: 'item', item: 'minecraft:cod' }])
  })

  it('are an error anywhere but the quest\'s rewards and an objective\'s', () => {
    const optional = { type: 'command', run: 'say hi', requirements: [perm('x')] }
    expect(errors({ stages: { 0: { rewards: [optional] } } })).toEqual([`stages.0.rewards[0].requirements: ${REWARD_REQUIREMENTS_PLACE}`])
    expect(errors({ stages: { 0: { callbacks: [optional] } } })).toEqual([`stages.0.callbacks[0].requirements: ${REWARD_REQUIREMENTS_PLACE}`])
    expect(errors({ objectives: { o: { type: 'fish', callbacks: [optional] } } })).toEqual([`objectives.o.callbacks[0].requirements: ${REWARD_REQUIREMENTS_PLACE}`])
    expect(errors({ callbacks: { complete: [optional] } })).toEqual([`callbacks.complete[0].requirements: ${REWARD_REQUIREMENTS_PLACE}`])
    expect(errors({ fail: { actions: [optional] } })).toEqual([`fail.actions[0].requirements: ${REWARD_REQUIREMENTS_PLACE}`])
    // Still kept, so the editor can clear them
    expect((read({ fail: { actions: [optional] } }).body!.fail as Tree).actions).toEqual([optional])
  })

  it('use the requirement lists\' rules: groups nest three levels', () => {
    const one = perm('x')
    expect(errors({ rewards: [{ type: 'item', item: 'minecraft:cod', requirements: [{ all: [{ all: [{ all: [{ all: [one, one] }, one] }, one] }, one] }] }] }))
      .toEqual([`rewards[0].requirements[0].all[0].all[0].all[0]: ${GROUP_DEPTH_MESSAGE}`])
    expect(errors({ objectives: { o: { type: 'fish', rewards: [{ type: 'item', item: 'minecraft:cod', requirements: [{ any: [] }] }] } } }))
      .toEqual(['objectives.o.rewards[0].requirements[0].any: empty: a group needs requirements'])
  })
})

describe('checking optional rewards', () => {
  const TYPES: Catalog = {
    ...CATALOG,
    types: {
      ...CATALOG.types!,
      requirement: [...CATALOG.types!.requirement, { id: 'container_has_item', owner: 'Chronos', description: 'container', icon: 'minecraft:barrel', reads: ['spot'],
        params: [{ name: 'world', kind: 'STRING', required: true, default: null, min: null, description: 'world' }] }],
      requirementUses: { start: ['spot'], auto_start: [], fail_unless: [], reward: ['spot'] },
    },
  }
  const check = (tree: Tree) => validateQuest(read(tree).quest!, { catalog: TYPES, pools: null, questExists: (id) => id === 'q' })
    .map((p) => `${p.error ? 'error' : 'warning'} ${p.path}: ${p.message}`)
  const diamond = (requirements: unknown[]) => ({ rewards: [{ type: 'item', item: 'minecraft:diamond', requirements }] })

  it('checks each requirement like any other, with its path', () => {
    expect(check(diamond([perm('a'), { all: [{ type: 'permission' }, perm('b')] }]))).toEqual(['error rewards[0].requirements[1].all[0].node: missing: node'])
    expect(check({ objectives: { o: { type: 'fish', rewards: [{ type: 'item', item: 'minecraft:cod', requirements: [{ type: 'level', min: 'x' }] }] } } }))
      .toEqual(['error objectives.o.rewards[0].requirements[0].min: must be a whole number'])
  })

  it('in the reward use, which reads a spot', () => {
    expect(check(diamond([{ type: 'container_has_item', world: 'arena' }]))).toEqual([])
    expect(check({ auto_start: true, requirements: [{ type: 'container_has_item', world: 'arena' }] })[0]).toMatch(/cannot be used in the requirements of an auto_start quest/)
  })

  it('a quest naming itself means "completed before"; a quest that does not exist is not reported', () => {
    expect(check(diamond([needs('q')]))).toEqual([])
    expect(check(diamond([needs('ghost')]))).toEqual([])
    expect(check({ requirements: [needs('ghost')] })).toEqual(["warning requirements[0].quest: quest 'ghost' does not exist: this never passes"])
  })

  it('are no quest dependency: no cycle, no unlock line, nothing loaded for them', () => {
    const a = read(diamond([needs('b')]), 'a').quest!
    const b = read({ requirements: [needs('a')] }, 'b').quest!
    expect(requirementCycles(new Map([['a', a], ['b', b]]))).toEqual(new Set())
    expect(referencedQuests(a, {})).toEqual([])
    const ws = emptyWorkspace('w')
    putQuest(ws, doc({ id: 'a', name: 'A', pool: 'p', objectives: { o: { type: 'fish', amount: 1 } }, ...diamond([needs('b')]) }, 'a'))
    expect(links(ws)).toEqual([])
  })
})

describe('the sentence of an optional reward', () => {
  it('says when it is given', () => {
    expect(describeReward({ type: 'item', item: 'minecraft:diamond', amount: 3, requirements: [perm('rank.vip')] })!.mini)
      .toBe('3× diamond, only if: Permission rank.vip')
    expect(describeReward({ type: 'item', item: 'minecraft:diamond', display: 'Gems', requirements: [perm('a'), { any: [perm('b'), { all: [perm('c'), perm('d')] }] }] })!.mini)
      .toBe('Gems, only if: Permission a; Any of: Permission b; (All of: Permission c; Permission d)')
    expect(describeAction({ type: 'command', run: 'say hi', requirements: [{ ...perm('x'), not: true }] }).mini).toBe('Runs /say hi, only if: Not: Permission x')
    expect(rewardLines(OPT.rewards).map((l) => l.mini)).toEqual(['Gems, only if: Permission rank.vip', '1× cod'])
    expect(describeReward({ type: 'item', item: 'minecraft:cod' })!.mini).toBe('1× cod')
  })
})

describe('optional rewards in the editor', () => {
  it('their requirements are entries of the reward, not drawn on the canvas; its line says them', () => {
    const ws = emptyWorkspace('w')
    putQuest(ws, doc(OPT))
    const m = ws.quests.q!.model
    expect(m.entries['rew:0']!.requires).toEqual(['rew:0:if:0'])
    expect(m.entries['orw:kill:0']!.requires).toEqual(['orw:kill:0:if:0'])
    expect(m.entries['orw:kill:0:if:0']!.members).toEqual(['orw:kill:0:if:0:0', 'orw:kill:0:if:0:1'])
    expect(parentOf(m, 'rew:0:if:0')).toEqual({ kind: 'reward-requirements', reward: 'rew:0' })
    expect(useOf(m, { kind: 'reward-requirements', reward: 'rew:0' })).toBe('reward')
    expect(Object.keys(partPositions(m, {})).filter((k) => k.includes(':if:'))).toEqual([])
    const { nodes, edges } = deriveFlow(ws, checkWorkspace(ws, null, () => undefined))
    expect(nodes.some((n) => n.id.includes(':if:'))).toBe(false)
    expect(edges.some((e) => e.id.includes(':if:'))).toBe(false)
    expect(entryTree(m.entries['rew:0']!, m)).toEqual(OPT.rewards[0])
    expect(partOf(m, 'rewards[0].requirements[0].node')).toBe('rew:0')
  })

  it('a reward with requirements moves only where rewards take them', () => {
    const m = treeToModel(OPT, 'q')
    expect(refusal(m, 'rew:0', { kind: 'actions' })).toBe(REWARD_REQUIREMENTS_MOVE)
    expect(refusal(m, 'rew:0', { kind: 'stage-rewards', stage: 'stage:0' })).toBe(REWARD_REQUIREMENTS_MOVE)
    expect(refusal(m, 'rew:0', { kind: 'callback', event: 'complete' })).toBe(REWARD_REQUIREMENTS_MOVE)
    expect(attach(m, 'rew:0', { kind: 'actions' })).toBe(REWARD_REQUIREMENTS_MOVE)
    expect(refusal(m, 'rew:0', { kind: 'objective-rewards', objective: 'obj:kill' })).toBeNull()
    expect(refusal(m, 'rew:1', { kind: 'actions' })).toBeNull()
    // Cleared, it moves anywhere
    clearRewardRequirements(m, 'rew:0')
    expect(m.entries['rew:0:if:0']).toBeUndefined()
    expect(refusal(m, 'rew:0', { kind: 'actions' })).toBeNull()
  })

  it('requirements go on a reward that takes them, and stay with it', () => {
    const m = treeToModel(OPT, 'q')
    const added = addEntry(m, 'requirement', 'level', { kind: 'reward-requirements', reward: 'rew:1' }, [['min', 5]])
    expect(m.entries['rew:1']!.requires).toEqual([added])
    expect((modelToTree(m).rewards as Tree[])[1]).toEqual({ type: 'item', item: 'minecraft:cod', requirements: [{ type: 'level', min: 5 }] })
    const g = addGroup(m, { kind: 'reward-requirements', reward: 'rew:1' })
    expect(attach(m, added, { kind: 'group', group: g })).toBeNull()
    expect((modelToTree(m).rewards as Tree[])[1]!.requirements).toEqual([{ all: [{ type: 'level', min: 5 }] }])
    // Not into the quest's requirements, nor from them
    expect(refusal(m, added, { kind: 'requirements' })).toBe("a reward's requirements stay with that reward")
    expect(refusal(m, 'rew:0:if:0', { kind: 'group', group: g })).toBe("a reward's requirements stay with that reward")
    // A reward where rewards cannot have them takes none
    const action = addEntry(m, 'reward', 'command', { kind: 'actions' }, [['run', 'say hi']])
    expect(refusal(m, 'rew:0:if:0', { kind: 'reward-requirements', reward: action })).toBe(REWARD_REQUIREMENTS_PLACE)
  })

  it('go with their reward: deleted with it, kept with it when it is loose', () => {
    const state = doc(OPT)
    const m = state.model
    const reward = addEntry(m, 'reward', 'item', { kind: 'rewards' }, [['item', 'minecraft:emerald']])
    const requirement = addEntry(m, 'requirement', 'permission', { kind: 'reward-requirements', reward }, [['node', 'x']])
    detach(m, reward)
    const reopened = treeToModel(modelToTree(m), 'q', layoutOf(state))
    expect(reopened.loose).toContain(reward)
    expect(reopened.entries[reward]!.requires).toEqual([requirement])
    expect(reopened.entries[requirement]!.type).toBe('permission')
    removeEntry(m, 'orw:kill:0')
    expect(Object.keys(m.entries).filter((k) => k.startsWith('orw:kill:0'))).toEqual([])
  })
})
