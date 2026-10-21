import { describe, expect, it } from 'vitest'
import { counted, MAX_PER_IP, WINDOW_MS } from '../worker/limits'
import { COOKIE, hashToken, newToken, readCookie, sessionCookie } from '../worker/session'
import { isCode, safeNext } from '../src/auth'

describe('sessions', () => {
  it('tokens are long, random and url-safe', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const token = newToken()
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      seen.add(token)
    }
    expect(seen.size).toBe(200)
  })

  it('only a hash of the token is stored', async () => {
    const hash = await hashToken('abc')
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await hashToken('abc')).toBe(hash)
  })

  it('reads its cookie among others', () => {
    expect(readCookie(`theme=dark; ${COOKIE}=tok-1; other=x`, COOKIE)).toBe('tok-1')
    expect(readCookie('theme=dark', COOKIE)).toBeNull()
    expect(readCookie(null, COOKIE)).toBeNull()
    expect(readCookie(`${COOKIE}x=nope`, COOKIE)).toBeNull()
  })

  it('the cookie is HttpOnly and SameSite=Strict, Secure on https, and deletable', () => {
    const cookie = sessionCookie('tok', 3600, true)
    expect(cookie).toContain(`${COOKIE}=tok`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Max-Age=3600')
    expect(cookie).toContain('Secure')
    expect(sessionCookie('tok', 3600, false)).not.toContain('Secure')
    expect(sessionCookie('', 3600, true)).toContain('Max-Age=0')
  })
})

describe('wrong codes', () => {
  it('count only within their window', () => {
    expect(counted(null, 1000)).toBe(0)
    expect(counted({ window_start: 1000, failures: MAX_PER_IP }, 1000 + WINDOW_MS - 1)).toBe(MAX_PER_IP)
    expect(counted({ window_start: 1000, failures: MAX_PER_IP }, 1000 + WINDOW_MS)).toBe(0)
  })
})

describe('the code page', () => {
  it('takes six digits, spaces allowed', () => {
    expect(isCode('123456')).toBe(true)
    expect(isCode('123 456')).toBe(true)
    expect(isCode('12345')).toBe(false)
    expect(isCode('12345a')).toBe(false)
  })

  it('only goes on to pages of this site', () => {
    expect(safeNext('/create/hydras')).toBe('/create/hydras')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/\\evil.example')).toBe('/')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('/login')).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(undefined, '/create')).toBe('/create')
    expect(safeNext('//evil.example', '/create')).toBe('/create')
  })
})
