import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { deriveOwnerId, sealCompactJson } from '../src/server/crypto'
import {
  clearManagementCookie,
  createManagementCookie,
  readManagementSession,
} from '../src/server/management-session'
import { MANAGEMENT_COOKIE_NAME, type ManagementSession } from '../src/server/types'

function cookieValue(setCookie: string): string {
  return setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'))
}

function requestWithSession(value: string, token = 'browser-session'): Request {
  return new Request('https://app.test/api/agent-credentials', {
    headers: { cookie: `token=${token}; ${MANAGEMENT_COOKIE_NAME}=${value}` },
  })
}

describe('management session cookie', () => {
  it('is encrypted, secure, authenticated and case-sensitive by account', async () => {
    const created = await createManagementCookie(env, '  TestUser  ', Date.now() + 60_000)
    const lowerCase = await createManagementCookie(env, 'testuser', Date.now() + 60_000)

    expect(created.header).toContain('HttpOnly')
    expect(created.header).toContain('Secure')
    expect(created.header).toContain('SameSite=Strict')
    expect(created.header).not.toContain('TestUser')
    expect(created.ownerId).not.toBe(lowerCase.ownerId)

    const value = cookieValue(created.header)
    await expect(readManagementSession(env, requestWithSession(value))).resolves.toMatchObject({
      ownerId: created.ownerId,
      username: 'TestUser',
    })

    const replacement = value.endsWith('A') ? 'B' : 'A'
    const tampered = `${value.slice(0, -1)}${replacement}`
    await expect(readManagementSession(env, requestWithSession(tampered))).resolves.toBeNull()
  })

  it('rejects expired sessions and requires the browser login cookie', async () => {
    const username = 'expired-user'
    const ownerId = await deriveOwnerId(
      env.AGENT_CREDENTIAL_ROOT_KEY_V1,
      env.APP_ENV,
      username,
    )
    const now = Date.now()
    const expired: ManagementSession = {
      version: 1,
      ownerId,
      username,
      issuedAt: now - 2_000,
      expiresAt: now - 1_000,
    }
    const value = await sealCompactJson(
      env.MANAGEMENT_SESSION_ROOT_KEY_V1,
      env.APP_ENV,
      'management-session',
      MANAGEMENT_COOKIE_NAME,
      expired,
    )

    await expect(readManagementSession(env, requestWithSession(value))).resolves.toBeNull()
    await expect(readManagementSession(env, new Request('https://app.test', {
      headers: { cookie: `${MANAGEMENT_COOKIE_NAME}=${value}` },
    }))).resolves.toBeNull()
  })

  it('clears the management session without touching Agent credentials', () => {
    const cleared = clearManagementCookie()
    expect(cleared).toContain(`${MANAGEMENT_COOKIE_NAME}=`)
    expect(cleared).toContain('Max-Age=0')
    expect(cleared).toContain('Secure')
  })
})
