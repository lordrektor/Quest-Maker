import { describe, expect, it } from 'vitest'
import {
  ACTIONS, COMPARE_WORDS, describeFail, describeObjective, describeRequirement, describeReward, filtersHint, humanCron, humanDuration,
  objectiveSentence, objectiveStages, OBJECTIVES, poolLevels, prettyKey, questBadges, REQUIREMENTS, resetLine, REWARDS,
  rollLine, SILENT_REWARDS,
} from '../src/describe'
import { INTEGRATIONS, OBJECTIVE_FAMILIES } from '../src/showcase/capabilities'
import { plainText } from '../src/minimessage'

const line = (l: { mini: string; placeholders?: Record<string, string> } | null) => (l ? plainText(l.mini, { placeholders: l.placeholders }) : null)

describe('keys', () => {
  it('turns keys into words', () => {
    expect(prettyKey('minecraft:iron_axe')).toBe('iron axe')
    expect(prettyKey('#minecraft:logs')).toBe('logs (any)')
    expect(prettyKey('tyche_boss:cinder_hydra')).toBe('cinder hydra')
    expect(prettyKey('story/mine_diamond')).toBe('mine diamond')
    expect(prettyKey('zombie')).toBe('zombie')
  })
})

describe('objectives', () => {
  it('generates sentences from type, amount and arguments', () => {
    expect(objectiveSentence({ type: 'kill_mob', amount: 20, entities: ['zombie'] })).toBe('Kill 20 zombie')
    expect(objectiveSentence({ type: 'block_break', amount: 32, blocks: ['#minecraft:logs'] })).toBe('Break 32 logs (any)')
    expect(objectiveSentence({ type: 'kill_tyche_boss', amount: 1, bosses: ['cinder_hydra'] })).toBe('Defeat cinder hydra')
    expect(objectiveSentence({ type: 'kill_mob', amount: 10, entities: ['minecraft:zombie', 'minecraft:husk', 'minecraft:drowned'] }))
      .toBe('Kill 10 zombie, husk or drowned')
    expect(objectiveSentence({ type: 'block_place', amount: 256 })).toBe('Place 256 blocks')
    expect(objectiveSentence({ type: 'travel_distance', amount: 10000, mode: 'walk' })).toBe('Travel 10,000 blocks walking')
    expect(objectiveSentence({ type: 'death', amount: 1 })).toBe('Die')
    expect(objectiveSentence({ type: 'earn_coins', amount: 1000, currencies: ['coins'] })).toBe('Earn 1,000 coins')
    expect(objectiveSentence({ type: 'custom' }, 'talk_to_smith')).toBe('Talk to smith')
  })

  it('falls back to type × amount', () => {
    expect(objectiveSentence({ type: 'dance_party', amount: 3 })).toBe('Dance party × 3')
  })

  it('uses display with its placeholders, and starts every line with the status bullet', () => {
    const display = describeObjective('kill', { type: 'kill_mob', amount: 5, display: '<status> Slay <required> blazes <aqua><current>/<required>' })
    expect(line(display)).toBe('• Slay 5 blazes 0/5')
    expect(line(describeObjective('chop', { type: 'block_break', amount: 8, blocks: ['#minecraft:logs'] }))).toBe('• Break 8 logs (any)')
    expect(line(describeObjective('x', { type: 'custom', display: 'Talk to <id>' }))).toBe('• Talk to x')
  })

  it('describes filters', () => {
    expect(filtersHint({ worlds: ['world_nether'] })).toBe('In world_nether')
    expect(filtersHint({ worlds: { mode: 'blacklist', values: ['world_the_end'] }, y: { max: 64 }, hand: ['#minecraft:swords'] }))
      .toBe('Not in world_the_end · at Y 64 or below · holding swords (any)')
    expect(filtersHint(undefined)).toBeUndefined()
  })

  it('groups objectives by stage', () => {
    const stages = objectiveStages({ a: { type: 'craft', stage: 1 }, b: { type: 'block_break' }, c: { type: 'deliver', stage: 1, items: ['wheat'] } })
    expect(stages.map((s) => [s.stage, s.lines.map((l) => l.id)])).toEqual([[0, ['b']], [1, ['a', 'c']]])
  })
})

describe('requirements and rewards', () => {
  it('describes requirements and links quests', () => {
    expect(describeRequirement({ type: 'quest_completed', quest: 'first_steps' })).toMatchObject({ quest: 'first_steps' })
    expect(line(describeRequirement({ type: 'quest_completed', quest: 'first_steps' }))).toBe('Complete first steps')
    expect(describeRequirement({ type: 'quest_failed', quest: 'hydra_hunt' })).toMatchObject({ quest: 'hydra_hunt' })
    expect(line(describeRequirement({ type: 'quest_failed', quest: 'hydra_hunt' }))).toBe('Fail hydra hunt')
    expect(line(describeRequirement({ type: 'quest_failed', quest: 'hydra_hunt', times: 3 }))).toBe('Fail hydra hunt 3 times')
    expect(line(describeRequirement({ type: 'quest_failed', quest: 'hydra_hunt', times: 1 }))).toBe('Fail hydra hunt')
    expect(line(describeRequirement({ type: 'coins', compare: '<', value: 1000, currency: 'gold' }))).toBe('Below 1,000 gold')
    expect(line(describeRequirement({ type: 'level', min: 10 }))).toBe('Level 10+')
    expect(line(describeRequirement({ type: 'permission', node: 'a.b', display: '<gray>Rank <gold>Hunter' }))).toBe('Rank Hunter')
  })

  it('describes rewards and hides pure effects', () => {
    expect(line(describeReward({ type: 'item', item: 'minecraft:bread', amount: 5 }))).toBe('5× bread')
    expect(line(describeReward({ type: 'vanilla_experience', amount: 100 }))).toBe('100 XP')
    expect(line(describeReward({ type: 'items', items: ['bread', 'apple'], amount: 5 }))).toBe('5× each of bread and apple')
    expect(line(describeReward({ type: 'coins', amount: 500 }))).toBe('500 coins')
    expect(line(describeReward({ type: 'reputation', reputation: 'merchants_guild', amount: 25 }))).toBe('+25 merchants guild reputation')
    expect(line(describeReward({ type: 'reputation', reputation: 'thieves', amount: -10 }))).toBe('-10 thieves reputation')
    expect(line(describeRequirement({ type: 'reputation', reputation: 'town_guard', compare: '<', value: 0 }))).toBe('Town guard reputation below 0')
    expect(line(describeObjective('trade', { type: 'gain_reputation', amount: 100, reputations: ['merchants_guild'] }))).toBe('• Gain 100 merchants guild reputation')
    expect(line(describeObjective('any', { type: 'lose_reputation', amount: 5 }))).toBe('• Lose 5 reputation')
    expect(line(describeObjective('reach', { type: 'reach_reputation', amount: 250, reputation: 'merchants_guild' }))).toBe('• Reach 250 merchants guild reputation')
    expect(line(describeReward({ type: 'tyche_loot', table: 'hydra_hoard', rolls: 2 }))).toBe('2 rolls of hydra hoard loot')
    expect(describeReward({ type: 'message', text: 'hi' })).toBeNull()
    expect(describeReward({ type: 'command', run: 'say hi' })).toBeNull()
    expect(line(describeReward({ type: 'command', run: 'lp ...', display: '<aqua>The Explorer rank' }))).toBe('The Explorer rank')
  })

  it('describes custom items, set reputation and Tyche mobs, and hides the new silent rewards', () => {
    expect(line(describeReward({ type: 'custom_item', item: 'minecraft:tripwire_hook', amount: 2, name: '<gold>Iron <bold>Key' }))).toBe('2× Iron Key')
    expect(line(describeReward({ type: 'custom_item', item: 'minecraft:tripwire_hook' }))).toBe('1× tripwire hook')
    expect(line(describeReward({ type: 'set_reputation', reputation: 'merchants_guild', value: 100 }))).toBe('Merchants guild reputation set to 100')
    expect(line(describeReward({ type: 'set_reputation', value: 0 }))).toBe('Reputation set to 0')
    expect(line(describeReward({ type: 'summon_tyche_mob', mob: 'ember_whelp', amount: 3 }))).toBe('3× ember whelp')
    expect(line(describeReward({ type: 'give_title', title: 'dragon_slayer' }))).toBe('Title: dragon slayer')
    expect(line(describeReward({ type: 'give_title', title: 'dragon_slayer', duration: '0' }))).toBe('Title: dragon slayer')
    expect(line(describeReward({ type: 'give_title', title: 'dragon_slayer', duration: '3d' }))).toMatch(/^Title: dragon slayer \(3 ?d/)
    expect(describeReward({ type: 'take_title', title: 'novice' })).toBeNull()
    expect(describeReward({ type: 'equip_title', title: 'novice' })).toBeNull()
    expect(ACTIONS.take_title({ title: 'novice' })).toBe('Takes the title novice')
    expect(ACTIONS.equip_title({ title: 'dragon_slayer' })).toBe('Puts on the title dragon slayer')
    expect(line(describeObjective('t', { type: 'unlock_title', amount: 3, groups: ['explorer'] }))).toBe('• Unlock 3 titles of the explorer group')
    expect(line(describeObjective('t', { type: 'unlock_title', titles: ['dragon_slayer'] }))).toBe('• Unlock 1 title (dragon slayer)')
    expect(line(describeObjective('t', { type: 'wear_title', titles: ['novice'] }))).toBe('• Wear the novice title')
    expect(line(describeObjective('t', { type: 'lose_title' }))).toBe('• Lose a title')
    expect(line(describeRequirement({ type: 'has_title', title: 'novice' }))).toBe('Owns the title novice')
    expect(line(describeRequirement({ type: 'wearing_title', title: 'dragon_slayer' }))).toBe('Wears the title dragon slayer')
    expect(line(describeObjective('b', { type: 'upgrade_bag', bags: ['material'] }))).toBe('• Upgrade Material Bag')
    expect(line(describeObjective('b', { type: 'use_rpg_button', buttons: ['material_bag'] }))).toBe('• Click the material bag button')
    expect(line(describeObjective('b', { type: 'use_rpg_button', amount: 3 }))).toBe('• Click an inventory button 3 times')
    expect(line(describeObjective('b', { type: 'open_rpg_menu', entries: ['stash'] }))).toBe('• Open Stash')
    expect(line(describeObjective('b', { type: 'unequip_accessory' }))).toBe('• Take off an accessory')
    expect(line(describeObjective('b', { type: 'toggle_auto_loot', state: 'on', amount: 2 }))).toBe('• Switch auto loot on 2 times')
    expect(line(describeRequirement({ type: 'bag_tier', bag: 'general', tier: 3 }))).toBe('General Bag tier 3 or higher')
    expect(line(describeRequirement({ type: 'auto_loot', state: 'off' }))).toBe('Auto loot off')
    expect(line(describeReward({ type: 'set_bag_tier', bag: 'auto_loot', tier: 2 }))).toBe('Auto Loot Bag tier 2')
    expect(line(describeReward({ type: 'vulcan_items', items: ['vulcan:ember_blade', 'vulcan:frost_bow'], amount: 2 }))).toBe('2× each of ember blade and frost bow')
    for (const type of ['fail_quest', 'abandon_quest', 'complete_quest', 'reset_quest', 'progress_objective', 'set_block', 'explosion', 'particles',
      'actionbar', 'take_item', 'remove_potion_effect', 'clear_potion_effects', 'reset_reputation', 'take_coins']) {
      expect(describeReward({ type }), type).toBeNull()
    }
  })

  it('describes Metabasis warps and teleports', () => {
    expect(line(describeObjective('w', { type: 'use_warp', warps: ['hub', 'market'] }))).toBe('• Use the hub or market warp')
    expect(line(describeObjective('w', { type: 'use_warp', amount: 3, groups: ['vip'] }))).toBe('• Use a vip warp 3 times')
    expect(line(describeObjective('w', { type: 'use_warp', warps: ['hub'], groups: ['vip'] }))).toBe('• Use the hub warp or a vip warp')
    expect(line(describeObjective('w', { type: 'use_warp' }))).toBe('• Use a warp')
    expect(line(describeObjective('t', { type: 'use_teleport', amount: 5, causes: ['warp', 'spawn', 'request', 'back'] }))).toBe('• Teleport with /warp, /spawn, /tpa or /back 5 times')
    expect(line(describeObjective('t', { type: 'use_teleport' }))).toBe('• Teleport')
    expect(line(describeObjective('a', { type: 'accept_teleport_request' }))).toBe('• Accept 1 teleport request')
    expect(line(describeObjective('a', { type: 'accept_teleport_request', amount: 3 }))).toBe('• Accept 3 teleport requests')
    expect(line(describeRequirement({ type: 'can_use_warp', warp: 'nether_hub' }))).toBe('Can use the warp nether hub')
    expect(line(describeReward({ type: 'warp', warp: 'market' }))).toBe('Teleport to market')
    expect(line(describeReward({ type: 'spawn', world: 'world_nether' }))).toBe('Teleport to world nether spawn')
    expect(line(describeReward({ type: 'spawn' }))).toBe('Teleport to spawn')
    expect(describeReward({ type: 'set_warp_enabled', warp: 'arena' })).toBeNull()
    expect(ACTIONS.set_warp_enabled({ warp: 'arena' })).toBe('Opens the warp arena')
    expect(ACTIONS.set_warp_enabled({ warp: 'arena', enabled: true })).toBe('Opens the warp arena')
    expect(ACTIONS.set_warp_enabled({ warp: 'arena', enabled: false })).toBe('Closes the warp arena')
  })

  it('describes Convo conversations', () => {
    expect(line(describeObjective('t', { type: 'talk_npc', npcs: ['convo:guard'] }))).toBe('• Talk to guard')
    expect(line(describeObjective('t', { type: 'talk_npc', npcs: ['convo:guard', 'convo:old_smith'], amount: 3 }))).toBe('• Talk to guard or old smith 3 times')
    expect(line(describeObjective('t', { type: 'talk_npc' }))).toBe('• Talk to an NPC')
    expect(line(describeObjective('s', { type: 'convo_start', npc: 'guard', convo: 'intro' }))).toBe('• Start the conversation intro with guard')
    expect(line(describeObjective('s', { type: 'convo_start', npc: 'guard' }))).toBe('• Start a conversation with guard')
    expect(line(describeObjective('f', { type: 'convo_finish', npc: 'guard', convo: 'intro', amount: 2 }))).toBe('• Finish the conversation intro with guard 2 times')
    expect(line(describeObjective('a', { type: 'convo_answer', npc: 'guard', convo: 'intro', answer: 'accept' }))).toBe('• Answer accept in intro with guard')
    expect(describeReward({ type: 'start_convo', npc: 'guard', convo: 'intro' })).toBeNull()
    expect(ACTIONS.start_convo!({ npc: 'guard', convo: 'intro' })).toBe('Starts the conversation intro of guard')
  })

  it('describes a fail block', () => {
    const fail = describeFail({ when: [{ type: 'death', amount: 1 }], unless: [{ type: 'in_dimension', dimensions: ['nether'] }], result: 'cooldown', cooldown: '1h' })
    expect(fail?.when.map(line)).toEqual(['Die'])
    expect(fail?.unless.map(line)).toEqual(['Be in the nether'])
    expect(objectiveSentence({ type: 'change_world', amount: 1, dimensions: ['the_end'] })).toBe('Travel to the end')
    expect(line(describeRequirement({ type: 'in_dimension', dimensions: ['normal', 'nether'] }))).toBe('Be in the overworld or the nether')
    expect(fail?.result).toBe('Progress is lost and the quest locks for 1 hour.')
    expect(describeFail({})).toBeNull()
  })
})

describe('time', () => {
  it('humanises durations', () => {
    expect(humanDuration('1d')).toBe('1 day')
    expect(humanDuration('1d12h')).toBe('1 day 12 hours')
    expect(humanDuration('90m')).toBe('90 minutes')
    expect(humanDuration('soon')).toBe('soon')
  })

  it('humanises simple cron schedules and leaves others alone', () => {
    expect(humanCron('0 0 0 * * ?')).toBe('Resets daily at 00:00')
    expect(humanCron('0 0 6 * * ?')).toBe('Resets daily at 06:00')
    expect(humanCron('0 0 */6 * * ?')).toBe('Resets every 6 hours')
    expect(humanCron('0 0 0 ? * MON')).toBe('Resets every Monday at 00:00')
    expect(humanCron('0 0 18 ? * FRI')).toBe('Resets every Friday at 18:00')
    expect(humanCron('0 0 0 1 * ?')).toBe('Resets monthly on the 1st at 00:00')
    expect(humanCron('0 15 10 ? * 6L')).toBeNull()
    expect(resetLine({ reset: '0 0 18 ? * FRI', timezone: 'Europe/Berlin' })).toBe('Resets every Friday at 18:00 (Europe/Berlin)')
    expect(resetLine({ reset: '0 15 10 ? * 6L' })).toBe('Resets on the schedule "0 15 10 ? * 6L"')
  })
})

describe('pools and quests', () => {
  it('describes rolls and levels', () => {
    expect(rollLine({ roll: { easy: 1, medium: 1, hard: 1 } })).toBe('1 easy, 1 medium, 1 hard')
    expect(rollLine({})).toBeNull()
    const levels = poolLevels({ levels: { thresholds: [5, 15, 30], rewards: { default: [{ type: 'vanilla_experience', amount: 50 }], 3: [{ type: 'item', item: 'minecraft:diamond', amount: 3 }] } } })
    expect(levels.levels.map((l) => [l.level, l.needs, l.rewards.length])).toEqual([[1, 5, 0], [2, 15, 0], [3, 30, 1]])
    expect(levels.everyLevel.map(line)).toEqual(['50 XP'])
  })

  it('lists badges', () => {
    expect(questBadges({ difficulty: 'easy', repeatable: true, cooldown: '1d', time_limit: '2d', auto_start: true }).map((b) => b.label))
      .toEqual(['Easy', 'Repeatable', 'Cooldown 1 day', 'Time limit 2 days', 'Starts automatically'])
    expect(questBadges({ no_teleport: true }).map((b) => b.label)).toEqual(['No teleporting'])
    expect(questBadges({ no_teleport: false })).toEqual([])
    expect(questBadges({ no_teleport: true, scope: 'account' }).map((b) => b.label)).toEqual(['No teleporting', 'Shared by characters'])
    expect(questBadges({ scope: 'character' })).toEqual([])
  })
})

describe('the showcase', () => {
  it('only samples types describe.ts knows', () => {
    const objectives = [...OBJECTIVE_FAMILIES.flatMap((f) => f.types), ...INTEGRATIONS.flatMap((i) => i.objectives)]
    expect(objectives.filter((t) => !(t in OBJECTIVES))).toEqual([])
    expect(INTEGRATIONS.flatMap((i) => i.requirements).filter((t) => !(t in REQUIREMENTS))).toEqual([])
    // A silent reward has no player's line, only what it does on the creator's node
    expect(INTEGRATIONS.flatMap((i) => i.rewards).filter((t) => !(t in REWARDS) && !(SILENT_REWARDS.has(t) && t in ACTIONS))).toEqual([])
  })
})

describe('compare in plain words', () => {
  it('every operator the plugin accepts has words for the picker', () => {
    // Comparisons.OPERATORS in the plugin
    expect(Object.keys(COMPARE_WORDS)).toEqual(['>=', '>', '<=', '<', '==', '!='])
    expect(COMPARE_WORDS['>=']).toBe('at least')
    expect(COMPARE_WORDS['<']).toBe('less than')
  })
})

describe('Plutus', () => {
  it('describes the loot node objectives', () => {
    expect(line(describeObjective('crates', { type: 'plutus_loot', clusters: ['supply_crate'], amount: 2 }))).toBe('• Loot 2 Supply crate nodes')
    expect(line(describeObjective('any', { type: 'plutus_loot', amount: 1 }))).toBe('• Loot a Plutus node')
    expect(line(describeObjective('ores', { type: 'plutus_loot', categories: ['ore', 'gem_vein'], amount: 5 }))).toBe('• Loot 5 Plutus nodes (ore or gem vein)')
    expect(line(describeObjective('diamonds', { type: 'plutus_loot_item', items: ['minecraft:diamond'], amount: 5 }))).toBe('• Get 5 diamond from Plutus loot')
    expect(line(describeObjective('blades', { type: 'plutus_loot_item', items: ['vulcan:flame_sword'], clusters: ['supply_crate'], groups: ['rare_drops'], amount: 1 })))
      .toBe('• Get 1 flame sword from Supply crate loot or the Rare drops group')
    expect(line(describeObjective('rares', { type: 'plutus_group', groups: ['rare_drops'], amount: 3 }))).toBe('• Trigger the Rare drops group 3 times')
    expect(line(describeObjective('any', { type: 'plutus_group', clusters: ['supply_crate'], amount: 1 }))).toBe('• Trigger a Plutus loot group at Supply crate nodes')
  })

  it('describes the pity requirement and the loot reward', () => {
    expect(line(describeRequirement({ type: 'plutus_pity', group: 'rare_drops', value: 10 }))).toBe('Pity for Rare drops at least 10')
    expect(line(describeRequirement({ type: 'plutus_pity', group: 'rare_drops', compare: '<', value: 3 }))).toBe('Pity for Rare drops below 3')
    expect(line(describeReward({ type: 'plutus_loot', cluster: 'supply_crate', rolls: 2 }))).toBe('2 rolls of Supply crate loot')
    expect(line(describeReward({ type: 'plutus_loot', group: 'rare_drops' }))).toBe('Rare drops group loot')
    expect(line(describeReward({ type: 'plutus_loot' }))).toBe('Plutus loot')
  })
})
