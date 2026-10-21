import { describe, expect, it } from 'vitest'
import type { Tree } from '../shared/creator'
import { canonicalQuest } from '../shared/quest/canonical'
import { requirementCycles, validateQuest, type ValidateContext } from '../shared/quest/validate'
import { CATALOG } from './fixtures'

const POOLS = new Map([['daily', { type: 'timed_random' }], ['global', { type: 'global' }]])
const CTX: ValidateContext = {
  catalog: CATALOG,
  refs: { vulcan: { items: ['vulcan:ember_blade'] }, tyche: { mobs: ['ballista'] } },
  pools: POOLS,
  questExists: (id) => ['first_steps', 'q'].includes(id),
}

function problems(tree: Tree, ctx: ValidateContext = CTX) {
  const read = canonicalQuest({ name: 'Q', pool: 'global', ...tree }, 'q')
  expect(read.quest).not.toBeNull()
  return validateQuest(read.quest!, ctx)
}
const errors = (tree: Tree, ctx?: ValidateContext) => problems(tree, ctx).filter((p) => p.error).map((p) => `${p.path}: ${p.message}`)
const warnings = (tree: Tree, ctx?: ValidateContext) => problems(tree, ctx).filter((p) => !p.error).map((p) => `${p.path}: ${p.message}`)
const fish = { o: { type: 'fish' } }

describe('validating like the plugin', () => {
  it('a sound quest has no problems', () => {
    expect(problems({
      difficulty: 'easy',
      objectives: { kill: { type: 'kill_mob', amount: 5, entities: ['minecraft:zombie', '#minecraft:undead', 'tyche:ballista'] } },
      rewards: [{ type: 'item', item: 'minecraft:diamond', amount: 2 }, { type: 'item', item: 'vulcan:ember_blade' }],
    })).toEqual([])
  })

  it('errors keep a quest out of the game', () => {
    expect(errors({ objectives: { o: { type: 'jump' } } })[0]).toMatch(/^objectives\.o\.type: unknown objective type 'jump' \(known: biome_visit, custom/)
    expect(errors({ objectives: fish, requirements: [{ type: 'permission' }] })).toEqual(['requirements[0].node: missing: node'])
    expect(errors({ objectives: fish, requirements: [{ type: 'level', min: 'five' }] })).toEqual(['requirements[0].min: must be a whole number'])
    expect(errors({ objectives: fish, requirements: [{ type: 'level', min: -1 }] })).toEqual(['requirements[0].min: must be at least 0'])
    expect(errors({ objectives: { o: { type: 'kill_mob', credit: 'everyone' } } })).toEqual(["objectives.o.credit: 'everyone' is not one of killer, contributors"])
    expect(errors({ objectives: fish, rewards: [{ type: 'item', item: 'minecraft:dirt' }] })).toEqual(["rewards[0].item: unknown item 'minecraft:dirt'"])
    expect(errors({ objectives: fish, rewards: [{ type: 'item', item: '#minecraft:logs' }] })).toEqual(['rewards[0].item: tags are not allowed here, name one item'])
    expect(errors({ objectives: fish, rewards: [{ type: 'item', item: 'vulcan:nope' }] })).toEqual(["rewards[0].item: unknown vulcan item 'nope'"])
    expect(errors({ objectives: fish, rewards: [{ type: 'item', item: 'mmo:sword' }] })[0]).toMatch(/unknown item source 'mmo'/)
    expect(errors({ objectives: fish, rewards: [{ type: 'potion_effect', duration: 'soon', ambient: 'yes', strength: 0.1 }] })).toEqual([
      "rewards[0].duration: 'soon' is not a duration (examples: 30s, 90m, 2h, 1d12h, 2w)",
      'rewards[0].ambient: must be true or false',
      'rewards[0].strength: must be at least 0.5'])
    expect(errors({ objectives: fish, requirements: [{ type: 'quest_completed', quest: 'q' }] })).toEqual(['requirements[0].quest: a quest cannot require itself'])
    expect(errors({ objectives: fish, requirements: [{ type: 'quest_failed', quest: 'q' }] })).toEqual(['requirements[0].quest: a quest cannot require itself'])
    expect(errors({ objectives: fish, fail: { when: [{ type: 'custom' }] } })[0]).toMatch(/custom cannot be a fail condition/)
    expect(errors({ pool: 'weekly', objectives: fish })).toEqual(["pool: pool 'weekly' does not exist"])
    expect(errors({ objectives: { o: { type: 'fish', filters: { hand: ['minecraft:dirt'] } } } })).toEqual(["objectives.o.filters.hand[0]: unknown item 'minecraft:dirt'"])
  })

  it('warnings keep it with a fallback', () => {
    expect(warnings({ objectives: fish, difficulty: 'legendary' })).toEqual(["difficulty: 'legendary' is not in config.yml difficulties [easy, hard, medium]"])
    expect(warnings({ pool: 'daily', objectives: fish })).toEqual(['difficulty: missing: timed_random pools roll by difficulty, so this quest is never rolled'])
    expect(warnings({ objectives: fish, cooldown: '1d' })).toEqual(['cooldown: ignored: the quest is not repeatable'])
    expect(warnings({ objectives: fish, icon: 'minecraft:rainbow' })).toEqual(["icon: unknown item 'minecraft:rainbow'; a default icon is shown"])
    expect(warnings({ objectives: { a: { type: 'fish' }, b: { type: 'fish', stage: 2 } } })).toEqual(['objectives: stage 1 has no objectives: it completes at once'])
    expect(warnings({ objectives: { o: { type: 'fish', bait: 'worm' } } })).toEqual(['objectives.o.bait: ignored by fish (it accepts items)'])
    expect(warnings({ objectives: { o: { type: 'biome_visit', biomes: ['minecraft:desert', 'moon'] } } })).toEqual(
      ["objectives.o.biomes[1]: 'moon' is not known (known: desert, plains); it never matches unless a plugin adds it"])
    expect(warnings({ objectives: fish, requirements: [{ type: 'quest_completed', quest: 'ghost' }] })).toEqual(
      ["requirements[0].quest: quest 'ghost' does not exist: this never passes"])
    expect(warnings({ objectives: fish, messages: { welcome: 'hi' } })).toEqual(['messages.welcome: unknown message, ignored (known: [abandon, complete, expire, start])'])
    expect(warnings({ objectives: { o: { type: 'fish', filters: { worlds: [] } } } })).toEqual(['objectives.o.filters.worlds: an empty whitelist: the objective never counts'])
    expect(warnings({ objectives: fish, requirements: [{ type: 'level', min: 1, display: 'Level 1' }] })).toEqual([])
  })

  it('a Vulcan item type takes Vulcan items only; the plain item reward takes both', () => {
    expect(errors({ objectives: fish, rewards: [{ type: 'vulcan_item', item: 'vulcan:ember_blade' }] })).toEqual([])
    expect(errors({ objectives: fish, rewards: [{ type: 'vulcan_item', item: 'minecraft:diamond' }] })).toEqual(
      ["rewards[0].item: only vulcan items work here (vulcan:<id>), not 'minecraft:diamond'"])
    expect(errors({ objectives: { o: { type: 'equip_item', items: ['vulcan:ember_blade', '#minecraft:logs'] } } })).toEqual(
      ['objectives.o.items[1]: tags cannot be used here: only vulcan items (vulcan:<id>)'])
    expect(errors({ objectives: fish, rewards: [{ type: 'item', item: 'vulcan:ember_blade' }, { type: 'item', item: 'minecraft:diamond' }] })).toEqual([])
  })

  it('a block argument takes one vanilla block, never a tag', () => {
    const at = { x: 10, y: 64, z: -5 }
    expect(errors({ objectives: fish, callbacks: { start: [{ type: 'set_block', block: 'minecraft:stone', ...at }] } })).toEqual([])
    expect(errors({ objectives: fish, rewards: [{ type: 'set_block', block: 'stone' }] })).toEqual([])
    expect(errors({ objectives: fish, rewards: [{ type: 'set_block', block: 'minecraft:dirt' }] })).toEqual(["rewards[0].block: unknown block 'minecraft:dirt'"])
    expect(errors({ objectives: fish, rewards: [{ type: 'set_block', block: '#minecraft:logs' }] })).toEqual(['rewards[0].block: tags are not allowed here, name one block'])
    expect(errors({ objectives: fish, rewards: [{ type: 'set_block', block: 'vulcan:anvil' }] })).toEqual(["rewards[0].block: only minecraft blocks are supported, not 'vulcan:anvil'"])
    expect(errors({ objectives: fish, rewards: [{ type: 'set_block', block: ['minecraft:stone'] }] })).toEqual(['rewards[0].block: must be a single block'])
    expect(errors({ objectives: fish, rewards: [{ type: 'set_block' }] })).toEqual(['rewards[0].block: missing: block'])
  })

  it('without a catalog only the structure and pool are checked', () => {
    expect(problems({ objectives: { o: { type: 'anything', x: 1 } } }, { pools: POOLS })).toEqual([])
  })

  it('without the plugin ids, their keys pass (the download checks them)', () => {
    expect(errors({ objectives: fish, rewards: [{ type: 'item', item: 'vulcan:anything' }] }, { ...CTX, refs: {} })).toEqual([])
  })

  it('checks objective and stage rewards, and warns about a stage without objectives', () => {
    expect(errors({ objectives: { o: { type: 'fish', rewards: [{ type: 'item' }] } }, stages: { 0: { rewards: [{ type: 'nope' }] } } })
      .map((e) => e.split(':')[0])).toEqual(['objectives.o.rewards[0].item', 'stages.0.rewards[0].type'])
    expect(warnings({ objectives: fish, stages: { 3: { rewards: [{ type: 'start_quest', quest: 'first_steps' }] } } }))
      .toContain('stages.3: stage 3 has no objectives: its rewards are never given')
  })

  it('finds requirement cycles across quests', () => {
    const read = (id: string, needs: string) =>
      canonicalQuest({ pool: 'global', objectives: fish, requirements: [{ type: 'quest_completed', quest: needs }] }, id).quest!
    const quests = new Map([['a', read('a', 'b')], ['b', read('b', 'a')], ['c', read('c', 'a')]])
    expect([...requirementCycles(quests)].sort()).toEqual(['a', 'b'])
  })
})
