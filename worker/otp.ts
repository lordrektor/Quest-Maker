import type { OtpCreateRequest } from '../shared/api'
import { HttpError } from './http'

/** Longest validity a code may ask for. */
const MAX_VALIDITY_SECONDS = 15 * 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** {@return the create request, checked} */
export function readOtpCreate(body: Record<string, unknown>): OtpCreateRequest {
  const ownerType = body.ownerType
  if (ownerType !== 'player' && ownerType !== 'console') throw new HttpError(400, 'ownerType must be player or console')
  const ownerUuid = typeof body.ownerUuid === 'string' ? body.ownerUuid : null
  if (ownerType === 'player' && (ownerUuid === null || !UUID.test(ownerUuid))) throw new HttpError(400, 'a player needs ownerUuid')
  const ownerName = typeof body.ownerName === 'string' ? body.ownerName.slice(0, 32) : ''
  if (!ownerName) throw new HttpError(400, 'ownerName is missing')
  const validity = Number(body.validitySeconds)
  const validitySeconds = Number.isFinite(validity) ? Math.min(MAX_VALIDITY_SECONDS, Math.max(30, Math.floor(validity))) : 300
  return { ownerType, ownerUuid: ownerType === 'player' ? ownerUuid : null, ownerName, validitySeconds, canDelete: body.canDelete === true }
}

/** {@return a random 6-digit code, 000000 to 999999} */
export function randomCode(): string {
  // Rejection sampling: 4 294 000 000 is the largest multiple of 1 000 000 below 2^32, so every code is as likely
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    const value = buffer[0]!
    if (value < 4_294_000_000) return String(value % 1_000_000).padStart(6, '0')
  }
}

function ownerKey(request: OtpCreateRequest): string {
  return request.ownerType === 'console' ? 'console' : request.ownerUuid!.toLowerCase()
}

/**
 * Creates a code for an owner: their earlier unused codes stop working, and no two live codes are the same.
 * {@return the code and when it expires}
 */
export async function createOtp(db: D1Database, request: OtpCreateRequest, now: number): Promise<{ code: string; expiresAt: number }> {
  const key = ownerKey(request)
  let code = randomCode()
  for (let tries = 0; tries < 10; tries++) {
    const clash = await db.prepare('SELECT 1 FROM otps WHERE code = ?1 AND used_at IS NULL AND expires_at > ?2 LIMIT 1')
      .bind(code, now).first()
    if (!clash) break
    code = randomCode()
  }
  const expiresAt = now + request.validitySeconds * 1000
  await db.batch([
    // An owner has one live code at a time
    db.prepare('UPDATE otps SET used_at = ?2 WHERE owner_key = ?1 AND used_at IS NULL').bind(key, now),
    // Old rows are dropped as new ones come in
    db.prepare('DELETE FROM otps WHERE expires_at < ?1').bind(now - 24 * 3600 * 1000),
    db.prepare(`INSERT INTO otps (code, owner_key, owner_type, owner_uuid, owner_name, created_at, expires_at, can_delete)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(code, key, request.ownerType, request.ownerUuid, request.ownerName, now, expiresAt, request.canDelete ? 1 : 0),
  ])
  return { code, expiresAt }
}

/** Who a code was made for. */
export interface OtpOwner {
  ownerType: 'player' | 'console'
  ownerUuid: string | null
  ownerName: string
  /** May delete quests on the website. */
  canDelete: boolean
}

/**
 * Uses a code (the web creator's login): it works once, before it expires. {@return its owner, or null}
 */
export async function useOtp(db: D1Database, code: string, now: number): Promise<OtpOwner | null> {
  if (!/^\d{6}$/.test(code)) return null
  // One statement: two logins with the same code cannot both succeed
  const row = await db.prepare(`UPDATE otps SET used_at = ?2 WHERE rowid = (
        SELECT rowid FROM otps WHERE code = ?1 AND used_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC LIMIT 1)
      RETURNING owner_type, owner_uuid, owner_name, can_delete`)
    .bind(code, now).first<{ owner_type: 'player' | 'console'; owner_uuid: string | null; owner_name: string; can_delete: number }>()
  return row ? { ownerType: row.owner_type, ownerUuid: row.owner_uuid, ownerName: row.owner_name, canDelete: row.can_delete === 1 } : null
}
