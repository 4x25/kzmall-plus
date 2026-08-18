import { createExecutionContext, env, reset, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { createManagementCookie } from '../src/server/management-session'
import {
  createAgentToken,
  getAccountCredential,
  putAccountCredential,
  resolveAgentToken,
} from '../src/server/store'
import type { AccountCredentialRecord } from '../src/server/types'

const APP_ORIGIN = 'https://app.test'

beforeEach(async () => {
  await reset()
})

async function dispatch(request: Request): Promise<Response> {
  const ctx = createExecutionContext()
  const response = await app.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

function account(ownerId: string, username: string): AccountCredentialRecord {
  const now = Date.now()
  return {
    version: 1,
    ownerId,
    username,
    password: `password-${username}`,
    session: {
      cookieJar: [{
        name: 'token',
        value: `session-${username}`,
        path: '/',
        expiresAt: now + 3_600_000,
        secure: true,
        httpOnly: true,
        sameSite: null,
      }],
      sessionObtainedAt: now,
      refreshAt: now + 3_000_000,
      expiresAt: now + 3_600_000,
    },
    lastValidatedAt: now,
  }
}

function browserCookie(setCookie: string): string {
  return `token=browser-session; ${setCookie.split(';')[0]}`
}

function jsonRequest(path: string, cookie: string, method: string, body: object): Request {
  return new Request(`${APP_ORIGIN}${path}`, {
    method,
    headers: {
      cookie,
      origin: APP_ORIGIN,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('Agent credential management API', () => {
  it('requires a same-origin JSON mutation request', async () => {
    const management = await createManagementCookie(env, 'owner-a', Date.now() + 3_600_000)
    const cookie = browserCookie(management.header)
    await putAccountCredential(env, account(management.ownerId, 'owner-a'))

    const noOrigin = await dispatch(new Request(`${APP_ORIGIN}/api/agent-credentials`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Agent' }),
    }))
    expect(noOrigin.status).toBe(403)

    const wrongType = await dispatch(new Request(`${APP_ORIGIN}/api/agent-credentials`, {
      method: 'POST',
      headers: { cookie, origin: APP_ORIGIN, 'content-type': 'text/plain' },
      body: JSON.stringify({ name: 'Agent' }),
    }))
    expect(wrongType.status).toBe(415)
  })

  it('isolates accounts and supports rename, rotate, revoke and complete deletion', async () => {
    const managementA = await createManagementCookie(env, 'owner-a', Date.now() + 3_600_000)
    const managementB = await createManagementCookie(env, 'owner-b', Date.now() + 3_600_000)
    const cookieA = browserCookie(managementA.header)
    await putAccountCredential(env, account(managementA.ownerId, 'owner-a'))
    await putAccountCredential(env, account(managementB.ownerId, 'owner-b'))
    const tokenA = await createAgentToken(env, managementA.ownerId, 'A Agent')
    const tokenB = await createAgentToken(env, managementB.ownerId, 'B Agent')

    const initialList = await dispatch(new Request(`${APP_ORIGIN}/api/agent-credentials`, {
      headers: { cookie: cookieA },
    }))
    const initialSnapshot = await initialList.json<{ tokens: Array<{ id: string; name: string }> }>()
    expect(initialSnapshot.tokens).toEqual([expect.objectContaining({ id: tokenA.metadata.id })])
    expect(JSON.stringify(initialSnapshot)).not.toContain(tokenA.token)
    expect(JSON.stringify(initialSnapshot)).not.toContain(tokenB.token)

    const renamed = await dispatch(jsonRequest(
      `/api/agent-credentials/${tokenA.metadata.id}`,
      cookieA,
      'PATCH',
      { name: 'A Agent renamed' },
    ))
    expect(renamed.status).toBe(200)

    const rotated = await dispatch(jsonRequest(
      `/api/agent-credentials/${tokenA.metadata.id}/rotate`,
      cookieA,
      'POST',
      {},
    ))
    const rotatedBody = await rotated.json<{ token: string; metadata: { name: string } }>()
    expect(rotatedBody.metadata.name).toBe('A Agent renamed')
    expect(rotatedBody.token).toMatch(/^kza_v1_/)
    await expect(resolveAgentToken(env, tokenA.token)).resolves.toBeNull()
    await expect(resolveAgentToken(env, rotatedBody.token)).resolves.not.toBeNull()

    const afterRotate = await dispatch(new Request(`${APP_ORIGIN}/api/agent-credentials`, {
      headers: { cookie: cookieA },
    }))
    expect(await afterRotate.text()).not.toContain(rotatedBody.token)

    const revoked = await dispatch(jsonRequest(
      `/api/agent-credentials/${tokenA.metadata.id}`,
      cookieA,
      'DELETE',
      {},
    ))
    expect(revoked.status).toBe(204)
    await expect(resolveAgentToken(env, rotatedBody.token)).resolves.toBeNull()

    const created = await dispatch(jsonRequest('/api/agent-credentials', cookieA, 'POST', {
      name: 'A replacement',
    }))
    const createdBody = await created.json<{ token: string }>()
    expect(created.status).toBe(201)

    const deleted = await dispatch(jsonRequest('/api/agent-credentials/account', cookieA, 'DELETE', {}))
    expect(deleted.status).toBe(204)
    await expect(getAccountCredential(env, managementA.ownerId)).resolves.toBeNull()
    await expect(resolveAgentToken(env, createdBody.token)).resolves.toBeNull()
    await expect(getAccountCredential(env, managementB.ownerId)).resolves.not.toBeNull()
    await expect(resolveAgentToken(env, tokenB.token)).resolves.not.toBeNull()
  })
})
