import { afterEach, describe, expect, it } from 'vitest'
import type { Tree } from '../shared/creator'
import { describeAction, describeFail, describeRequirement, describeReward, objectiveSentence, setRefNames } from '../src/describe'
import { INTEGRATIONS } from '../src/showcase/capabilities'

/** What /chronos cl refs tyche sends as display names of its NPCs. */
const LABELS = { tyche: { npcs: { blacksmith: 'Blacksmith', caravan_guard: '<gold>Caravan Guard', bandit: 'Bandit' } } }

afterEach(() => setRefNames(undefined))

const objective = (tree: Tree) => objectiveSentence({ amount: 1, ...tree })
const requirement = (tree: Tree) => describeRequirement(tree).mini
const action = (tree: Tree) => describeAction(tree).mini

describe('Tyche NPC sentences', () => {
  it('objectives, with the NPCs\' names', () => {
    setRefNames(LABELS)
    expect(objective({ type: 'interact_tyche_npc', npcs: ['blacksmith'] })).toBe('Click Blacksmith')
    expect(objective({ type: 'interact_tyche_npc', npcs: ['bandit'], click: 'left', amount: 3 })).toBe('Hit Bandit 3 times')
    expect(objective({ type: 'interact_tyche_npc', npcs: ['blacksmith', 'caravan_guard'], click: 'any' })).toBe('Click Blacksmith or Caravan Guard')
    expect(objective({ type: 'interact_tyche_npc' })).toBe('Click an NPC')
    expect(objective({ type: 'kill_tyche_npc', npcs: ['bandit'], amount: 3 })).toBe('Kill 3 Bandit')
    expect(objective({ type: 'kill_tyche_npc', npcs: ['bandit'], amount: 3, credit: 'party', party_range: 24 })).toBe('Kill 3 Bandit (with the party within 24 blocks)')
    expect(objective({ type: 'tyche_npc_dies', npcs: ['caravan_guard'] })).toBe('Caravan Guard dies')
  })

  it('without names (the plugin has not sent them): the ids as words', () => {
    expect(objective({ type: 'interact_tyche_npc', npcs: ['blacksmith'] })).toBe('Click blacksmith')
    expect(objective({ type: 'kill_tyche_npc', amount: 2 })).toBe('Kill 2 Tyche NPCs')
    expect(requirement({ type: 'tyche_npc_alive', npc: 'caravan_guard' })).toBe('Caravan guard is alive')
    expect(action({ type: 'teleport_to_npc', npc: 'old_mage' })).toBe('Teleport to old mage')
  })

  it('a dying NPC as a fail condition', () => {
    setRefNames(LABELS)
    expect(describeFail({ when: [{ type: 'tyche_npc_dies', amount: 1, npcs: ['caravan_guard'] }] })!.when[0]!.mini).toBe('Let Caravan Guard die')
  })

  it('requirements', () => {
    setRefNames(LABELS)
    expect(requirement({ type: 'near_tyche_npc', npc: 'blacksmith' })).toBe('Near Blacksmith (16 blocks)')
    expect(requirement({ type: 'near_tyche_npc', npc: 'blacksmith', radius: 200 })).toBe('Near Blacksmith (64 blocks)')
    expect(requirement({ type: 'tyche_npc_alive', npc: 'caravan_guard' })).toBe('Caravan Guard is alive')
    expect(requirement({ type: 'tyche_npc_in_combat', npc: 'caravan_guard' })).toBe('Caravan Guard is fighting')
    expect(requirement({ type: 'tyche_npc_alive', npc: 'caravan_guard', not: true })).toBe('Not: Caravan Guard is alive')
  })

  it('rewards are actions: no line for players, but the canvas says what they do', () => {
    setRefNames(LABELS)
    for (const type of ['set_npc_hostility', 'teleport_to_npc', 'hold_tyche_npc']) expect(describeReward({ type, npc: 'bandit' })).toBeNull()
    expect(action({ type: 'set_npc_hostility', npc: 'bandit' })).toBe('Bandit turns hostile')
    expect(action({ type: 'set_npc_hostility', npc: 'bandit', hostility: 'peaceful' })).toBe('Bandit turns peaceful')
    expect(action({ type: 'teleport_to_npc', npc: 'blacksmith' })).toBe('Teleport to Blacksmith')
    expect(action({ type: 'hold_tyche_npc', npc: 'blacksmith' })).toBe('Blacksmith waits 10s, facing the player')
    expect(action({ type: 'hold_tyche_npc', npc: 'blacksmith', seconds: 900 })).toBe('Blacksmith waits 600s, facing the player')
  })

  it('the showcase lists them under Tyche', () => {
    const tyche = INTEGRATIONS.find((i) => i.name === 'Tyche')!
    expect(tyche.objectives).toEqual(expect.arrayContaining(['interact_tyche_npc', 'kill_tyche_npc', 'tyche_npc_dies']))
    expect(tyche.requirements).toEqual(expect.arrayContaining(['near_tyche_npc', 'tyche_npc_alive', 'tyche_npc_in_combat']))
    expect(tyche.rewards).toEqual(expect.arrayContaining(['set_npc_hostility', 'teleport_to_npc', 'hold_tyche_npc']))
  })
})
