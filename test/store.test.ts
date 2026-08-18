import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { reset } from 'cloudflare:test'
import { hashAgentToken } from '../src/server/crypto'
import {
  accountKey,
  createAgentToken,
  deleteOwnerCredentials,
  listAgentTokens,
  putAccountCredential,
  renameAgentToken,
  resolveAgentToken,
  revokeAgentToken,
  rotateAgentToken,
  tokenKey,
  TokenLimitError,
} from '../src/server/store'
import type { AccountCredentialRecord } from '../src/server/types'

beforeEach(async () => {
  await reset()
})

function account(ownerId: string): AccountCredentialRecord {
  const now = Date.now()
  return {
    version: 1,
    ownerId,
    username: 'test-user',
    password: 'test-password',
    session: {
      cookieJar: [{ name: 'token', value: 'session', path: '/', expiresAt: now + 3_600_000, secure: true, httpOnly: true, sameSite: null }],
      sessionObtainedAt: now,
      refreshAt: now + 3_000_000,
      expiresAt: now + 3_600_000,
    },
    lastValidatedAt: now,
  }
}

describe('encrypted Agent token store', () => {
  it('stores no raw token or password and supports list, rotate and revoke', async () => {
    const ownerId = 'owner-test'
    const accountRecord = account(ownerId)
    await putAccountCredential(env, accountRecord)
    const created = await createAgentToken(env, ownerId, '分析 Agent')

    const keys = await env.AGENT_AUTH_KV.list({ prefix: 'agent:' })
    const values = await Promise.all(keys.keys.map(({ name }) => env.AGENT_AUTH_KV.get(name)))
    expect(values.join('\n')).not.toContain(created.token)
    expect(values.join('\n')).not.toContain(accountRecord.password)
    expect(await env.AGENT_AUTH_KV.get(accountKey(ownerId))).not.toBeNull()
    expect(await env.AGENT_AUTH_KV.get(tokenKey(await hashAgentToken(created.token)))).not.toBeNull()

    expect((await resolveAgentToken(env, created.token))?.record.ownerId).toBe(ownerId)
    expect(await listAgentTokens(env, ownerId)).toHaveLength(1)

    const rotated = await rotateAgentToken(env, ownerId, created.metadata.id)
    expect(rotated?.token).not.toBe(created.token)
    expect(await resolveAgentToken(env, created.token)).toBeNull()
    expect(await resolveAgentToken(env, rotated?.token ?? '')).not.toBeNull()

    expect(await revokeAgentToken(env, ownerId, created.metadata.id)).toBe(true)
    expect(await resolveAgentToken(env, rotated?.token ?? '')).toBeNull()
  })

  it('supports naming, enforces ten tokens and deletes the complete owner record set', async () => {
    const ownerId = 'owner-limit'
    await putAccountCredential(env, account(ownerId))
    const created = []
    for (let index = 0; index < 10; index += 1) {
      created.push(await createAgentToken(env, ownerId, `Agent ${index + 1}`))
    }

    await expect(createAgentToken(env, ownerId, 'Agent 11')).rejects.toBeInstanceOf(TokenLimitError)
    const renamed = await renameAgentToken(env, ownerId, created[0].metadata.id, '主 Agent')
    expect(renamed?.name).toBe('主 Agent')
    expect(await listAgentTokens(env, ownerId)).toHaveLength(10)

    await deleteOwnerCredentials(env, ownerId)
    expect(await env.AGENT_AUTH_KV.get(accountKey(ownerId))).toBeNull()
    for (const item of created) {
      await expect(resolveAgentToken(env, item.token)).resolves.toBeNull()
    }
  })
})
