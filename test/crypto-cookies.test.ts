import { describe, expect, it } from 'vitest'
import {
  decodeBase64Url,
  decryptJson,
  encodeBase64Url,
  encryptJson,
  generateAgentToken,
} from '../src/server/crypto'
import {
  buildCookieHeader,
  findTokenCookie,
  mergeSetCookieHeaders,
  parseRequestCookies,
} from '../src/server/cookies'
import { isObject } from '../src/server/types'

const rootKey = encodeBase64Url(new Uint8Array(32).fill(7))

describe('credential crypto', () => {
  it('round-trips authenticated JSON and uses a fresh IV', async () => {
    const value = { username: 'tester', password: 'never-plain' }
    const first = await encryptJson(rootKey, 'test', 'record', 'record:key', value)
    const second = await encryptJson(rootKey, 'test', 'record', 'record:key', value)

    expect(first).not.toBe(second)
    expect(first).not.toContain(value.username)
    expect(first).not.toContain(value.password)
    await expect(decryptJson(rootKey, 'test', 'record', 'record:key', first, isObject)).resolves.toEqual(value)
  })

  it('rejects a different AAD key and a tampered ciphertext', async () => {
    const encrypted = await encryptJson(rootKey, 'test', 'record', 'record:key', { ok: true })
    await expect(decryptJson(rootKey, 'test', 'record', 'other:key', encrypted, isObject)).rejects.toThrow()

    const envelope = JSON.parse(encrypted) as { ciphertext: string }
    const bytes = decodeBase64Url(envelope.ciphertext)
    bytes[0] ^= 1
    envelope.ciphertext = encodeBase64Url(bytes)
    await expect(decryptJson(rootKey, 'test', 'record', 'record:key', JSON.stringify(envelope), isObject)).rejects.toThrow()
  })

  it('rejects a different root key, environment and unknown kid', async () => {
    const encrypted = await encryptJson(rootKey, 'test', 'record', 'record:key', { ok: true })
    const otherRoot = encodeBase64Url(new Uint8Array(32).fill(9))

    await expect(decryptJson(otherRoot, 'test', 'record', 'record:key', encrypted, isObject)).rejects.toThrow()
    await expect(decryptJson(rootKey, 'production', 'record', 'record:key', encrypted, isObject)).rejects.toThrow()

    const envelope = JSON.parse(encrypted) as { kid: string }
    envelope.kid = 'v2'
    await expect(decryptJson(rootKey, 'test', 'record', 'record:key', JSON.stringify(envelope), isObject)).rejects.toThrow()
    await expect(encryptJson('not-a-32-byte-key', 'test', 'record', 'record:key', {})).rejects.toThrow()
  })

  it('generates an opaque 256-bit Agent token', async () => {
    const generated = await generateAgentToken()
    const second = await generateAgentToken()
    expect(generated.token).toMatch(/^kza_v1_[A-Za-z0-9_-]{43}$/)
    expect(generated.hash).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generated.hash).not.toContain(generated.token)
    expect(second.token).not.toBe(generated.token)
  })
})

describe('cookie jar', () => {
  it('merges, selects and deletes cookies without exposing attributes', () => {
    const now = Date.UTC(2026, 7, 17, 0, 0, 0)
    const responseUrl = new URL('https://upstream.test/index.php/passport/login/signIn')
    const created = mergeSetCookieHeaders([], [
      'token=abc; Path=/; HttpOnly; Secure; Max-Age=3600',
      'context=one; Path=/index.php; SameSite=Lax',
    ], responseUrl, now)

    expect(created.changed).toBe(true)
    expect(findTokenCookie(created.cookieJar, now)?.value).toBe('abc')
    expect(buildCookieHeader(created.cookieJar, new URL('https://upstream.test/index.php/report'), now)).toBe('context=one; token=abc')

    const deleted = mergeSetCookieHeaders(created.cookieJar, [
      'token=; Path=/; Max-Age=0',
    ], responseUrl, now + 1000)
    expect(deleted.tokenDeleted).toBe(true)
    expect(findTokenCookie(deleted.cookieJar, now + 1000)).toBeNull()
  })

  it('parses request cookies with values containing equals signs', () => {
    const cookies = parseRequestCookies('token=a=b=c; kzp_mgmt=value')
    expect(cookies.get('token')).toBe('a=b=c')
    expect(cookies.get('kzp_mgmt')).toBe('value')
  })

  it('keeps same-name cookies on different paths and persists expiry cleanup', () => {
    const now = Date.UTC(2026, 7, 17, 0, 0, 0)
    const responseUrl = new URL('https://upstream.test/index.php/orders/save')
    const created = mergeSetCookieHeaders([], [
      'context=root; Path=/; Max-Age=3600',
      'context=orders; Path=/index.php/orders; Max-Age=1',
    ], responseUrl, now)

    expect(created.cookieJar).toHaveLength(2)
    expect(buildCookieHeader(
      created.cookieJar,
      new URL('https://upstream.test/index.php/orders/list'),
      now,
    )).toBe('context=orders; context=root')

    const overwritten = mergeSetCookieHeaders(created.cookieJar, [
      'context=updated; Path=/; Max-Age=3600',
    ], responseUrl, now + 100)
    expect(overwritten.cookieJar).toHaveLength(2)
    expect(overwritten.cookieJar.find((cookie) => cookie.path === '/')?.value).toBe('updated')

    const expired = mergeSetCookieHeaders(overwritten.cookieJar, [], responseUrl, now + 2_000)
    expect(expired.changed).toBe(true)
    expect(expired.cookieJar).toHaveLength(1)
  })
})
