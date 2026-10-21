import { afterEach, describe, expect, it } from 'vitest'
import type { Catalog, ParamDto, Tree, TypeDto } from '../shared/creator'
import { canonicalQuest, ownPartyTypes, REWARD_PARTY_PLACE, setOwnPartyTypes, writeQuest } from '../shared/quest/canonical'
import { validateQuest } from '../shared/quest/validate'
import { CatalogView } from '../src/creator/catalog'
import { modelToTree, treeToModel } from '../src/creator/model'
import { retype } from '../src/creator/ops'
import { describeAction, describeRequirement, describeReward, objectiveSentence, setRefNames } from '../src/describe'
import { COUNTS, INTEGRATIONS } from '../src/showcase/capabilities'
import { typeSymbol } from '../src/typeIcons'
import { PROVIDERS, readRefs } from '../worker/refs'
import typeIds from './fixtures/type-ids.json'
import { CATALOG } from './fixtures'

const param = (name: string, kind: ParamDto['kind'], extra: Partial<ParamDto> = {}): ParamDto =>
  ({ name, kind, required: false, default: null, min: null, description: name, ...extra })
const type = (id: string, params: ParamDto[]): TypeDto => ({ id, owner: 'Phantasos', description: id, icon: 'minecraft:painting', params })

const CUTSCENE = param('cutscene', 'STRING', { pick: ['refs:phantasos:cutscenes'] })
const CUTSCENES = param('cutscenes', 'STRING_LIST', { pick: ['refs:phantasos:cutscenes'] })

/** The test catalog with Phantasos's types, as Phantasos registers them. */
const PHANTASOS_CATALOG: Catalog = {
  ...CATALOG,
  types: {
    ...CATALOG.types!,
    owners: [...CATALOG.types!.owners, 'Phantasos'],
    objective: [
      ...CATALOG.types!.objective,
      type('watch_cutscene', [{ ...CUTSCENE, required: true }, param('finish_only', 'BOOLEAN', { default: 'false' })]),
      type('skip_cutscene', [CUTSCENES]),
    ],
    requirement: [
      ...CATALOG.types!.requirement,
      type('seen_cutscene', [{ ...CUTSCENE, required: true }]),
      type('watching_cutscene', [CUTSCENE]),
    ],
    reward: [
      ...CATALOG.types!.reward,
      type('play_cutscene', [{ ...CUTSCENE, required: true }, param('party', 'BOOLEAN', { default: 'false' }), param('force', 'BOOLEAN', { default: 'false' })]),
      type('stop_cutscene', [{ ...CUTSCENE, default: '' }]),
      type('mark_cutscene_seen', [{ ...CUTSCENE, required: true }]),
    ],
  },
}

/** A display name sent for a cutscene (Phantasos sends none today: Chronos skips a label equal to the id). */
const LABELS = { phantasos: { cutscenes: { gate_fall: '<red>The Gate Falls' } } }

afterEach(() => {
  setRefNames(undefined)
  setOwnPartyTypes(undefined)
})

const objective = (tree: Tree) => objectiveSentence({ amount: 1, ...tree })
const requirement = (tree: Tree) => describeRequirement(tree).mini
const reward = (tree: Tree) => describeReward(tree)?.mini

describe('Phantasos refs', () => {
  it('takes cutscenes with their display names', () => {
    expect(PROVIDERS).toContain('phantasos')
    const sent = { provider: 'phantasos', refs: [{ kind: 'cutscenes', id: 'harbor_intro', label: 'Harbor Intro' }, { kind: 'cutscenes', id: 'gate_fall' }] }
    expect(readRefs(sent)).toEqual({ provider: 'phantasos', refs: [
      { kind: 'cutscenes', id: 'harbor_intro', label: 'Harbor Intro' }, { kind: 'cutscenes', id: 'gate_fall', label: null },
    ] })
  })

  it('offers them in the cutscene and cutscenes pickers, by name', () => {
    const view = new CatalogView({
      ok: true, catalog: PHANTASOS_CATALOG, syncedAt: {}, pools: [],
      refs: { phantasos: { cutscenes: ['gate_fall', 'harbor_intro'] } },
      refLabels: { phantasos: { cutscenes: { harbor_intro: 'Harbor Intro' } } },
    })
    expect(view.suggestions(CUTSCENE)).toEqual([{ value: 'gate_fall' }, { value: 'harbor_intro', label: 'Harbor Intro' }])
    expect(view.suggestions(CUTSCENES)).toEqual([{ value: 'gate_fall' }, { value: 'harbor_intro', label: 'Harbor Intro' }])
    expect(view.refProviders(CUTSCENES)).toEqual(['phantasos'])
    const empty = new CatalogView({ ok: true, catalog: PHANTASOS_CATALOG, syncedAt: {}, pools: [], refs: {}, refLabels: {} })
    expect(empty.missingRefs(CUTSCENE)).toEqual(['phantasos'])
  })
})

describe('Phantasos sentences', () => {
  it('objectives: a cutscene\'s id reads as a title, and any cutscene without one', () => {
    expect(objective({ type: 'watch_cutscene', cutscene: 'harbor_intro' })).toBe('Watch Harbor Intro')
    expect(objective({ type: 'watch_cutscene', cutscene: 'harbor_intro', finish_only: true })).toBe('Watch Harbor Intro (to the end)')
    expect(objective({ type: 'watch_cutscene', cutscene: 'harbor_intro', finish_only: false, amount: 2 })).toBe('Watch Harbor Intro 2 times')
    expect(objective({ type: 'skip_cutscene', cutscenes: ['harbor_intro'] })).toBe('Skip Harbor Intro')
    expect(objective({ type: 'skip_cutscene', cutscenes: ['harbor_intro', 'gate_fall'], amount: 3 })).toBe('Skip Harbor Intro or Gate Fall 3 times')
    expect(objective({ type: 'skip_cutscene' })).toBe('Skip a cutscene')
    expect(objective({ type: 'skip_cutscene', cutscenes: [], amount: 2 })).toBe('Skip a cutscene 2 times')
  })

  it('requirements, reversed in their own words', () => {
    expect(requirement({ type: 'seen_cutscene', cutscene: 'harbor_intro' })).toBe('Watched Harbor Intro')
    expect(requirement({ type: 'seen_cutscene', cutscene: 'harbor_intro', not: true })).toBe('Hasn\'t watched Harbor Intro yet')
    expect(requirement({ type: 'seen_cutscene' })).toBe('Watched a cutscene')
    expect(requirement({ type: 'watching_cutscene', cutscene: 'gate_fall' })).toBe('Watching Gate Fall')
    expect(requirement({ type: 'watching_cutscene' })).toBe('Watching a cutscene')
    expect(requirement({ type: 'watching_cutscene', cutscene: '', not: true })).toBe('Not watching a cutscene')
    expect(requirement({ type: 'seen_cutscene', cutscene: 'harbor_intro', display: 'Saw the harbor' })).toBe('Saw the harbor')
  })

  it('rewards: play says its own party and force, without the generic party note', () => {
    setOwnPartyTypes(ownPartyTypes(PHANTASOS_CATALOG))
    expect(reward({ type: 'play_cutscene', cutscene: 'harbor_intro' })).toBe('Plays Harbor Intro')
    expect(reward({ type: 'play_cutscene', cutscene: 'harbor_intro', party: true })).toBe('Plays Harbor Intro (with their party)')
    expect(reward({ type: 'play_cutscene', cutscene: 'harbor_intro', force: true })).toBe('Plays Harbor Intro (forced)')
    expect(reward({ type: 'play_cutscene', cutscene: 'harbor_intro', party: true, force: true })).toBe('Plays Harbor Intro (with their party) (forced)')
    expect(reward({ type: 'stop_cutscene' })).toBe('Stops the cutscene')
    expect(reward({ type: 'stop_cutscene', cutscene: '' })).toBe('Stops the cutscene')
    expect(reward({ type: 'stop_cutscene', cutscene: 'gate_fall' })).toBe('Stops Gate Fall')
    expect(reward({ type: 'mark_cutscene_seen', cutscene: 'harbor_intro' })).toBe('Counts Harbor Intro as watched')
    expect(reward({ type: 'mark_cutscene_seen' })).toBe('Counts a cutscene as watched')
    expect(describeAction({ type: 'mark_cutscene_seen', cutscene: 'gate_fall' }).mini).toBe('Counts Gate Fall as watched')
    // Other rewards keep the generic note
    expect(reward({ type: 'vanilla_experience', amount: 5, party: true })).toBe('5 XP (party)')
  })

  it('a display name, should one be sent, is used as it is', () => {
    setRefNames(LABELS)
    expect(objective({ type: 'watch_cutscene', cutscene: 'gate_fall' })).toBe('Watch The Gate Falls')
    expect(objective({ type: 'skip_cutscene', cutscenes: ['harbor_intro', 'gate_fall'] })).toBe('Skip Harbor Intro or The Gate Falls')
  })
})

describe('Phantasos in the creator', () => {
  it('a quest with every Phantasos type checks clean, and its required cutscenes are required', () => {
    const problems = (tree: Tree) => {
      const read = canonicalQuest({ name: 'Q', pool: 'global', ...tree }, 'q', ownPartyTypes(PHANTASOS_CATALOG))
      expect(read.quest).not.toBeNull()
      return [...read.problems, ...validateQuest(read.quest!, { catalog: PHANTASOS_CATALOG, refs: { phantasos: { cutscenes: ['harbor_intro'] } } })
        ].map((p) => `${p.error ? 'error' : 'warn'} ${p.path}: ${p.message}`)
    }
    expect(problems({
      requirements: [{ type: 'seen_cutscene', cutscene: 'harbor_intro', not: true }, { type: 'watching_cutscene', not: true }],
      objectives: { watch: { type: 'watch_cutscene', cutscene: 'harbor_intro', finish_only: true }, skip: { type: 'skip_cutscene', amount: 2 } },
      rewards: [
        { type: 'play_cutscene', cutscene: 'harbor_intro', party: true, force: true },
        { type: 'stop_cutscene', cutscene: '' },
        { type: 'mark_cutscene_seen', cutscene: 'harbor_intro' },
      ],
    })).toEqual([])
    expect(problems({ requirements: [{ type: 'seen_cutscene' }], objectives: { o: { type: 'skip_cutscene' } }, rewards: [{ type: 'mark_cutscene_seen' }] }))
      .toEqual(['error requirements[0].cutscene: missing: cutscene', 'error rewards[0].cutscene: missing: cutscene'])
  })

  it('each type has a symbol of its own, unlike the others in its category', () => {
    const types = [
      ['objective', 'watch_cutscene'], ['objective', 'skip_cutscene'],
      ['requirement', 'seen_cutscene'], ['requirement', 'watching_cutscene'],
      ['reward', 'play_cutscene'], ['reward', 'stop_cutscene'], ['reward', 'mark_cutscene_seen'],
    ] as const
    for (const [category, id] of types) {
      const symbol = typeSymbol(category, id)
      expect(symbol.known, id).toBe(true)
      const look = (s: typeof symbol) => [...s.grid, s.main, s.accent].join('\n')
      const same = (typeIds as { id: string; category: string }[])
        .filter((t) => t.category === category && t.id !== id && look(typeSymbol(category, t.id)) === look(symbol))
      expect(same, id).toEqual([])
    }
  })

  it('the showcase has a Phantasos card, and its counts are every type the plugin has', () => {
    const phantasos = INTEGRATIONS.find((i) => i.name === 'Phantasos')!
    expect(phantasos.objectives).toEqual(['watch_cutscene', 'skip_cutscene'])
    expect(phantasos.requirements).toEqual(['seen_cutscene', 'watching_cutscene'])
    expect(phantasos.rewards).toEqual(['play_cutscene', 'stop_cutscene', 'mark_cutscene_seen'])
    const ids = typeIds as { id: string; category: string }[]
    const count = (category: string) => ids.filter((t) => t.category === category).length
    expect(COUNTS).toEqual({ objectives: count('objective'), requirements: count('requirement'), rewards: count('reward'), integrations: INTEGRATIONS.length })
  })
})

/** A made-up reward type with a party argument of its own (a text, not true or false) and a party_range of its own. */
const RALLY = type('rally_banner', [param('party', 'STRING'), param('party_range', 'INTEGER', { min: 0 })])
const OWN_CATALOG: Catalog = {
  ...PHANTASOS_CATALOG,
  types: { ...PHANTASOS_CATALOG.types!, reward: [...PHANTASOS_CATALOG.types!.reward, RALLY] },
}

describe('a reward type with a party argument of its own', () => {
  const OWN = ownPartyTypes(OWN_CATALOG)
  const problems = (tree: Tree, own: ReadonlySet<string> = OWN) => {
    const read = canonicalQuest({ name: 'Q', pool: 'global', objectives: { o: { type: 'fish' } }, ...tree }, 'q', own)
    expect(read.quest).not.toBeNull()
    return [...read.problems, ...validateQuest(read.quest!, { catalog: OWN_CATALOG, refs: {} })].map((p) => `${p.error ? 'error' : 'warn'} ${p.path}: ${p.message}`)
  }
  const PLAY = { type: 'play_cutscene', cutscene: 'harbor_intro', party: true }
  const RALLY_ENTRY = { type: 'rally_banner', party: 'guild', party_range: 12 }

  it('are the types that declare party, Phantasos\'s play_cutscene among them', () => {
    expect([...OWN].sort()).toEqual(['play_cutscene', 'rally_banner'])
  })

  it('may have party anywhere: in callbacks, fail actions and every reward list', () => {
    for (const entry of [PLAY, RALLY_ENTRY]) {
      expect(problems({ callbacks: { complete: [entry] } }), entry.type).toEqual([])
      expect(problems({ objectives: { o: { type: 'fish', callbacks: [entry] } } }), entry.type).toEqual([])
      expect(problems({ stages: { 0: { callbacks: [entry] } } }), entry.type).toEqual([])
      expect(problems({ fail: { when: [{ type: 'die' }], actions: [entry] } }), entry.type).toEqual([])
      expect(problems({ rewards: [entry] }), entry.type).toEqual([])
    }
  })

  it('a plain reward still gets the party error outside the rewards of a quest, a stage or an objective', () => {
    expect(problems({ callbacks: { complete: [{ type: 'item', item: 'minecraft:diamond', party: true }] } }))
      .toEqual([`error callbacks.complete[0].party: ${REWARD_PARTY_PLACE}`])
    // Without the catalog's word, play_cutscene reads as a plain reward too
    expect(problems({ callbacks: { complete: [PLAY] } }, new Set())).toEqual([`error callbacks.complete[0].party: ${REWARD_PARTY_PLACE}`])
  })

  it('keep party and party_range as their arguments: no party flag, no range warning, checked as the type declares them', () => {
    const read = canonicalQuest({ name: 'Q', pool: 'global', objectives: { o: { type: 'fish' } }, rewards: [RALLY_ENTRY, { type: 'rally_banner', party_range: 4 }] }, 'q', OWN)
    expect(read.problems).toEqual([])
    expect(read.quest!.rewards[0]).toEqual({ type: 'rally_banner', args: [['party', 'guild'], ['party_range', 12]] })
    expect((writeQuest(read.quest!).rewards as Tree[])[0]).toEqual(RALLY_ENTRY)
    expect(problems({ rewards: [{ type: 'rally_banner', party_range: -1 }] })).toEqual(['error rewards[0].party_range: must be at least 0'])
  })

  it('give no farm warning on a repeatable quest', () => {
    const catalog: Catalog = { ...OWN_CATALOG, types: { ...OWN_CATALOG.types!, reward: OWN_CATALOG.types!.reward.map((t) => (t.id === 'item' ? { ...t, params: [...t.params, param('party', 'BOOLEAN')] } : t)) } }
    const read = (own: ReadonlySet<string>) => canonicalQuest({ name: 'Q', pool: 'global', repeatable: true, objectives: { o: { type: 'fish' } },
      rewards: [{ type: 'item', item: 'minecraft:diamond', party: true }] }, 'q', own).quest!
    const warnings = (own: ReadonlySet<string>) => validateQuest(read(own), { catalog, refs: {} }).filter((p) => !p.error).map((p) => p.message)
    expect(warnings(new Set())).toEqual(['every party member gets it each time anyone completes it'])
    expect(warnings(ownPartyTypes(catalog))).toEqual([])
  })

  it('leave the party note out of their line, unlike a plain reward', () => {
    setOwnPartyTypes(OWN)
    expect(reward({ type: 'play_cutscene', cutscene: 'harbor_intro', party: true })).toBe('Plays Harbor Intro (with their party)')
    expect(reward(RALLY_ENTRY)).not.toContain('(party')
    expect(reward({ type: 'item', item: 'minecraft:diamond', party: true })).toBe('1× diamond (party)')
  })

  it('in the creator: read and saved as their arguments, and a party reward retyped into one hands its party over', () => {
    setOwnPartyTypes(OWN)
    const body = { id: 'q', name: 'Q', pool: 'global', objectives: { o: { type: 'fish', amount: 1 } }, callbacks: { complete: [PLAY] },
      rewards: [{ type: 'item', item: 'minecraft:diamond', amount: 1, party: true, party_range: 8 }] }
    const model = treeToModel(body, 'q')
    const play = Object.values(model.entries).find((e) => e.type === 'play_cutscene')!
    expect(play.args).toEqual([['cutscene', 'harbor_intro'], ['party', true]])
    expect('party' in play).toBe(false)
    expect((modelToTree(model).callbacks as Tree).complete).toEqual([PLAY])
    const item = Object.values(model.entries).find((e) => e.type === 'item')!
    expect(retype(model, item.nid, 'rally_banner', ['party', 'party_range'])).toBeNull()
    expect(item).toMatchObject({ type: 'rally_banner', args: [['party', true], ['party_range', 8]] })
    expect('party' in item || 'partyRange' in item).toBe(false)
  })
})
