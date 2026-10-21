/**
 * The Chronos Worker: the signed API the plugin calls (/chronos/v1/...), the website's login (/api/auth/...), the
 * web creator (/api/creator/..., for signed-in people only), and the site itself (static assets, served by
 * Cloudflare before this code runs).
 */
import { verify } from './auth'
import { readCatalog, replaceCatalog } from './catalog'
import { creatorApi, readWorkspaceFetch, workspaceQuests, type Writer } from './creator'
import { deleteDefinitions, fetchDefinitions, markSynced, readDelete, readFetch, readSynced, readUpsert, upsert } from './definitions'
import { fail, HttpError, json, parseObject } from './http'
import { createOtp, readOtpCreate, useOtp } from './otp'
import { readRefs, replaceRefs } from './refs'
import { blockedFor, recordFailure } from './limits'
import { createSession, endSession, readSession, sessionCookie, type SessionOwner } from './session'

/** Answers for one signed-in person: never kept by shared caches. */
const PRIVATE = { 'cache-control': 'private, no-store' }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    // A database bound under another name (wrangler d1 create suggests the database's own name) breaks every call
    if (!env.DB) return fail('the Worker has no D1 binding named DB (check d1_databases in wrangler.jsonc)', 500)
    try {
      if (url.pathname.startsWith('/chronos/v1/')) return await plugin(request, env, url.pathname.slice('/chronos/v1/'.length))
      if (url.pathname.startsWith('/api/creator/')) return await creator(request, env, url, url.pathname.slice('/api/creator/'.length))
      if (url.pathname.startsWith('/api/auth/')) return await auth(request, env, url, url.pathname.slice('/api/auth/'.length))
      return fail('not found', 404)
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status)
      console.error('chronos worker error', e)
      return fail('internal error', 500)
    }
  },
} satisfies ExportedHandler<Env>

/** The plugin's signed calls. */
async function plugin(request: Request, env: Env, action: string): Promise<Response> {
  if (request.method !== 'POST') return fail('use POST', 405)
  const raw = await request.text()
  const verdict = await verify(env.CHRONOS_SECRET, request.headers.get('x-chronos-timestamp'), request.headers.get('x-chronos-signature'),
    raw, Date.now(), Number(env.MAX_CLOCK_SKEW_MS) || 60_000)
  if (!verdict.ok) return fail(verdict.reason, 401)
  const body = parseObject(raw)
  const now = Date.now()
  switch (action) {
    case 'definitions/upsert':
      return json({ ok: true, ...(await upsert(env.DB, readUpsert(body))) })
    case 'definitions/fetch':
      return json({ ok: true, items: await fetchDefinitions(env.DB, readFetch(body)) })
    case 'workspace/fetch': {
      const name = readWorkspaceFetch(body)
      const found = await workspaceQuests(env.DB, name, body.withDeletes === true)
      return found ? json({ ok: true, name, ...found }) : fail(`there is no workspace named ${name}`, 404)
    }
    case 'definitions/synced':
      return json({ ok: true, cleared: await markSynced(env.DB, readSynced(body)) })
    case 'definitions/delete':
      return json({ ok: true, ...(await deleteDefinitions(env.DB, readDelete(body))) })
    case 'catalog/replace':
      await replaceCatalog(env.DB, readCatalog(body), now)
      return json({ ok: true })
    case 'otp/create':
      return json({ ok: true, ...(await createOtp(env.DB, readOtpCreate(body), now)) })
    case 'refs/replace':
      return json({ ok: true, written: await replaceRefs(env.DB, readRefs(body), now) })
    case 'status':
      return json({ ok: true, ...(await status(env.DB, now)) })
    default:
      return fail(`unknown action ${action}`, 404)
  }
}

async function status(db: D1Database, now: number) {
  const [schema, quests, pools, refs, otps, pending, workspaces, catalog, deleted] = await db.batch([
    db.prepare("SELECT value FROM meta WHERE key = 'schema_version'"),
    db.prepare("SELECT COUNT(*) AS n FROM definitions WHERE kind = 'quest' AND deleted_at IS NULL"),
    db.prepare("SELECT COUNT(*) AS n FROM definitions WHERE kind = 'pool'"),
    db.prepare('SELECT COUNT(*) AS n FROM refs'),
    db.prepare('SELECT COUNT(*) AS n FROM otps WHERE used_at IS NULL AND expires_at > ?1').bind(now),
    db.prepare('SELECT COUNT(*) AS n FROM definitions WHERE web_pending = 1'),
    db.prepare('SELECT COUNT(*) AS n FROM workspaces'),
    db.prepare('SELECT COALESCE(MIN(synced_at), 0) AS n FROM catalog'),
    db.prepare('SELECT COUNT(*) AS n FROM definitions WHERE deleted_at IS NOT NULL'),
  ])
  const count = (r: D1Result | undefined) => Number((r?.results?.[0] as { n?: number } | undefined)?.n ?? 0)
  return {
    schema: Number((schema?.results?.[0] as { value?: string } | undefined)?.value ?? 0),
    counts: {
      quests: count(quests), pools: count(pools), refs: count(refs), activeOtps: count(otps), webPending: count(pending), webDeleted: count(deleted),
      workspaces: count(workspaces), catalogSyncedAt: count(catalog),
    },
  }
}

/**
 * The web creator: only for a signed-in person. Locally, PUBLIC_API "true" lets it in without a code; it writes as
 * "local development", and only on localhost.
 */
async function creator(request: Request, env: Env, url: URL, path: string): Promise<Response> {
  const session = await readSession(env.DB, request, Date.now())
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  let writer: Writer
  if (session) writer = { name: session.ownerName, key: session.ownerUuid ?? 'console', dev: false, canDelete: session.canDelete }
  else if (env.PUBLIC_API === 'true' && (local || request.method === 'GET')) writer = { name: 'local development', key: 'dev', dev: true, canDelete: local }
  else return fail('login required', 401)
  return creatorApi(request, env.DB, url, path, writer)
}

/** Who is signed in, as the site sees it. */
function who(owner: SessionOwner | null, dev: boolean) {
  if (owner) {
    return { ownerType: owner.ownerType, ownerUuid: owner.ownerUuid, ownerName: owner.ownerName, expiresAt: owner.expiresAt, dev: false,
      canDelete: owner.canDelete }
  }
  return dev ? { ownerType: 'console', ownerUuid: null, ownerName: 'local development', expiresAt: null, dev: true, canDelete: true } : null
}

/**
 * The website's login:
 *   POST otp     { code } → a session cookie, for a code from /chronos cl otp (once, before it expires)
 *   GET  me      → who is signed in, or 401
 *   POST logout  → ends the session
 */
async function auth(request: Request, env: Env, url: URL, action: string): Promise<Response> {
  const now = Date.now()
  const secure = url.protocol === 'https:'
  switch (action) {
    case 'otp': {
      if (request.method !== 'POST') return fail('use POST', 405)
      const ip = request.headers.get('cf-connecting-ip') ?? 'local'
      const wait = await blockedFor(env.DB, ip, now)
      if (wait > 0) return json({ ok: false, error: 'too many wrong codes; try again later', retryAfter: Math.ceil(wait / 1000) }, 429,
        { 'retry-after': String(Math.ceil(wait / 1000)) })
      const body = parseObject(await request.text())
      const owner = await useOtp(env.DB, typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '', now)
      if (!owner) {
        await recordFailure(env.DB, ip, now)
        return fail('the code is wrong, used or expired', 401)
      }
      const lifetime = Math.max(1, Number(env.SESSION_HOURS) || 12) * 3600_000
      const token = await createSession(env.DB, owner, now, lifetime)
      return json({ ok: true, owner: { ...owner, expiresAt: now + lifetime, dev: false } }, 200,
        { 'set-cookie': sessionCookie(token, lifetime / 1000, secure), ...PRIVATE })
    }
    case 'me': {
      if (request.method !== 'GET') return fail('use GET', 405)
      const owner = who(await readSession(env.DB, request, now), env.PUBLIC_API === 'true')
      return owner ? json({ ok: true, owner }, 200, PRIVATE) : fail('login required', 401)
    }
    case 'logout': {
      if (request.method !== 'POST') return fail('use POST', 405)
      await endSession(env.DB, request)
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, secure), ...PRIVATE })
    }
    default:
      return fail('not found', 404)
  }
}
