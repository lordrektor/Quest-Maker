import { describe, expect, it } from 'vitest'
import type { Catalog, CatalogResponse, ParamDto, Tree, TypeDto } from '../shared/creator'
import { canonicalQuest } from '../shared/quest/canonical'
import { validateQuest, type ValidateContext } from '../shared/quest/validate'
import { CatalogView } from '../src/creator/catalog'
import { catalogResponse } from '../worker/creator'
import { HttpError } from '../worker/http'
import { readRefs, refIndex, refLabels, replaceRefs } from '../worker/refs'
import { testD1 } from './d1'
import { CATALOG } from './fixtures'

const param = (name: string, kind: ParamDto['kind'], extra: Partial<ParamDto> = {}): ParamDto =>
  ({ name, kind, required: false, default: null, min: null, description: name, ...extra })
const type = (id: string, params: ParamDto[]): TypeDto => ({ id, owner: 'Convo', description: id, icon: 'minecraft:book', params })

const NPC = param('npc', 'STRING', { required: true, pick: ['refs:convo:npcs'] })
const CONVO = param('convo', 'STRING', { pick: ['refs:convo:convos'], scope: ['npc'] })
const ANSWER = param('answer', 'STRING', { required: true, pick: ['refs:convo:answers'], scope: ['npc', 'convo'] })

/** The test catalog with Convo's types, as Convo registers them. */
const CONVO_CATALOG: Catalog = {
  ...CATALOG,
  types: {
    ...CATALOG.types!,
    owners: [...CATALOG.types!.owners, 'Convo'],
    objective: [
      ...CATALOG.types!.objective,
      type('talk_npc', [param('npcs', 'ENTITY_LIST', { only: 'convo' })]),
      type('convo_start', [NPC, CONVO]),
      type('convo_answer', [NPC, { ...CONVO, required: true }, ANSWER]),
    ],
    reward: [...CATALOG.types!.reward, type('start_convo', [NPC, { ...CONVO, required: true }])],
    keySources: { ...CATALOG.types!.keySources, 'entity:convo': 'refs:convo:npcs' },
  },
}

/** What /chronos cl refs convo sends: scoped ids are paths, and most have a display name. */
const SENT = {
  provider: 'convo',
  refs: [
    { kind: 'npcs', id: 'guard', label: '  Town Guard ' },
    { kind: 'npcs', id: 'smith', label: null },
    { kind: 'convos', id: 'guard/intro', label: 'Greeting' },
    { kind: 'convos', id: 'guard/farewell' },
    { kind: 'convos', id: 'smith/intro', label: 'Shop talk' },
    { kind: 'answers', id: 'guard/intro/accept', label: 'I will help' },
    { kind: 'answers', id: 'guard/intro/refuse' },
    { kind: 'answers', id: 'smith/intro/accept' },
  ],
}

describe('reference ids with display names', () => {
  it('reads an optional label: text, trimmed, at most 128 characters', () => {
    const refs = readRefs(SENT).refs
    expect(refs[0]).toEqual({ kind: 'npcs', id: 'guard', label: 'Town Guard' })
    expect(refs[1]!.label).toBeNull()
    expect(refs[3]!.label).toBeNull()
    expect(readRefs({ provider: 'convo', refs: [{ kind: 'npcs', id: 'a', label: 7 }] }).refs[0]!.label).toBeNull()
    expect(readRefs({ provider: 'convo', refs: [{ kind: 'npcs', id: 'a', label: '   ' }] }).refs[0]!.label).toBeNull()
    expect(readRefs({ provider: 'convo', refs: [{ kind: 'npcs', id: 'a', label: 'x'.repeat(129) }] }).refs[0]!.label).toBeNull()
    expect(readRefs({ provider: 'convo', refs: [{ kind: 'npcs', id: 'a', label: 'x'.repeat(128) }] }).refs[0]!.label).toHaveLength(128)
    expect(() => readRefs({ provider: 'mythic', refs: [] })).toThrow(HttpError)
  })

  it('takes Plutus clusters, groups and categories', () => {
    const sent = { provider: 'plutus', refs: [{ kind: 'clusters', id: 'supply_crate', label: 'Supply Crate' }, { kind: 'groups', id: 'rare_drops' }, { kind: 'categories', id: 'ore' }] }
    expect(readRefs(sent)).toEqual({ provider: 'plutus', refs: [
      { kind: 'clusters', id: 'supply_crate', label: 'Supply Crate' }, { kind: 'groups', id: 'rare_drops', label: null }, { kind: 'categories', id: 'ore', label: null },
    ] })
    const view = new CatalogView({ ok: true, catalog: CATALOG, syncedAt: {}, refs: { plutus: { clusters: ['supply_crate'] } }, refLabels: { plutus: { clusters: { supply_crate: 'Supply Crate' } } }, pools: [] })
    const clusters = param('clusters', 'STRING_LIST', { pick: ['refs:plutus:clusters'] })
    expect(view.suggestions(clusters)).toEqual([{ value: 'supply_crate', label: 'Supply Crate' }])
    expect(view.refProviders(clusters)).toEqual(['plutus'])
    expect(view.missingRefs(param('groups', 'STRING_LIST', { pick: ['refs:plutus:groups'] }))).toEqual(['plutus'])
  })

  it('stores them and hands them to the creator, beside the ids', async () => {
    const db = testD1()
    expect(await replaceRefs(db, readRefs(SENT), 1000)).toBe(8)
    await replaceRefs(db, readRefs({ provider: 'tyche', refs: [{ kind: 'mobs', id: 'ballista' }] }), 1000)

    // Validation reads the ids only, as before
    const index = await refIndex(db)
    expect(index.convo).toEqual({
      answers: ['guard/intro/accept', 'guard/intro/refuse', 'smith/intro/accept'],
      convos: ['guard/farewell', 'guard/intro', 'smith/intro'],
      npcs: ['guard', 'smith'],
    })
    expect(index.tyche).toEqual({ mobs: ['ballista'] })

    const labels = { convo: { npcs: { guard: 'Town Guard' }, convos: { 'guard/intro': 'Greeting', 'smith/intro': 'Shop talk' }, answers: { 'guard/intro/accept': 'I will help' } } }
    expect(await refLabels(db)).toEqual(labels)
    const response = await catalogResponse(db)
    expect(response.refs).toEqual(index)
    expect(response.refLabels).toEqual(labels)

    // Sending again replaces names too
    await replaceRefs(db, readRefs({ provider: 'convo', refs: [{ kind: 'npcs', id: 'guard', label: 'Captain' }] }), 2000)
    expect(await refLabels(db)).toEqual({ convo: { npcs: { guard: 'Captain' } } })
  })
})

describe('scoped pick lists', () => {
  const response: CatalogResponse = {
    ok: true,
    catalog: CONVO_CATALOG,
    syncedAt: {},
    refs: readRefs(SENT).refs.reduce<Record<string, Record<string, string[]>>>((index, ref) => {
      ((index.convo ??= {})[ref.kind] ??= []).push(ref.id)
      return index
    }, {}),
    refLabels: { convo: { npcs: { guard: 'Town Guard' }, convos: { 'guard/intro': 'Greeting' }, answers: { 'guard/intro/accept': 'I will help' } } },
    pools: [],
  }
  const view = new CatalogView(response)

  it('knows which plugins fill a field, for the hint to run /chronos cl refs', () => {
    expect(view.refProviders(ANSWER)).toEqual(['convo'])
    expect(view.refProviders(param('npcs', 'ENTITY_LIST', { only: 'convo' }))).toEqual(['convo'])
    expect(view.refProviders(param('entities', 'ENTITY_LIST'))).toEqual(['convo', 'tyche'])
    expect(view.refProviders(param('item', 'ITEM'))).toEqual(['vulcan'])
    expect(view.refProviders(param('amount', 'INTEGER'))).toEqual([])
    expect(view.refProviders(param('biomes', 'STRING_LIST', { pick: ['list:chronos:biomes'] }))).toEqual([])
  })

  it('names ids by their label', () => {
    expect(view.suggestions(NPC)).toEqual([{ value: 'guard', label: 'Town Guard' }, { value: 'smith' }])
    // An NPC as an entity key
    expect(view.suggestions(param('npcs', 'ENTITY_LIST'))).toEqual(expect.arrayContaining([{ value: 'convo:guard', label: 'Town Guard' }, { value: 'convo:smith' }]))
  })

  it('offers only what the scoping arguments narrow to, by the last part', () => {
    expect(view.suggestions(CONVO, [], { npc: 'guard' })).toEqual([{ value: 'intro', label: 'Greeting' }, { value: 'farewell' }])
    expect(view.suggestions(CONVO, [], { npc: 'smith' })).toEqual([{ value: 'intro' }])
    expect(view.suggestions(CONVO, [], { npc: 'nobody' })).toEqual([])
    expect(view.suggestions(ANSWER, [], { npc: 'guard', convo: 'intro' })).toEqual([{ value: 'accept', label: 'I will help' }, { value: 'refuse' }])
    expect(view.suggestions(ANSWER, [], { npc: 'smith', convo: 'intro' })).toEqual([{ value: 'accept' }])
  })

  it('offers every id with its path while a scoping argument is empty', () => {
    expect(view.suggestions(CONVO)).toEqual([
      { value: 'intro', label: 'Greeting', hint: 'guard' }, { value: 'farewell', hint: 'guard' }, { value: 'intro', hint: 'smith' },
    ])
    // The npc is set, the conversation not yet
    expect(view.suggestions(ANSWER, [], { npc: 'guard', convo: ' ' })).toEqual([
      { value: 'accept', label: 'I will help', hint: 'guard/intro' }, { value: 'refuse', hint: 'guard/intro' }, { value: 'accept', hint: 'smith/intro' },
    ])
  })

  it('de-duplicates by value and path', () => {
    const twice = new CatalogView({ ...response, refs: { convo: { convos: ['guard/intro', 'guard/intro', 'smith/intro'] } } })
    expect(twice.suggestions(CONVO).map((s) => `${s.hint}/${s.value}`)).toEqual(['guard/intro', 'smith/intro'])
  })
})

describe('validating scoped values', () => {
  const CTX: ValidateContext = { catalog: CONVO_CATALOG, refs: { convo: { npcs: ['guard', 'smith'], convos: ['guard/intro', 'smith/intro'], answers: ['guard/intro/accept'] } } }
  const warnings = (tree: Tree, ctx = CTX) => {
    const read = canonicalQuest({ name: 'Q', pool: 'global', ...tree }, 'q')
    expect(read.quest).not.toBeNull()
    return validateQuest(read.quest!, ctx).map((p) => `${p.error ? 'error' : 'warn'} ${p.path}: ${p.message}`)
  }

  it('warns about a value that is not under its scope', () => {
    expect(warnings({ objectives: { o: { type: 'convo_start', npc: 'guard', convo: 'intro' } } })).toEqual([])
    expect(warnings({ objectives: { o: { type: 'convo_start', npc: 'guard', convo: 'trade' } } }))
      .toEqual(["warn objectives.o.convo: 'trade' is not a conversation of guard"])
    expect(warnings({ objectives: { o: { type: 'convo_answer', npc: 'smith', convo: 'intro', answer: 'accept' } } }))
      .toEqual(["warn objectives.o.answer: 'accept' is not an answer of smith/intro"])
    expect(warnings({ objectives: { o: { type: 'fish' } }, rewards: [{ type: 'start_convo', npc: 'smith', convo: 'farewell' }] }))
      .toEqual(["warn rewards[0].convo: 'farewell' is not a conversation of smith"])
  })

  it('says nothing while a scoping argument is empty or the ids were never sent', () => {
    expect(warnings({ objectives: { o: { type: 'convo_answer', convo: 'nowhere', answer: 'maybe' } } })).toEqual(['error objectives.o.npc: missing: npc'])
    expect(warnings({ objectives: { o: { type: 'convo_start', npc: 'guard', convo: 'trade' } } }, { ...CTX, refs: { convo: { npcs: ['guard'] } } })).toEqual([])
    expect(warnings({ objectives: { o: { type: 'convo_start', npc: 'guard', convo: 'trade' } } }, { ...CTX, refs: {} })).toEqual([])
  })

  it('names the scope generically for other kinds', () => {
    const catalog: Catalog = {
      ...CONVO_CATALOG,
      types: { ...CONVO_CATALOG.types!, objective: [...CONVO_CATALOG.types!.objective, type('visit_room', [param('house', 'STRING'), param('room', 'STRING', { pick: ['refs:convo:rooms'], scope: ['house'] })])] },
    }
    expect(warnings({ objectives: { o: { type: 'visit_room', house: 'inn', room: 'attic' } } }, { catalog, refs: { convo: { rooms: ['inn/cellar'] } } }))
      .toEqual(["warn objectives.o.room: 'attic' is not known under inn"])
  })
})
