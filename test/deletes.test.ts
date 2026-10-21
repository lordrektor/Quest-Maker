import { describe, expect, it } from 'vitest'
import { deleteQuest, loadQuests, readDeleteFrom, saveAll, workspaceQuests, type Writer } from '../worker/creator'
import { deleteDefinitions, fetchDefinitions, markSynced, readDelete, readFetch, upsert } from '../worker/definitions'
import { HttpError } from '../worker/http'
import { createOtp, readOtpCreate, useOtp } from '../worker/otp'
import { COOKIE, createSession, readSession } from '../worker/session'
import { testD1 } from './d1'
import { CATALOG } from './fixtures'

const ALEX: Writer = { name: 'Alex', key: '00000000-0000-4000-8000-000000000001', dev: false, canDelete: true }
const STEVE: Writer = { name: 'Steve', key: '00000000-0000-4000-8000-000000000002', dev: false, canDelete: false }
const BODY = { id: 'crypt', name: 'The Crypt', pool: 'global', objectives: { a: { type: 'fish' } } }

/** A database with two quests from the game (crypt has a layout) on the workspace "dungeons". */
async function seeded() {
  const db = testD1()
  await db.batch([
    db.prepare(`INSERT INTO definitions (kind, id, body, version, updated_at, updated_by, source, server, web_pending)
      VALUES ('quest', 'crypt', ?1, 3, 100, 'Alex', 'server', 'lobby', 0)`).bind(JSON.stringify(BODY)),
    db.prepare(`INSERT INTO definitions (kind, id, body, version, updated_at, updated_by, source, server, web_pending)
      VALUES ('quest', 'market', ?1, 1, 100, 'Alex', 'server', 'lobby', 0)`).bind(JSON.stringify({ ...BODY, id: 'market' })),
    db.prepare(`INSERT INTO layouts (kind, id, layout, updated_at) VALUES ('quest', 'crypt', '{"v":1,"positions":{}}', 100)`),
    db.prepare(`INSERT INTO workspaces (name, body, created_at, updated_at, owner_key) VALUES ('dungeons', ?1, 100, 100, 'x')`)
      .bind(JSON.stringify({ v: 1, quests: [{ id: 'crypt', x: 0, y: 0, open: true }, { id: 'market', x: 9, y: 0, open: true }] })),
  ])
  return db
}

describe('deleting on the website', () => {
  it('needs the delete right', async () => {
    const db = await seeded()
    expect((await deleteQuest(db, 'crypt', null, STEVE, 1000)).status).toBe(403)
    expect(await loadQuests(db, ['crypt'])).toHaveLength(1)
    expect((await deleteQuest(db, 'ghost', null, ALEX, 1000)).status).toBe(404)
  })

  it('hides the quest at once and keeps a mark for the game', async () => {
    const db = await seeded()
    expect((await deleteQuest(db, 'crypt', 'dungeons', ALEX, 1000)).body).toEqual({ ok: true, deleted: 'crypt' })
    expect(await loadQuests(db, ['crypt', 'market'])).toHaveLength(1)
    expect(await db.prepare("SELECT 1 FROM layouts WHERE id = 'crypt'").first()).toBeNull()
    expect((await deleteQuest(db, 'crypt', null, ALEX, 2000)).status).toBe(404)

    // An older plugin never sees it; one that applies deletes gets the mark
    expect(await fetchDefinitions(db, { kind: 'quest', ids: ['crypt'] })).toEqual([])
    const [mark] = await fetchDefinitions(db, { kind: 'quest', ids: null, withDeletes: true }).then((rows) => rows.filter((r) => r.id === 'crypt'))
    expect(mark).toMatchObject({ id: 'crypt', deleted: true, updatedAt: 1000, updatedBy: 'Alex' })
  })

  it('reaches the game through the workspace it was deleted from, even once it left the canvas', async () => {
    const db = await seeded()
    await deleteQuest(db, 'crypt', 'dungeons', ALEX, 1000)
    await db.prepare("UPDATE workspaces SET body = ?1 WHERE name = 'dungeons'").bind(JSON.stringify({ v: 1, quests: [{ id: 'market', x: 9, y: 0, open: true }] })).run()
    const old = await workspaceQuests(db, 'dungeons')
    expect(old?.items.map((i) => i.id)).toEqual(['market'])
    const current = await workspaceQuests(db, 'dungeons', true)
    expect(current?.items.map((i) => [i.id, i.deleted ?? false])).toEqual([['crypt', true], ['market', false]])
    expect(current?.missing).toEqual([])
  })

  it('is gone for good once the game took it, and an export does not bring it back unless forced', async () => {
    const db = await seeded()
    await deleteQuest(db, 'crypt', null, ALEX, 1000)
    const row = { kind: 'quest' as const, id: 'crypt', body: BODY, version: 4, updatedAt: 1500, updatedBy: 'Steve' }
    expect(await upsert(db, { server: 'lobby', items: [row] })).toEqual({ written: 0, skipped: ['crypt'] })
    expect(await loadQuests(db, ['crypt'])).toEqual([])

    expect(await markSynced(db, { kind: 'quest', items: [{ id: 'crypt', updatedAt: 999 }] })).toBe(0)
    expect(await markSynced(db, { kind: 'quest', items: [{ id: 'crypt', updatedAt: 1000 }] })).toBe(1)
    expect(await db.prepare("SELECT 1 FROM definitions WHERE id = 'crypt'").first()).toBeNull()

    await deleteQuest(db, 'market', null, ALEX, 1000)
    expect(await upsert(db, { server: 'lobby', items: [{ ...row, id: 'market' }], overwriteWeb: true })).toEqual({ written: 1, skipped: [] })
    expect(await loadQuests(db, ['market'])).toHaveLength(1)
  })

  it('a quest saved again under its id is live again', async () => {
    const db = await seeded()
    // What the game sent with cl types and cl export: the types and the pool the quest names
    await db.batch([
      ...Object.entries(CATALOG).map(([section, body]) => db.prepare('INSERT INTO catalog (section, body, synced_at) VALUES (?1, ?2, 1)')
        .bind(section, JSON.stringify(body))),
      db.prepare(`INSERT INTO definitions (kind, id, body, version, updated_at, source, web_pending) VALUES ('pool', 'global', '{"type":"global"}', 1, 1, 'server', 0)`),
    ])
    await deleteQuest(db, 'crypt', null, ALEX, 1000)
    const saved = await saveAll(db, { quests: [{ id: 'crypt', body: BODY, layout: null, baseUpdatedAt: null }] }, ALEX, 2000)
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const [quest] = await loadQuests(db, ['crypt'])
    expect(quest).toMatchObject({ id: 'crypt', webPending: true })
    expect((await fetchDefinitions(db, { kind: 'quest', ids: ['crypt'], withDeletes: true }))[0]?.deleted).toBeUndefined()
  })

  it('requests are checked', () => {
    expect(readDeleteFrom({})).toBeNull()
    expect(readDeleteFrom({ workspace: 'dungeons' })).toBe('dungeons')
    expect(() => readDeleteFrom({ workspace: 'No Spaces' })).toThrow(HttpError)
    expect(readFetch({ kind: 'quest', ids: null })).toEqual({ kind: 'quest', ids: null, withDeletes: false })
    expect(readFetch({ kind: 'quest', ids: ['a'], withDeletes: true }).withDeletes).toBe(true)
    expect(readDelete({ kind: 'quest', ids: ['a', 'a', 'b'] })).toEqual({ kind: 'quest', ids: ['a', 'b'] })
    expect(() => readDelete({ kind: 'quest', ids: ['Not An Id'] })).toThrow(HttpError)
  })
})

describe('deleting in game', () => {
  it('drops the website copy, except one edited on the website since the last download', async () => {
    const db = await seeded()
    await db.prepare("UPDATE definitions SET web_pending = 1 WHERE id = 'market'").run()
    expect(await deleteDefinitions(db, { kind: 'quest', ids: ['crypt', 'market', 'ghost'] })).toEqual({ deleted: ['crypt'], kept: ['market'] })
    expect(await db.prepare("SELECT 1 FROM layouts WHERE id = 'crypt'").first()).toBeNull()
    expect(await loadQuests(db, ['crypt', 'market'])).toHaveLength(1)
  })
})

describe('the delete right', () => {
  it('goes from the code to the session', async () => {
    const db = testD1()
    const request = readOtpCreate({ ownerType: 'player', ownerUuid: ALEX.key, ownerName: 'Alex', validitySeconds: 300, canDelete: true })
    expect(request.canDelete).toBe(true)
    expect(readOtpCreate({ ownerType: 'console', ownerName: 'CONSOLE' }).canDelete).toBe(false)
    const { code } = await createOtp(db, request, 1000)
    const owner = await useOtp(db, code, 2000)
    expect(owner).toMatchObject({ ownerName: 'Alex', canDelete: true })
    const token = await createSession(db, owner!, 2000, 3600_000)
    const session = await readSession(db, new Request('https://example.test/', { headers: { cookie: `${COOKIE}=${token}` } }), 3000)
    expect(session).toMatchObject({ ownerName: 'Alex', canDelete: true })
  })
})
