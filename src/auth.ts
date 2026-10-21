/**
 * Who is signed in. The creator needs a code from /chronos cl otp (the showcase does not); the Worker keeps the
 * session in an HttpOnly cookie, so this only knows the answer of /api/auth/me.
 */
import { reactive, readonly } from 'vue'

export interface Signed {
  ownerType: 'player' | 'console'
  ownerUuid: string | null
  ownerName: string
  expiresAt: number | null
  /** Signed in by PUBLIC_API on a local development server, not by a code. */
  dev: boolean
  /** May delete quests (the code was made for a player with chronos.cloudflare.delete). */
  canDelete?: boolean
}

export type LoginFailure = { kind: 'wrong' } | { kind: 'limited'; retryAfter: number } | { kind: 'offline' } | { kind: 'error'; message: string }

const state = reactive({
  /** unknown until the first check */
  status: 'unknown' as 'unknown' | 'in' | 'out',
  owner: null as Signed | null,
})

export const auth = readonly(state)

let checking: Promise<void> | null = null

/** Asks the Worker who is signed in (once; later calls wait for the same answer). */
export function ensureChecked(): Promise<void> {
  if (state.status !== 'unknown') return Promise.resolve()
  checking ??= fetch('/api/auth/me', { headers: { accept: 'application/json' } })
    .then(async (response) => {
      const body = response.ok ? ((await response.json()) as { owner?: Signed }) : null
      if (body?.owner) signedIn(body.owner)
      else signedOut()
    })
    .catch(() => signedOut())
    .finally(() => {
      checking = null
    })
  return checking
}

function signedIn(owner: Signed) {
  state.owner = owner
  state.status = 'in'
}

/** Forgets the session (the Worker said 401, or after logging out). */
export function signedOut() {
  state.owner = null
  state.status = 'out'
}

/** Sends a code. {@return null when signed in, else why not} */
export async function login(code: string): Promise<LoginFailure | null> {
  let response: Response
  try {
    response = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ code }),
    })
  } catch {
    return { kind: 'offline' }
  }
  const body = (await response.json().catch(() => null)) as { owner?: Signed; error?: string; retryAfter?: number } | null
  if (response.ok && body?.owner) {
    signedIn(body.owner)
    return null
  }
  if (response.status === 401) return { kind: 'wrong' }
  if (response.status === 429) return { kind: 'limited', retryAfter: body?.retryAfter ?? 600 }
  return { kind: 'error', message: body?.error ?? `HTTP ${response.status}` }
}

/** Ends the session. */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } finally {
    signedOut()
  }
}

/** {@return where to go after signing in: a path on this site (never another site), else `fallback`} */
export function safeNext(next: unknown, fallback = '/'): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') && !next.startsWith('/login') ? next : fallback
}

/** {@return true for exactly six digits, spaces ignored} */
export function isCode(text: string): boolean {
  return /^\d{6}$/.test(text.replace(/\s+/g, ''))
}
