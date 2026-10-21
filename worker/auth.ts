/**
 * Requests from the Chronos plugin are signed: `X-Chronos-Signature` is the lowercase hex HMAC-SHA256 of
 * `${timestamp}.${body}` with the shared secret, and `X-Chronos-Timestamp` (epoch millis) must be recent, so a
 * captured request cannot be replayed later.
 */

const encoder = new TextEncoder()

/** {@return the lowercase hex HMAC-SHA256 of a message} */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return Array.from(signature, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compares two strings in time that does not depend on where they differ. */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type Verdict = { ok: true } | { ok: false; reason: string }

/**
 * Checks a signed request.
 *
 * @param secret    The shared secret (empty: every request is refused).
 * @param timestamp The X-Chronos-Timestamp header.
 * @param signature The X-Chronos-Signature header.
 * @param body      The raw request body.
 * @param now       The Worker's clock, epoch millis.
 * @param maxSkewMs How far apart the two clocks may be.
 */
export async function verify(secret: string | undefined, timestamp: string | null, signature: string | null, body: string,
                             now: number, maxSkewMs: number): Promise<Verdict> {
  if (!secret) return { ok: false, reason: 'the Worker has no CHRONOS_SECRET' }
  if (!timestamp || !signature) return { ok: false, reason: 'unsigned request' }
  const sent = Number(timestamp)
  if (!Number.isFinite(sent)) return { ok: false, reason: 'bad timestamp' }
  if (Math.abs(now - sent) > maxSkewMs) return { ok: false, reason: 'stale request (check both clocks)' }
  const expected = await hmacHex(secret, `${timestamp}.${body}`)
  return constantTimeEquals(expected, signature.trim().toLowerCase()) ? { ok: true } : { ok: false, reason: 'bad signature' }
}
