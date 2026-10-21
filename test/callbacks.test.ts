import { describe, expect, it } from 'vitest'
import { canonicalQuest } from '../shared/quest/canonical'
import { validateQuest, type ValidateContext } from '../shared/quest/validate'
import { describeAction, describeReward } from '../src/describe'
import { modelToTree, treeToModel } from '../src/creator/model'
import { addEntry, attach, parentOf, refusal, removeCallbacks, removeEntry, removeStage } from '../src/creator/ops'
import { CATALOG } from './fixtures'

const BODY = {
  id: 'hunt', name: 'Hunt', pool: 'p',
  objectives: {
    whelps: { type: 'fish', amount: 3, rewards: [{ type: 'item', item: 'minecraft:bone' }], callbacks: [{ type: 'lightning' }] },
    boss: { type: 'fish', amount: 1, stage: 1 },
  },
  stages: { 0: { rewards: [{ type: 'item', item: 'minecraft:apple' }], callbacks: [{ type: 'set_weather', weather: 'thunder' }] }, 1: { callbacks: [{ type: 'set_time', time: 'day' }] } },
  rewards: [{ type: 'item', item: 'minecraft:diamond' }],
  fail: { when: [{ type: 'die', amount: 1 }] },
  callbacks: { start: [{ type: 'set_time', time: 'night' }], complete: [{ type: 'broadcast', text: 'done' }], expire: [{ type: 'start_quest', quest: 'again' }] },
}

describe('callbacks', () => {
  it('read and write like the plugin: after fail, events in order, stages and objectives after their rewards', () => {
    const { body, problems } = canonicalQuest({ ...BODY, callbacks: { expire: BODY.callbacks.expire, start: BODY.callbacks.start, complete: BODY.callbacks.complete } }, 'hunt')
    expect(problems).toEqual([])
    expect(Object.keys(body!)).toEqual(['id', 'name', 'pool', 'objectives', 'stages', 'rewards', 'fail', 'callbacks'])
    expect(Object.keys(body!.callbacks as object)).toEqual(['start', 'complete', 'expire'])
    expect(Object.keys((body!.objectives as Record<string, object>).whelps!)).toEqual(['type', 'amount', 'rewards', 'callbacks'])
    expect(JSON.stringify(body!.stages)).toBe(JSON.stringify(BODY.stages))
  })

  it('warns like the plugin', () => {
    const { problems } = canonicalQuest({ pool: 'p', objectives: { a: { type: 'fish' } }, callbacks: { sometimes: [] },
      fail: { when: [{ type: 'die', callbacks: [{ type: 'lightning' }] }] } }, 'q')
    expect(problems).toContainEqual({ path: 'callbacks.sometimes', message: 'unknown key, ignored', error: false })
    expect(problems).toContainEqual({ path: 'fail.when[0].callbacks', message: 'ignored: a fail condition has no callbacks', error: false })
    expect(canonicalQuest({ pool: 'p', objectives: { a: { type: 'fish' } }, callbacks: 'no' }, 'q').problems).toContainEqual(
      { path: 'callbacks', message: 'must be a mapping of event (start, complete, fail, abandon, expire) to actions', error: true })
  })

  it('are checked where they are', () => {
    const ctx: ValidateContext = { catalog: CATALOG, refs: {}, pools: new Map([['p', { type: 'global' }]]), questExists: () => true }
    const read = canonicalQuest({ pool: 'p', objectives: { a: { type: 'fish', callbacks: [{ type: 'nope' }] } },
      stages: { 4: { callbacks: [{ type: 'item', item: 'minecraft:apple' }] } }, callbacks: { abandon: [{ type: 'item' }] } }, 'q')
    const lines = validateQuest(read.quest!, ctx).map((p) => `${p.error ? 'E' : 'W'} ${p.path}`)
    expect(lines).toContain('E objectives.a.callbacks[0].type')
    expect(lines).toContain('W stages.4')
    expect(lines).toContain('E callbacks.abandon[0].item')
  })

  it('open, save unchanged and connect where they belong', () => {
    const model = treeToModel(BODY, 'hunt')
    expect(JSON.stringify(modelToTree(model))).toBe(JSON.stringify(canonicalQuest(BODY, 'hunt').body))
    expect(parentOf(model, 'cb:start:0')).toEqual({ kind: 'callback', event: 'start' })
    expect(parentOf(model, 'ocb:whelps:0')).toEqual({ kind: 'objective-callbacks', objective: 'obj:whelps' })
    expect(parentOf(model, 'scb:1:0')).toEqual({ kind: 'stage-callbacks', stage: 'stage:1' })
    expect(model.callbacksShown).toBe(true)
    expect(refusal(model, 'obj:boss', { kind: 'callback', event: 'fail' })).toMatch(/objective goes/)

    // Any reward type can be a callback
    const act = addEntry(model, 'reward', 'command', { kind: 'callback', event: 'fail' }, [['run', 'say lost']])
    expect((modelToTree(model).callbacks as Record<string, unknown>).fail).toEqual([{ type: 'command', run: 'say lost' }])

    // Moving an objective into the fail conditions leaves its callbacks loose; it then takes none
    attach(model, 'obj:whelps', { kind: 'when' })
    expect(model.loose).toContain('ocb:whelps:0')
    expect(refusal(model, act, { kind: 'objective-callbacks', objective: 'obj:whelps' })).toMatch(/no callbacks/)

    // Removing a stage, an objective or the Callbacks node leaves theirs loose
    removeStage(model, 'stage:1')
    expect(model.loose).toContain('scb:1:0')
    const m2 = treeToModel(BODY, 'hunt')
    removeEntry(m2, 'obj:whelps')
    expect(m2.loose).toContain('ocb:whelps:0')
    removeCallbacks(m2)
    expect(m2.loose).toEqual(expect.arrayContaining(['cb:start:0', 'cb:complete:0', 'cb:expire:0']))
    expect(modelToTree(m2).callbacks).toBeUndefined()
  })

  it('stay off the players\' lines, and say what they do on the canvas', () => {
    expect(describeReward({ type: 'set_time', time: 'night' })).toBeNull()
    expect(describeAction({ type: 'set_time', time: 'night' }).mini).toBe('Sets the time to night')
    expect(describeAction({ type: 'set_time', ticks: 6000, add: true, world: 'world_nether' }).mini).toBe('Moves the time on by 6,000 ticks in world_nether')
    expect(describeAction({ type: 'set_weather', weather: 'thunder', duration: '5m' }).mini).toBe('Sets the weather to thunder for 5 minutes')
    expect(describeAction({ type: 'lightning' }).mini).toBe('Lightning (harmless) at the player')
    expect(describeAction({ type: 'lightning', damage: true, x: 1, y: 2, z: 3, world: 'w' }).mini).toBe('Strikes lightning at 1, 2, 3 in w')
    expect(describeAction({ type: 'summon_mob', entity: 'minecraft:wolf', amount: 2, x: 10, y: 64, z: -5 }).mini).toBe('2× wolf at 10, 64, -5')
    expect(describeAction({ type: 'command', run: '/say hi' }).mini).toBe('Runs /say hi')
    expect(describeAction({ type: 'broadcast', text: '<gold><player> slew the hydra' }).mini).toBe('Tells everyone "\\<player> slew the hydra"')
  })

  it('say what the quest flow, world, player and plugin actions do', () => {
    const says = (r: Record<string, unknown>) => describeAction(r).mini
    // Quest flow
    expect(says({ type: 'fail_quest', quest: 'hydra_hunt' })).toBe('Fails hydra hunt')
    expect(says({ type: 'fail_quest', quest: 'hydra_hunt', reason: '<red>Too slow' })).toBe('Fails hydra hunt ("Too slow")')
    expect(says({ type: 'abandon_quest', quest: 'hydra_hunt' })).toBe('Abandons hydra hunt')
    expect(says({ type: 'complete_quest', quest: 'hydra_hunt' })).toBe('Completes hydra hunt')
    expect(says({ type: 'reset_quest', quest: 'hydra_hunt' })).toBe('Resets hydra hunt')
    expect(says({ type: 'progress_objective', quest: 'hydra_hunt', objective: 'whelps', amount: 3 })).toBe('Adds 3 to whelps of hydra hunt')
    expect(says({ type: 'progress_objective', quest: 'hydra_hunt', objective: 'whelps' })).toBe('Adds 1 to whelps of hydra hunt')
    // World
    expect(says({ type: 'set_block', block: 'minecraft:stone', x: 10, y: 64, z: -5 })).toBe('Sets stone at 10, 64, -5')
    expect(says({ type: 'explosion' })).toBe('Explosion (harmless) at the player')
    expect(says({ type: 'explosion', power: 4, damage: true, break_blocks: true, fire: true, x: 1, y: 2, z: 3, world: 'w' }))
      .toBe('Explosion (power 4, breaks blocks, fire) at 1, 2, 3 in w')
    expect(says({ type: 'explosion', damage: true })).toBe('Explosion at the player')
    expect(says({ type: 'particles', particle: 'minecraft:flame', count: 40 })).toBe('Shows 40 flame particles at the player')
    expect(says({ type: 'particles', world: 'world' })).toBe('Shows 20 particles at the spawn of world')
    expect(says({ type: 'sound', sound: 'entity.wither.spawn' })).toBe('Plays entity wither spawn')
    expect(says({ type: 'sound', sound: 'entity.wither.spawn', x: 0, y: 70, z: 0 })).toBe('Plays entity wither spawn at 0, 70, 0')
    expect(says({ type: 'firework' })).toBe('Bursts a firework')
    expect(says({ type: 'firework', x: 5, y: 80, z: 5, world: 'world' })).toBe('Bursts a firework at 5, 80, 5 in world')
    // Player
    expect(says({ type: 'actionbar', text: '<yellow>Run!' })).toBe('Tells the action bar "Run!"')
    expect(says({ type: 'take_item', items: ['vulcan:iron_key'] })).toBe('Takes 1× iron key')
    expect(says({ type: 'take_item', items: ['minecraft:bread', 'minecraft:apple'], amount: 4 })).toBe('Takes 4× bread or apple')
    expect(says({ type: 'remove_potion_effect', potion: 'minecraft:speed' })).toBe('Removes speed')
    expect(says({ type: 'clear_potion_effects' })).toBe('Clears all potion effects')
    expect(says({ type: 'custom_item', item: 'minecraft:tripwire_hook', amount: 2, name: 'Iron Key' })).toBe('2× Iron Key')
    // Plugins
    expect(says({ type: 'set_reputation', reputation: 'merchants_guild', value: 100 })).toBe('Merchants guild reputation set to 100')
    expect(says({ type: 'reset_reputation', reputation: 'merchants_guild' })).toBe('Resets merchants guild reputation')
    expect(says({ type: 'take_coins', amount: 50, currency: 'gems' })).toBe('Takes 50 gems')
    expect(says({ type: 'take_coins', amount: 50, reason: 'Toll' })).toBe('Takes 50 coins ("Toll")')
    expect(says({ type: 'summon_tyche_mob', mob: 'ember_whelp', amount: 3, radius: 3 })).toBe('3× ember whelp at the player')
    expect(says({ type: 'summon_tyche_mob', mob: 'ember_whelp', x: 120, y: 64, z: -40, world: 'world' })).toBe('1× ember whelp at 120, 64, -40 in world')
  })
})
