import { describe, expect, it } from 'vitest'
import type { Catalog, Tree } from '../shared/creator'
import { canonicalQuest, REWARD_PARTY_PLACE } from '../shared/quest/canonical'
import { validateQuest } from '../shared/quest/validate'
import { describeFail, describeRequirement, describeReward, objectiveSentence } from '../src/describe'
import { modelToTree, treeToModel } from '../src/creator/model'
import { refusal, REWARD_PARTY_MOVE } from '../src/creator/ops'
import { INTEGRATIONS } from '../src/showcase/capabilities'
import { CATALOG } from './fixtures'

const read = (tree: Tree) => canonicalQuest({ id: 'q', name: 'Q', pool: 'p', objectives: { o: { type: 'fish' } }, ...tree }, 'q')
const problems = (tree: Tree) => read(tree).problems.map((p) => `${p.error ? 'error' : 'warning'} ${p.path}: ${p.message}`)
const diamond = (extra: Tree = {}) => ({ type: 'item', item: 'minecraft:diamond', ...extra })

describe('Hermes sentences', () => {
  const requirement = (tree: Tree) => describeRequirement(tree).mini

  it('requirements', () => {
    expect(requirement({ type: 'in_party', min_size: 2, max_size: 5 })).toBe('In a party of 2 to 5')
    expect(requirement({ type: 'in_party' })).toBe('In a party')
    expect(requirement({ type: 'in_party', min_size: 3 })).toBe('In a party of 3 or more')
    expect(requirement({ type: 'in_party', not: true })).toBe('Not in a party')
    expect(requirement({ type: 'party_leader' })).toBe('Leads their party')
    expect(requirement({ type: 'party_role', roles: ['tank', 'healer'] })).toBe('Party role: Tank or Healer')
    expect(requirement({ type: 'party_balanced' })).toBe('In a balanced party')
    expect(requirement({ type: 'party_members_near', amount: 2 })).toBe('2 party members within 32 blocks')
    expect(requirement({ type: 'party_members_near', radius: 200 })).toBe('1 party member within 64 blocks')
  })

  it('objectives, and leaving a party as a fail condition', () => {
    expect(objectiveSentence({ type: 'create_party', amount: 1 })).toBe('Create a party')
    expect(objectiveSentence({ type: 'join_party', amount: 1, min_size: 3 })).toBe('Join a party (3+ members)')
    expect(objectiveSentence({ type: 'invite_to_party', amount: 3 })).toBe('Invite 3 players to a party')
    expect(objectiveSentence({ type: 'leave_party', amount: 1 })).toBe('Leave a party')
    expect(objectiveSentence({ type: 'leave_party', amount: 1, reasons: ['kicked', 'disbanded'] })).toBe('Leave a party (by being kicked or when it is disbanded)')
    expect(objectiveSentence({ type: 'take_party_role', amount: 1 })).toBe('Take a party role')
    expect(objectiveSentence({ type: 'take_party_role', amount: 1, roles: ['dps'] })).toBe('Take the Dps role')
    expect(objectiveSentence({ type: 'become_party_leader', amount: 1 })).toBe('Become party leader')
    expect(describeFail({ when: [{ type: 'leave_party', amount: 1 }] })!.when[0]!.mini).toBe('Leave their party')
    // party_role is the requirement; the objective is take_party_role
    expect(objectiveSentence({ type: 'party_role', amount: 1 })).not.toBe('Take a party role')
  })

  it('kills credited to the party', () => {
    expect(objectiveSentence({ type: 'kill_mob', amount: 5, entities: ['minecraft:zombie'], credit: 'party' })).toBe('Kill 5 zombie (with the party within 32 blocks)')
    expect(objectiveSentence({ type: 'kill_mob', amount: 5, entities: ['minecraft:zombie'], credit: 'party', party_range: 16 }))
      .toBe('Kill 5 zombie (with the party within 16 blocks)')
    expect(objectiveSentence({ type: 'kill_mob', amount: 5, entities: ['minecraft:zombie'], credit: 'party', party_range: 12.5 }))
      .toBe('Kill 5 zombie (with the party within 12.5 blocks)')
    expect(objectiveSentence({ type: 'kill_mob', amount: 5, entities: ['minecraft:zombie'], credit: 'contributors' })).toBe('Kill 5 zombie')
    expect(objectiveSentence({ type: 'kill_tyche_boss', amount: 1, bosses: ['cinder_hydra'], credit: 'party' })).toMatch(/ \(with the party within 32 blocks\)$/)
  })

  it('the showcase lists Hermes with sentences for each of its types', () => {
    const hermes = INTEGRATIONS.find((i) => i.name === 'Hermes')!
    expect(hermes.objectives).toHaveLength(6)
    expect(hermes.requirements).toHaveLength(5)
    for (const type of hermes.requirements) expect(describeRequirement({ type }).mini).not.toMatch(/^[A-Z][a-z]+ [a-z]+$/)
  })
})

describe('the players trait', () => {
  const TYPES: Catalog = {
    ...CATALOG,
    types: {
      ...CATALOG.types!,
      requirement: [...CATALOG.types!.requirement, { id: 'party_members_near', owner: 'Hermes', description: 'members near', icon: 'minecraft:player_head',
        reads: ['players'], params: [{ name: 'amount', kind: 'INTEGER', required: false, default: '1', min: 1, description: 'amount' }] }],
      requirementUses: { start: ['spot', 'players'], auto_start: [], fail_unless: [], reward: ['spot', 'players'] },
    },
  }
  const errors = (tree: Tree) => validateQuest(read(tree).quest!, { catalog: TYPES, pools: null }).filter((p) => p.error).map((p) => `${p.path}: ${p.message}`)
  const near = { type: 'party_members_near', amount: 2 }
  const WHY = 'it reads other players, who may be on other regions'

  it('is refused in fail.unless and for an auto_start quest, taken in requirements and reward requirements', () => {
    expect(errors({ requirements: [near] })).toEqual([])
    expect(errors({ fail: { unless: [{ all: [{ type: 'level', min: 1 }, near] }] } })).toEqual([`fail.unless[0].all[1].type: party_members_near cannot be used in fail.unless: ${WHY}`])
    expect(errors({ auto_start: true, requirements: [near] })).toEqual([`requirements[0].type: party_members_near cannot be used in the requirements of an auto_start quest: ${WHY}`])
    expect(errors({ rewards: [diamond({ requirements: [near] })] })).toEqual([])
  })
})

describe('party rewards', () => {
  it('read and write back exactly: after the arguments and display, before requirements', () => {
    const body = {
      id: 'q', name: 'Q', pool: 'p',
      objectives: { o: { type: 'fish', amount: 1, rewards: [diamond({ party: true })] } },
      stages: { 0: { rewards: [diamond({ amount: 2, party: true, party_range: 0 })] } },
      rewards: [diamond({ display: 'Gems', party: true, party_range: 16, requirements: [{ type: 'permission', node: 'rank.vip' }] })],
    }
    const { body: written, problems: found } = canonicalQuest(body, 'q')
    expect(found).toEqual([])
    expect(JSON.stringify(written)).toBe(JSON.stringify(body))
    expect(canonicalQuest(body, 'q').quest!.rewards[0]).toMatchObject({ party: true, partyRange: 16 })
    expect(JSON.stringify(modelToTree(treeToModel(body, 'q')))).toBe(JSON.stringify(body))
    // party: false is not written
    expect(read({ rewards: [diamond({ party: false })] }).body!.rewards).toEqual([diamond()])
  })

  it('are an error anywhere but the rewards of a quest, a stage or an objective', () => {
    const shared = diamond({ party: true })
    expect(problems({ objectives: { o: { type: 'fish', callbacks: [shared] } } })).toEqual([`error objectives.o.callbacks[0].party: ${REWARD_PARTY_PLACE}`])
    expect(problems({ stages: { 0: { callbacks: [shared] } } })).toEqual([`error stages.0.callbacks[0].party: ${REWARD_PARTY_PLACE}`])
    expect(problems({ callbacks: { complete: [shared] } })).toEqual([`error callbacks.complete[0].party: ${REWARD_PARTY_PLACE}`])
    expect(problems({ fail: { when: [{ type: 'death' }], actions: [shared] } })).toEqual([`error fail.actions[0].party: ${REWARD_PARTY_PLACE}`])
    expect(problems({ stages: { 0: { rewards: [shared] } }, rewards: [shared] })).toEqual([])
  })

  it('check their range', () => {
    expect(problems({ rewards: [diamond({ party_range: 16 })] })).toEqual(['warning rewards[0].party_range: party_range only counts with party: true'])
    expect(problems({ rewards: [diamond({ party: true, party_range: -1 })] })).toEqual(['error rewards[0].party_range: must be 0 or more'])
    expect(problems({ rewards: [diamond({ party: 'yes' })] })).toEqual(['error rewards[0].party: must be true or false'])
  })

  it('warn when a repeatable quest hands something valuable to the whole party', () => {
    const warnings = (tree: Tree) => validateQuest(read(tree).quest!, { pools: null }).filter((p) => !p.error).map((p) => `${p.path}: ${p.message}`)
    const FARM = 'every party member gets it each time anyone completes it'
    expect(warnings({ repeatable: true, rewards: [diamond({ party: true })] })).toEqual([`rewards[0].party: ${FARM}`])
    expect(warnings({ repeatable: true, stages: { 0: { rewards: [{ type: 'reputation', reputation: 'guild', amount: 5, party: true }] } } }))
      .toEqual([`stages.0.rewards[0].party: ${FARM}`])
    expect(warnings({ repeatable: true, objectives: { o: { type: 'fish', rewards: [{ type: 'command', run: 'say hi', party: true }] } } })).toEqual([])
    expect(warnings({ rewards: [diamond({ party: true })] })).toEqual([])
  })

  it('say so in their line', () => {
    expect(describeReward(diamond({ party: true }))!.mini).toBe('1× diamond (party)')
    expect(describeReward(diamond({ party: true, party_range: 16 }))!.mini).toBe('1× diamond (party, 16 blocks)')
    expect(describeReward(diamond({ party: true, party_range: 0 }))!.mini).toBe('1× diamond (party, anywhere)')
    expect(describeReward(diamond({ party: true, requirements: [{ type: 'permission', node: 'x' }] }))!.mini).toBe('1× diamond (party), only if: Permission x')
    expect(describeReward(diamond({ party_range: 16 }))!.mini).toBe('1× diamond')
  })

  it('move only where rewards go to the party', () => {
    const m = treeToModel({ id: 'q', name: 'Q', pool: 'p', objectives: { o: { type: 'fish', amount: 1 } }, rewards: [diamond({ party: true }), diamond()] }, 'q')
    expect(refusal(m, 'rew:0', { kind: 'actions' })).toBe(REWARD_PARTY_MOVE)
    expect(refusal(m, 'rew:0', { kind: 'callback', event: 'complete' })).toBe(REWARD_PARTY_MOVE)
    expect(refusal(m, 'rew:0', { kind: 'objective-callbacks', objective: 'obj:o' })).toBe(REWARD_PARTY_MOVE)
    expect(refusal(m, 'rew:0', { kind: 'stage-rewards', stage: 'stage:0' })).toBeNull()
    expect(refusal(m, 'rew:0', { kind: 'objective-rewards', objective: 'obj:o' })).toBeNull()
    expect(refusal(m, 'rew:1', { kind: 'actions' })).toBeNull()
  })
})
