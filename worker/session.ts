/**
 * Website sessions. A correct code from /chronos cl otp becomes a session: a random token in an HttpOnly cookie, of
 * which D1 keeps only the SHA-256 hash, so a leaked table does not log anyone in.
 */
import type { OtpOwner } from './otp'

export const COOKIE = 'chronos_session'

/** {@return a random session token: 32 bytes, base64url} */
export function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** {@return the lowercase hex SHA-256 of a token} */
export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** {@return a cookie's value from a Cookie header, or null} */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

/**
 * {@return the Set-Cookie header of a session (empty token: one that deletes it)}
 *
 * @param secure Mark it Secure (https; plain http only on a local development server).
 */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${token ? maxAgeSeconds : 0}`, ...(secure ? ['Secure'] : [])]
    .join('; ')
}

/** Who is signed in. */
export interface SessionOwner extends OtpOwner {
  expiresAt: number
}

/** Starts a session for a code's owner. {@return the token for the cookie} */
export async function createSession(db: D1Database, owner: OtpOwner, now: number, lifetimeMs: number): Promise<string> {
  const token = newToken()
  await db.batch([
    // Ended sessions are dropped as new ones start
    db.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
    db.prepare(`INSERT INTO sessions (token_hash, owner_type, owner_uuid, owner_name, created_at, expires_at, can_delete)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
      .bind(await hashToken(token), owner.ownerType, owner.ownerUuid, owner.ownerName, now, now + lifetimeMs, owner.canDelete ? 1 : 0),
  ])
  return token
}

/** {@return who a request's cookie belongs to, or null} */
export async function readSession(db: D1Database, request: Request, now: number): Promise<SessionOwner | null> {
  const token = readCookie(request.headers.get('cookie'), COOKIE)
  if (!token || token.length > 128) return null
  const row = await db.prepare('SELECT owner_type, owner_uuid, owner_name, expires_at, can_delete FROM sessions WHERE token_hash = ?1 AND expires_at > ?2')
    .bind(await hashToken(token), now)
    .first<{ owner_type: 'player' | 'console'; owner_uuid: string | null; owner_name: string; expires_at: number; can_delete: number }>()
  return row ? { ownerType: row.owner_type, ownerUuid: row.owner_uuid, ownerName: row.owner_name, expiresAt: row.expires_at,
    canDelete: row.can_delete === 1 } : null
}

/** Ends a request's session. */
export async function endSession(db: D1Database, request: Request): Promise<void> {
  const token = readCookie(request.headers.get('cookie'), COOKIE)
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await hashToken(token)).run()
}
