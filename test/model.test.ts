import { describe, expect, it } from 'vitest'
import { autoLayout, partSize, SIZE } from '../src/creator/layout'
import { modelToTree, newQuestModel, stageNumbers, treeToModel } from '../src/creator/model'
import { addEntry, addStage, attach, detach, moveStageAfter, parentOf, refusal, removeStage, renumberStages, resetNotice, retype, shift } from '../src/creator/ops'
import { History } from '../src/creator/history'
import {
  emptyWorkspace, ghosts, isDirty, layoutOf, link, linkedIds, linkRefusal, links, loadedQuest, newQuest, putQuest, saveRequest, unlink,
} from '../src/creator/workspace'
import type { QuestDoc } from '../shared/creator'
import { seedQuests } from './seed'

const doc = (id: string, body: Record<string, unknown>): QuestDoc =>
  ({ id, body, layout: null, updatedAt: 100, updatedBy: 'seed', source: 'server', webPending: false })

describe('the quest model', () => {
  it.each(seedQuests().map((q) => [q.id, q] as const))('%s opens and saves unchanged', (_, q) => {
    const model = treeToModel(q.body, q.id)
    expect(JSON.stringify(modelToTree(model))).toBe(JSON.stringify(q.body))
  })

  it('a new quest has one empty stage and is written with what it needs', () => {
    const model = newQuestModel('hydra_hunt', 'daily')
    expect(model.chain).toHaveLength(1)
    addEntry(model, 'objective', 'kill_mob', { kind: 'stage', stage: model.chain[0]! }, [['entities', ['minecraft:zombie']]])
    expect(modelToTree(model)).toEqual({ id: 'hydra_hunt', name: '<white>hydra hunt', pool: 'daily',
      objectives: { kill_mob: { type: 'kill_mob', amount: 1, entities: ['minecraft:zombie'] } } })
  })

  it('fail actions open and save unchanged, and connect to the fail rules', () => {
    const body = { id: 'q', name: 'Q', pool: 'p', objectives: { o: { type: 'fish', amount: 1 } },
      fail: { when: [{ type: 'die', amount: 1 }], result: 'cooldown', cooldown: '1h', actions: [{ type: 'start_quest', quest: 'retry' }, { type: 'message', text: 'hi' }] } }
    const model = treeToModel(body, 'q')
    expect(model.fail.actions).toEqual(['fa:0', 'fa:1'])
    expect(JSON.stringify(modelToTree(model))).toBe(JSON.stringify(body))
    const reward = addEntry(model, 'reward', 'command', { kind: 'actions' }, [['run', 'say failed']])
    expect(parentOf(model, reward)).toEqual({ kind: 'actions' })
    expect(refusal(model, 'obj:o', { kind: 'actions' })).toMatch(/objective goes/)
    expect((modelToTree(model).fail as { actions: unknown[] }).actions).toHaveLength(3)
  })

  it('keeps argument order and arguments the type does not know', () => {
    const body = { id: 'q', name: 'Q', pool: 'p', objectives: { o: { type: 'fish', amount: 2, zeta: 1, alpha: 'x', items: ['minecraft:cod'] } } }
    expect(JSON.stringify(modelToTree(treeToModel(body, 'q')))).toBe(JSON.stringify(body))
  })

  it('keeps scope: account, and character is not written', () => {
    const body = { id: 'q', name: 'Q', pool: 'p', hidden_until_unlocked: true, no_teleport: true, scope: 'account', objectives: { o: { type: 'fish', amount: 1 } } }
    const model = treeToModel(body, 'q')
    expect(model.settings.scope).toBe('account')
    expect(JSON.stringify(modelToTree(model))).toBe(JSON.stringify(body))
    model.settings.scope = 'character'
    expect(modelToTree(model)).not.toHaveProperty('scope')
    expect(newQuestModel('fresh', 'p').settings.scope).toBe('character')
  })

  it('a draft from before scope saves as character', () => {
    const model = treeToModel({ id: 'q', name: 'Q', pool: 'p', objectives: { o: { type: 'fish', amount: 1 } } }, 'q')
    delete (model.settings as Partial<typeof model.settings>).scope
    expect(modelToTree(model)).not.toHaveProperty('scope')
  })
})

describe('the rules of the canvas', () => {
  const quest = () => treeToModel({
    id: 'q', name: 'Q', pool: 'p',
    objectives: { a: { type: 'fish' }, b: { type: 'kill_mob', stage: 1 } },
    requirements: [{ type: 'level', min: 5 }],
    rewards: [{ type: 'item', item: 'minecraft:diamond' }],
  }, 'q')

  it('an entry sits in one place: connecting it elsewhere moves it', () => {
    const model = quest()
    expect(parentOf(model, 'obj:a')).toEqual({ kind: 'stage', stage: 'stage:0' })
    expect(attach(model, 'obj:a', { kind: 'stage', stage: 'stage:1' })).toBeNull()
    expect(model.stages['stage:0']!.objectives).toEqual([])
    expect(model.stages['stage:1']!.objectives).toEqual(['obj:b', 'obj:a'])
    // stage 0 is empty now: left out; stage 1 keeps its number (players on it stay on it)
    expect(modelToTree(model).objectives).toEqual({ a: { type: 'fish', amount: 1, stage: 1 }, b: { type: 'kill_mob', amount: 1, stage: 1 } })
  })

  it('objectives, requirements and rewards only go where they belong', () => {
    const model = quest()
    expect(refusal(model, 'req:0', { kind: 'rewards' })).toMatch(/requirement goes/)
    expect(refusal(model, 'rew:0', { kind: 'stage', stage: 'stage:0' })).toMatch(/reward goes/)
    expect(refusal(model, 'req:0', { kind: 'unless' })).toBeNull()
    const custom = addEntry(model, 'objective', 'custom')
    expect(refusal(model, custom, { kind: 'when' })).toMatch(/custom cannot be a fail condition/)
  })

  it('an objective moved to the fail rules is written there, without a stage', () => {
    const model = quest()
    expect(attach(model, 'obj:b', { kind: 'when' })).toBeNull()
    const tree = modelToTree(model)
    expect(tree.objectives).toEqual({ a: { type: 'fish', amount: 1 } })
    expect(tree.fail).toEqual({ when: [{ type: 'kill_mob', amount: 1 }] })
  })

  it('loose parts are never written', () => {
    const model = quest()
    detach(model, 'rew:0')
    addEntry(model, 'reward', 'item')
    expect(modelToTree(model).rewards).toBeUndefined()
    expect(model.loose).toHaveLength(2)
    // ...but they stay on the canvas: the layout keeps them
    const state = { model, base: null, positions: {} }
    const reopened = treeToModel(modelToTree(model), 'q', layoutOf(state))
    expect(reopened.loose).toHaveLength(2)
  })

  it('stage numbers stay unless the stages are reordered', () => {
    const model = treeToModel({ id: 'q', name: 'Q', pool: 'p', objectives: { a: { type: 'fish', stage: 2 }, b: { type: 'fish', stage: 5 } } }, 'q')
    expect(stageNumbers(model)).toEqual({ numbers: new Map([['stage:2', 2], ['stage:5', 5]]), renumbered: false })
    const added = addStage(model)
    addEntry(model, 'objective', 'fish', { kind: 'stage', stage: added })
    expect(stageNumbers(model).numbers.get(added)).toBe(6)
    expect(moveStageAfter(model, 'stage:5', null)).toBe(true)
    expect(stageNumbers(model)).toMatchObject({ renumbered: true })
    expect(modelToTree(model).objectives).toEqual({ a: { type: 'fish', amount: 1, stage: 1 }, b: { type: 'fish', amount: 1 }, fish: { type: 'fish', amount: 1, stage: 2 } })
    renumberStages(model)
    expect(stageNumbers(model).renumbered).toBe(false)
  })

  it('removing a stage keeps its objectives, loose', () => {
    const model = quest()
    removeStage(model, 'stage:1')
    expect(model.loose).toEqual(['obj:b'])
    expect(Object.keys(modelToTree(model).objectives as object)).toEqual(['a'])
  })

  it('order among siblings changes with shift', () => {
    const model = quest()
    addEntry(model, 'requirement', 'permission', { kind: 'requirements' }, [['node', 'vip']])
    expect(shift(model, 'req:0', 1)).toBe(true)
    expect((modelToTree(model).requirements as { type: string }[]).map((r) => r.type)).toEqual(['permission', 'level'])
    expect(shift(model, 'req:0', 1)).toBe(false)
  })

  it('lays out the same way every time', () => {
    expect(autoLayout(quest())).toEqual(autoLayout(quest()))
    // The requirement (220 wide), then room for its line to the Start
    expect(autoLayout(quest()).start).toEqual({ x: 320, y: 0 })
  })

  it('leaves room for a line between parts wired side by side', () => {
    const model = treeToModel({
      id: 'q', name: 'Q', pool: 'p',
      objectives: { a: { type: 'fish' }, b: { type: 'kill_mob', stage: 1 } },
      requirements: [{ type: 'level', min: 5 }, { all: [{ type: 'permission', node: 'a' }, { type: 'permission', node: 'b' }] }],
      rewards: [{ type: 'item', item: 'minecraft:diamond' }],
      fail: { unless: [{ type: 'permission', node: 'c' }] },
    }, 'q')
    const at = autoLayout(model)
    const gap = (left: string, right: string) => at[right]!.x - (at[left]!.x + partSize(model, left).w)
    // Every requirement and fail.unless entry, the widest a group, to the Start / the fail rules
    for (const nid of [...model.requirements, ...model.fail.unless]) expect(gap(nid, model.fail.unless.includes(nid) ? 'fail' : 'start')).toBeGreaterThanOrEqual(100)
    // Along the stage chain, and to the rewards
    const chain = ['start', ...model.chain, 'finish']
    for (let i = 0; i + 1 < chain.length; i++) expect(gap(chain[i]!, chain[i + 1]!)).toBe(100)
    expect(at[model.rewards[0]!]!.x - (at.finish!.x + SIZE.finish.w)).toBe(100)
  })
})

describe('workspaces', () => {
  const workspace = () => {
    const ws = emptyWorkspace('act-1')
    putQuest(ws, loadedQuest(doc('a', { id: 'a', name: 'A', pool: 'p', objectives: { o: { type: 'fish' } }, rewards: [{ type: 'start_quest', quest: 'b' }] })))
    putQuest(ws, loadedQuest(doc('b', { id: 'b', name: 'B', pool: 'p', objectives: { o: { type: 'fish' } },
      requirements: [{ type: 'quest_completed', quest: 'a' }, { type: 'quest_completed', quest: 'elsewhere' }] })))
    return ws
  }

  it('reads the lines from the quests', () => {
    const ws = workspace()
    expect(links(ws).map((l) => `${l.kind} ${l.from}->${l.to}`)).toEqual(['starts a->b', 'unlocks a->b', 'unlocks elsewhere->b'])
    expect(ghosts(ws)).toEqual(['elsewhere'])
    expect(linkedIds(ws, 'b')).toEqual(['elsewhere'])
  })

  it('drawing a line edits the quest that holds it', () => {
    const ws = workspace()
    putQuest(ws, newQuest('c', 'p'))
    expect(link(ws, 'starts', 'b', 'c')).toBeNull()
    expect(modelToTree(ws.quests.b!.model).rewards).toEqual([{ type: 'start_quest', quest: 'c' }])
    expect(link(ws, 'unlocks', 'b', 'c')).toBeNull()
    expect(modelToTree(ws.quests.c!.model).requirements).toEqual([{ type: 'quest_completed', quest: 'b' }])
    expect(linkRefusal(ws, 'starts', 'b', 'c')).toMatch(/already/)
    expect(linkRefusal(ws, 'starts', 'c', 'c')).toMatch(/itself/)
    unlink(ws, links(ws).find((l) => l.kind === 'starts' && l.from === 'b')!)
    expect(modelToTree(ws.quests.b!.model).rewards).toBeUndefined()
  })

  it('a start_quest in the fail actions is an "on fail" line', () => {
    const ws = workspace()
    putQuest(ws, newQuest('c', 'p'))
    expect(link(ws, 'fails', 'b', 'c')).toBeNull()
    expect((modelToTree(ws.quests.b!.model).fail as { actions: unknown[] }).actions).toEqual([{ type: 'start_quest', quest: 'c' }])
    expect(links(ws).filter((l) => l.kind === 'fails').map((l) => `${l.from}->${l.to}`)).toEqual(['b->c'])
    expect(linkRefusal(ws, 'fails', 'c', 'c')).toMatch(/cannot start itself/)
  })

  it('a quest_failed requirement is an "on fail unlocks" line', () => {
    const ws = workspace()
    putQuest(ws, newQuest('c', 'p'))
    expect(link(ws, 'fail-unlocks', 'b', 'c')).toBeNull()
    expect(modelToTree(ws.quests.c!.model).requirements).toEqual([{ type: 'quest_failed', quest: 'b' }])
    expect(links(ws).filter((l) => l.kind === 'fail-unlocks').map((l) => `${l.from}->${l.to} held by ${l.holder}`)).toEqual(['b->c held by c'])
  })

  it('objective and stage rewards open, save unchanged and connect where they belong', () => {
    const body = { id: 'q', name: 'Q', pool: 'p',
      objectives: { kill: { type: 'kill_mob', amount: 2, rewards: [{ type: 'message', text: 'kill done' }] }, boss: { type: 'fish', amount: 1, stage: 1 } },
      stages: { 0: { rewards: [{ type: 'message', text: 'stage 0' }] }, 1: { rewards: [{ type: 'start_quest', quest: 'next' }] } },
      rewards: [{ type: 'message', text: 'done' }] }
    const model = treeToModel(body, 'q')
    expect(JSON.stringify(modelToTree(model))).toBe(JSON.stringify(body))
    expect(parentOf(model, 'orw:kill:0')).toEqual({ kind: 'objective-rewards', objective: 'obj:kill' })
    expect(parentOf(model, 'srw:1:0')).toEqual({ kind: 'stage-rewards', stage: 'stage:1' })
    expect(refusal(model, 'obj:boss', { kind: 'stage-rewards', stage: 'stage:0' })).toMatch(/objective goes/)

    // A reward added to the boss, and the stage rewards follow a reorder
    const reward = addEntry(model, 'reward', 'message', { kind: 'objective-rewards', objective: 'obj:boss' }, [['text', 'boss done']])
    expect((modelToTree(model).objectives as Record<string, { rewards?: unknown[] }>).boss!.rewards).toEqual([{ type: 'message', text: 'boss done' }])
    moveStageAfter(model, 'stage:1', null)
    renumberStages(model)
    expect(JSON.stringify(modelToTree(model).stages)).toBe(JSON.stringify({ 0: { rewards: [{ type: 'start_quest', quest: 'next' }] },
      1: { rewards: [{ type: 'message', text: 'stage 0' }] } }))

    // A fail condition gives no rewards: moving the objective there leaves them loose
    attach(model, 'obj:boss', { kind: 'when' })
    expect(model.loose).toContain(reward)
    expect(refusal(model, reward, { kind: 'objective-rewards', objective: 'obj:boss' })).toMatch(/fail condition/)

    // A start_quest in a stage's rewards draws a starts line
    const ws = emptyWorkspace('w')
    putQuest(ws, loadedQuest(doc('a', { id: 'a', name: 'A', pool: 'p', objectives: { o: { type: 'fish', amount: 1 } },
      stages: { 0: { rewards: [{ type: 'start_quest', quest: 'b' }] } } })))
    expect(links(ws).map((l) => `${l.kind} ${l.from}->${l.to}`)).toEqual(['starts a->b'])
  })

  it('objectives are written in the order each stage shows them, keeping how stages interleave', () => {
    const body = { id: 'q', name: 'Q', pool: 'p', objectives: {
      a: { type: 'fish', amount: 1 }, x: { type: 'fish', amount: 1, stage: 1 }, b: { type: 'fish', amount: 1 }, c: { type: 'fish', amount: 1 } } }
    const model = treeToModel(body, 'q')
    expect(shift(model, 'obj:c', -1)).toBe(true)
    expect(Object.keys(modelToTree(model).objectives as object)).toEqual(['a', 'x', 'c', 'b'])
    // Saved and opened again, it stays moved
    const again = treeToModel(modelToTree(model), 'q')
    expect(again.stages[again.chain[0]!]!.objectives).toEqual(['obj:a', 'obj:c', 'obj:b'])
    // Dropped at the top of the other stage, it is written there too
    expect(attach(model, 'obj:b', { kind: 'stage', stage: model.chain[1]! }, 0)).toBeNull()
    expect(Object.keys(modelToTree(model).objectives as object)).toEqual(['a', 'b', 'x', 'c'])
  })

  it('resetting a notice drops only that event', () => {
    const model = treeToModel({ id: 'q', name: 'Q', pool: 'p', objectives: { a: { type: 'fish', amount: 1 } },
      notices: { start: { title: { title: 'Go' } }, complete: { sound: { sound: 'minecraft:ui.toast.challenge_complete' } } } }, 'q')
    resetNotice(model, 'start')
    expect(modelToTree(model).notices).toEqual({ complete: { sound: { sound: 'minecraft:ui.toast.challenge_complete' } } })
  })

  it('changing a type drops what the new type does not have, like the in-game editor', () => {
    const body = { id: 'q', name: 'Q', pool: 'p',
      objectives: { kill: { type: 'kill_mob', amount: 3, display: 'Hunt', entities: ['minecraft:zombie'], rewards: [{ type: 'message', text: 'x' }] } },
      rewards: [{ type: 'item', item: 'minecraft:diamond', amount: 2, display: 'Shiny' }],
      fail: { when: [{ type: 'die', amount: 1, display: 'Do not die' }] } }
    const model = treeToModel(body, 'q')
    expect(retype(model, 'obj:kill', 'fish', ['items'])).toBeNull()
    expect(retype(model, model.rewards[0]!, 'command', ['run'])).toBeNull()
    const tree = modelToTree(model)
    expect(tree.objectives).toEqual({ kill: { type: 'fish', amount: 3, display: 'Hunt', rewards: [{ type: 'message', text: 'x' }] } })
    expect(tree.rewards).toEqual([{ type: 'command', display: 'Shiny' }])
    // A fail condition keeps its display line, and cannot become custom
    expect((tree.fail as { when: unknown[] }).when).toEqual([{ type: 'die', amount: 1, display: 'Do not die' }])
    expect(retype(model, model.fail.when[0]!, 'custom', [])).toMatch(/custom cannot/)
  })

  it('saves only what changed, and new quests', () => {
    const ws = workspace()
    expect(isDirty(ws.quests.a!)).toBe(false)
    putQuest(ws, newQuest('c', 'p'))
    expect(saveRequest(ws).quests.map((q) => q.id)).toEqual(['c'])
    ws.quests.a!.model.settings.name = 'A!'
    const request = saveRequest(ws)
    expect(request.quests.map((q) => q.id)).toEqual(['a', 'c'])
    expect(request.quests.find((q) => q.id === 'a')?.baseUpdatedAt).toBe(100)
    expect(request.quests.find((q) => q.id === 'c')?.baseUpdatedAt).toBeNull()
    expect(request.workspace?.body.quests.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('positions are saved under the ids the parts get when reopened', () => {
    const state = newQuest('c', 'p')
    const stage = state.model.chain[0]!
    const nid = addEntry(state.model, 'objective', 'fish', { kind: 'stage', stage })
    state.positions[nid] = { x: 10.4, y: 20 }
    expect(layoutOf(state).positions).toEqual({ 'obj:fish': { x: 10, y: 20 } })
  })

  it('undo and redo whole workspaces', () => {
    const ws = workspace()
    const history = new History<typeof ws>()
    history.record(ws)
    ws.quests.a!.model.settings.name = 'changed'
    const back = history.undo(ws)!
    expect(back.quests.a!.model.settings.name).toBe('A')
    expect(history.redo(back)!.quests.a!.model.settings.name).toBe('changed')
  })
})
