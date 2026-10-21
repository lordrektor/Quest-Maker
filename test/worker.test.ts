import { describe, expect, it } from 'vitest'
import { constantTimeEquals, hmacHex, verify } from '../worker/auth'
import { readFetch, readUpsert } from '../worker/definitions'
import { HttpError } from '../worker/http'
import { randomCode, readOtpCreate } from '../worker/otp'
import { readCatalog } from '../worker/catalog'
import { conflictsOf, loadPools, loadQuests, readIds, readSave, readWorkspaceFetch, referencedQuests, saveAll, type Writer } from '../worker/creator'
import { readSynced } from '../worker/definitions'
import { canonicalQuest } from '../shared/quest/canonical'
import { readRefs } from '../worker/refs'
import { testD1 } from './d1'
import { CATALOG } from './fixtures'

/** The same vector is checked by the plugin's tests (WorkerSigningTest): both sides must sign alike. */
const VECTOR = {
  secret: 'chronos-test-secret',
  timestamp: '1700000000000',
  body: '{"server":"lobby","items":[]}',
  signature: '98c26901808ae351d86edb12bd45e8d4ada99a6c8fb0655e1cc3fb26864b3b86',
}

describe('signing', () => {
  it('matches the shared vector', async () => {
    expect(await hmacHex(VECTOR.secret, `${VECTOR.timestamp}.${VECTOR.body}`)).toBe(VECTOR.signature)
  })

  it('accepts a fresh, well-signed request', async () => {
    const now = Number(VECTOR.timestamp) + 5_000
    expect(await verify(VECTOR.secret, VECTOR.timestamp, VECTOR.signature, VECTOR.body, now, 60_000)).toEqual({ ok: true })
    expect(await verify(VECTOR.secret, VECTOR.timestamp, VECTOR.signature.toUpperCase(), VECTOR.body, now, 60_000)).toEqual({ ok: true })
  })

  it('refuses stale, tampered, unsigned or secretless requests', async () => {
    const now = Number(VECTOR.timestamp)
    const late = await verify(VECTOR.secret, VECTOR.timestamp, VECTOR.signature, VECTOR.body, now + 61_000, 60_000)
    expect(late.ok).toBe(false)
    const tampered = await verify(VECTOR.secret, VECTOR.timestamp, VECTOR.signature, VECTOR.body.replace('lobby', 'evil'), now, 60_000)
    expect(tampered).toEqual({ ok: false, reason: 'bad signature' })
    expect((await verify(VECTOR.secret, null, null, VECTOR.body, now, 60_000)).ok).toBe(false)
    expect((await verify('', VECTOR.timestamp, VECTOR.signature, VECTOR.body, now, 60_000)).ok).toBe(false)
    expect((await verify(VECTOR.secret, 'soon', VECTOR.signature, VECTOR.body, now, 60_000)).ok).toBe(false)
  })

  it('compares in constant time', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true)
    expect(constantTimeEquals('abc', 'abd')).toBe(false)
    expect(constantTimeEquals('abc', 'ab')).toBe(false)
  })
})

describe('requests are checked', () => {
  it('upsert', () => {
    const ok = readUpsert({ server: 'lobby', items: [{ kind: 'quest', id: 'first_steps', body: { name: 'x' }, version: 3, updatedAt: 5 }] })
    expect(ok.items[0]).toMatchObject({ kind: 'quest', id: 'first_steps', version: 3, updatedAt: 5, updatedBy: null })
    expect(() => readUpsert({ items: [{ kind: 'npc', id: 'a', body: {} }] })).toThrow(HttpError)
    expect(() => readUpsert({ items: [{ kind: 'quest', id: 'Bad Id', body: {} }] })).toThrow(/Chronos id/)
    expect(() => readUpsert({ items: [{ kind: 'quest', id: 'a', body: [] }] })).toThrow(/object/)
    expect(() => readUpsert({ items: 'nope' })).toThrow(/list/)
  })

  it('fetch', () => {
    expect(readFetch({ kind: 'pool', ids: null })).toEqual({ kind: 'pool', ids: null, withDeletes: false })
    expect(readFetch({ kind: 'quest' })).toEqual({ kind: 'quest', ids: null, withDeletes: false })
    expect(readFetch({ kind: 'quest', ids: ['a', 'b_2'] })).toEqual({ kind: 'quest', ids: ['a', 'b_2'], withDeletes: false })
    expect(() => readFetch({ kind: 'quest', ids: ['../etc'] })).toThrow(HttpError)
  })

  it('otp', () => {
    const uuid = '2bc0f2c9-3c1a-43fe-a0ca-2250a4003812'
    expect(readOtpCreate({ ownerType: 'player', ownerUuid: uuid, ownerName: 'Alex', validitySeconds: 300 }).validitySeconds).toBe(300)
    expect(readOtpCreate({ ownerType: 'console', ownerUuid: uuid, ownerName: 'CONSOLE', validitySeconds: 99999 }))
      .toEqual({ ownerType: 'console', ownerUuid: null, ownerName: 'CONSOLE', validitySeconds: 900, canDelete: false })
    expect(() => readOtpCreate({ ownerType: 'player', ownerName: 'Alex' })).toThrow(/ownerUuid/)
    expect(() => readOtpCreate({ ownerType: 'admin', ownerName: 'x' })).toThrow(HttpError)
  })

  it('refs', () => {
    expect(readRefs({ provider: 'vulcan', refs: [{ kind: 'items', id: 'ember_blade' }] }).refs).toHaveLength(1)
    expect(() => readRefs({ provider: 'mythic', refs: [] })).toThrow(/provider/)
    expect(() => readRefs({ provider: 'tyche', refs: [{ kind: 'Bosses!', id: 'x' }] })).toThrow(HttpError)
  })
})

describe('codes', () => {
  it('are six digits, spread over the range', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const code = randomCode()
      expect(code).toMatch(/^\d{6}$/)
      seen.add(code)
    }
    expect(seen.size).toBeGreaterThan(1990)
  })
})

describe('the catalog', () => {
  it('takes one known section, an object, not too large', () => {
    expect(readCatalog({ section: 'types', body: { objective: [] }, server: 'lobby' })).toEqual({ section: 'types', body: { objective: [] }, server: 'lobby' })
    expect(() => readCatalog({ section: 'secrets', body: {} })).toThrow(/section must be one of/)
    expect(() => readCatalog({ section: 'types', body: [] })).toThrow(/object/)
    expect(() => readCatalog({ section: 'vanilla', body: { items: 'x'.repeat(2_000_000) } })).toThrow(/larger/)
  })
})

describe('creator requests are checked', () => {
  const quest = { id: 'a', body: { name: 'A', pool: 'daily', objectives: { o: { type: 'fish' } } }, layout: null, baseUpdatedAt: null }

  it('ids', () => {
    expect(readIds('a, b,a')).toEqual(['a', 'b'])
    expect(() => readIds('')).toThrow(/name the quests/)
    expect(() => readIds('../x')).toThrow(/not a quest id/)
    expect(() => readIds(Array.from({ length: 51 }, (_, i) => `q${i}`).join(','))).toThrow(/at most 50/)
  })

  it('saves', () => {
    expect(readSave({ quests: [quest] }).quests[0]).toEqual(quest)
    expect(readSave({ quests: [], workspace: { name: 'act-1', body: { v: 1, quests: [{ id: 'a', x: 0, y: 0, open: true }] }, baseUpdatedAt: 5 } })
      .workspace?.baseUpdatedAt).toBe(5)
    expect(() => readSave({ quests: [] })).toThrow(/nothing to save/)
    expect(() => readSave({ quests: [{ ...quest, id: 'Bad' }] })).toThrow(/not a quest id/)
    expect(() => readSave({ quests: [quest, quest] })).toThrow(/twice/)
    expect(() => readSave({ quests: [{ ...quest, body: { ...quest.body, id: 'b' } }] })).toThrow(/body.id is not a/)
    expect(() => readSave({ quests: [{ ...quest, body: { name: 'x'.repeat(300_000) } }] })).toThrow(/larger than/)
    expect(() => readSave({ quests: [{ ...quest, layout: { positions: {} } }] })).toThrow(/not a layout/)
    expect(() => readSave({ quests: [{ ...quest, baseUpdatedAt: 'yesterday' }] })).toThrow(/baseUpdatedAt/)
    expect(() => readSave({ quests: [], workspace: { name: 'Has Space', body: { v: 1, quests: [] } } })).toThrow(/workspace.name/)
    expect(() => readSave({ quests: Array.from({ length: 26 }, (_, i) => ({ ...quest, id: `q${i}` })) })).toThrow(/at most 25/)
  })

  it('a workspace download names a workspace', () => {
    expect(readWorkspaceFetch({ name: 'lordrektor_do_not_touch' })).toBe('lordrektor_do_not_touch')
    expect(() => readWorkspaceFetch({ name: 'Bad Name' })).toThrow(/workspace name/)
    expect(() => readWorkspaceFetch({})).toThrow(/workspace name/)
  })

  it('a download names what it took', () => {
    expect(readSynced({ kind: 'quest', items: [{ id: 'a', updatedAt: 5 }] })).toEqual({ kind: 'quest', items: [{ id: 'a', updatedAt: 5 }] })
    expect(() => readSynced({ kind: 'quest', items: [{ id: 'a' }] })).toThrow(/updatedAt/)
  })

  it('export may overwrite web edits only when forced', () => {
    expect(readUpsert({ items: [] }).overwriteWeb).toBe(false)
    expect(readUpsert({ items: [], overwriteWeb: true }).overwriteWeb).toBe(true)
  })
})

describe('saving', () => {
  const doc = (id: string, updatedAt: number) => ({ id, body: {}, layout: null, updatedAt, updatedBy: null, source: 'web' as const, webPending: true })
  const save = (base: number | null, workspaceBase?: number | null) => ({
    quests: [{ id: 'a', body: {}, layout: null, baseUpdatedAt: base }],
    workspace: workspaceBase === undefined ? undefined : { name: 'w', body: { v: 1 as const, quests: [] }, baseUpdatedAt: workspaceBase },
  })

  it('notices when someone saved in between', () => {
    expect(conflictsOf(save(5), new Map([['a', doc('a', 5)]]), null)).toBeNull()
    expect(conflictsOf(save(5), new Map([['a', doc('a', 7)]]), null)?.quests).toEqual([doc('a', 7)])
    expect(conflictsOf(save(null), new Map([['a', doc('a', 7)]]), null)?.quests).toEqual([doc('a', 7)])
    expect(conflictsOf(save(5), new Map(), null)?.quests).toEqual([{ id: 'a', missing: true }])
    const workspace = { name: 'w', body: { v: 1 as const, quests: [] }, createdBy: null, updatedAt: 9, updatedBy: null }
    expect(conflictsOf(save(5, 9), new Map([['a', doc('a', 5)]]), workspace)).toBeNull()
    expect(conflictsOf(save(5, null), new Map([['a', doc('a', 5)]]), workspace)?.workspace).toEqual(workspace)
    expect(conflictsOf(save(5, 3), new Map([['a', doc('a', 5)]]), workspace)?.workspace).toEqual(workspace)
  })

  it('finds the quests a quest names', () => {
    const { quest } = canonicalQuest({
      pool: 'p', objectives: { o: { type: 'fish' } },
      requirements: [{ type: 'quest_completed', quest: 'before' }, { type: 'level', min: 5 }],
      rewards: [{ type: 'start_quest', quest: 'after' }],
    }, 'middle')
    expect(referencedQuests(quest!, {}).sort()).toEqual(['after', 'before'])
  })
})

describe('scope (ExperienceTailor characters)', () => {
  const ALEX: Writer = { name: 'Alex', key: '00000000-0000-4000-8000-000000000001', dev: false, canDelete: false }
  /** As Chronos stores it: hidden_until_unlocked, no_teleport, then scope. */
  const SHARED = { id: 'shared', name: 'Shared', pool: 'global', hidden_until_unlocked: true, no_teleport: true, scope: 'account', objectives: { a: { type: 'fish', amount: 1 } } }

  /** A database with the catalog, four pools and the quest shared, from the game. */
  async function seeded() {
    const db = testD1()
    const pool = (id: string, body: object) => db.prepare(`INSERT INTO definitions (kind, id, body, version, updated_at, source, web_pending)
      VALUES ('pool', ?1, ?2, 1, 1, 'server', 0)`).bind(id, JSON.stringify({ id, ...body }))
    await db.batch([
      ...Object.entries(CATALOG).map(([section, body]) => db.prepare('INSERT INTO catalog (section, body, synced_at) VALUES (?1, ?2, 1)')
        .bind(section, JSON.stringify(body))),
      pool('global', { type: 'global' }),
      pool('legacy', { type: 'global', scope: 'account' }),
      pool('daily', { type: 'timed_random', scope: ' Account ' }),
      pool('weekly', { type: 'timed_random' }),
      db.prepare(`INSERT INTO definitions (kind, id, body, version, updated_at, updated_by, source, server, web_pending)
        VALUES ('quest', 'shared', ?1, 1, 100, 'Steve', 'server', 'lobby', 0)`).bind(JSON.stringify(SHARED)),
    ])
    return db
  }

  it('pools carry their scope (character when missing)', async () => {
    const pools = await loadPools(await seeded())
    expect(pools.map((p) => [p.id, p.type, p.scope])).toEqual([
      ['daily', 'timed_random', 'account'], ['global', 'global', 'character'], ['legacy', 'global', 'account'], ['weekly', 'timed_random', 'character'],
    ])
  })

  it('a save keeps scope: account, and an unchanged quest stays unchanged', async () => {
    const db = await seeded()
    const same = await saveAll(db, { quests: [{ id: 'shared', body: SHARED, layout: null, baseUpdatedAt: 100 }] }, ALEX, 2000)
    expect(same.status, JSON.stringify(same.body)).toBe(200)
    expect((await loadQuests(db, ['shared']))[0]).toMatchObject({ updatedAt: 100, webPending: false })

    const renamed = await saveAll(db, { quests: [{ id: 'shared', body: { ...SHARED, name: 'Shared Too' }, layout: null, baseUpdatedAt: 100 }] }, ALEX, 2000)
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    const [quest] = await loadQuests(db, ['shared'])
    expect(quest).toMatchObject({ webPending: true })
    expect(JSON.stringify(quest!.body)).toBe(JSON.stringify({ ...SHARED, name: 'Shared Too' }))
  })

  it('a quest whose pool decides its scope is warned about', async () => {
    const db = await seeded()
    const body = { name: 'Rolled', pool: 'weekly', difficulty: 'easy', scope: 'account', objectives: { a: { type: 'fish' } } }
    const saved = await saveAll(db, { quests: [{ id: 'rolled', body, layout: null, baseUpdatedAt: null }] }, ALEX, 2000)
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((saved.body as { warnings: Record<string, { path: string; message: string }[]> }).warnings.rolled)
      .toContainEqual({ path: 'scope', message: 'ignored: it follows pool weekly (scope: character), a timed pool', error: false })
  })
})
