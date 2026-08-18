import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExecutionContext, reset, waitOnExecutionContext } from 'cloudflare:test'
import app from '../src/index'
import { handleAgentProxy } from '../src/server/proxy'
import {
  accountKey,
  createAgentToken,
  getAccountCredential,
  putAccountCredential,
} from '../src/server/store'
import type { AccountCredentialRecord } from '../src/server/types'

const APP_ORIGIN = 'http://app.test'
const UPSTREAM_ORIGIN = 'https://upstream.test'

beforeEach(async () => {
  await reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function dispatch(request: Request): Promise<Response> {
  const ctx = createExecutionContext()
  const response = await app.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

function upstreamLoginResponse(token = 'fresh-session'): Response {
  const headers = new Headers({ 'content-type': 'application/json' })
  headers.append('set-cookie', `token=${token}; Path=/; HttpOnly; Secure; Max-Age=3600; Domain=upstream.test`)
  return new Response(JSON.stringify({ success: true, msg: '' }), { status: 200, headers })
}

function validAccount(ownerId: string): AccountCredentialRecord {
  const now = Date.now()
  return {
    version: 1,
    ownerId,
    username: 'test-user',
    password: 'test-password',
    session: {
      cookieJar: [{ name: 'token', value: 'cached-session', path: '/', expiresAt: now + 3_600_000, secure: true, httpOnly: true, sameSite: null }],
      sessionObtainedAt: now,
      refreshAt: now + 3_000_000,
      expiresAt: now + 3_600_000,
    },
    lastValidatedAt: now,
  }
}

describe('browser management and Agent proxy', () => {
  it('creates a one-time token and keeps it active after browser logout', async () => {
    const forwardedHeaders: Headers[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/passport/login/signIn')) return upstreamLoginResponse('browser-session')
      if (url.pathname.endsWith('/passport/login/signOut')) return Response.json({ success: true })
      forwardedHeaders.push(new Headers(init?.headers))
      return Response.json({ success: true, data: { rows: [] } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const loginBody = new URLSearchParams({ username: 'test-user', userpwd: 'test-password', token: '', ispwd: '0' })
    const login = await dispatch(new Request(`${APP_ORIGIN}/api/passport/login/signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: loginBody,
    }))
    expect(login.status).toBe(200)
    const setCookies = login.headers.getSetCookie()
    const managementCookie = setCookies.find((cookie) => cookie.startsWith('kzp_mgmt='))
    expect(managementCookie).toBeDefined()
    expect(managementCookie).not.toContain('test-user')
    expect(setCookies.find((cookie) => cookie.startsWith('token='))).not.toContain('Domain=')

    const cookieHeader = `token=browser-session; ${managementCookie?.split(';')[0]}`
    const accountUpdate = await dispatch(new Request(`${APP_ORIGIN}/api/agent-credentials/account`, {
      method: 'PUT',
      headers: { cookie: cookieHeader, origin: APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test-password' }),
    }))
    expect(accountUpdate.status).toBe(200)

    const create = await dispatch(new Request(`${APP_ORIGIN}/api/agent-credentials`, {
      method: 'POST',
      headers: { cookie: cookieHeader, origin: APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '测试 Agent' }),
    }))
    expect(create.status).toBe(201)
    const created = await create.json<{ token: string; metadata: { id: string } }>()
    expect(created.token).toMatch(/^kza_v1_/)

    const list = await dispatch(new Request(`${APP_ORIGIN}/api/agent-credentials`, {
      headers: { cookie: cookieHeader },
    }))
    const listed = await list.json<{ tokens: Array<Record<string, unknown>> }>()
    expect(listed.tokens).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(created.token)

    const logout = await dispatch(new Request(`${APP_ORIGIN}/api/passport/login/signOut`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    }))
    expect(logout.headers.getSetCookie().some((cookie) => cookie.startsWith('kzp_mgmt=') && cookie.includes('Max-Age=0'))).toBe(true)

    const agent = await dispatch(new Request(`${APP_ORIGIN}/agent-api/report/invBalance?action=detail`, {
      headers: { 'x-credential': created.token, cookie: 'attacker=1', authorization: 'Bearer attacker' },
    }))
    expect(agent.status).toBe(200)
    expect(agent.headers.getSetCookie()).toEqual([])
    const businessHeaders = forwardedHeaders.at(-1)
    expect(businessHeaders?.get('cookie')).toContain('token=browser-session')
    expect(businessHeaders?.get('x-credential')).toBeNull()
    expect(businessHeaders?.get('authorization')).toBeNull()
    expect(businessHeaders?.get('sun')).toBe('5516')
  })

  it('clears a stale management session when a successful login cannot issue a replacement', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true })))

    const loginBody = new URLSearchParams({
      username: 'different-user',
      userpwd: 'test-password',
      token: '',
      ispwd: '0',
    })
    const login = await dispatch(new Request(`${APP_ORIGIN}/api/passport/login/signIn`, {
      method: 'POST',
      headers: {
        cookie: 'token=previous-session; kzp_mgmt=previous-management-session',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: loginBody,
    }))

    expect(login.status).toBe(200)
    expect(login.headers.getSetCookie()).toContainEqual(expect.stringMatching(
      /^kzp_mgmt=;.*Max-Age=0/,
    ))
  })

  it('re-authenticates and replays the exact write body once after a 401', async () => {
    const ownerId = 'owner-replay'
    await putAccountCredential(env, validAccount(ownerId))
    const created = await createAgentToken(env, ownerId, '写请求 Agent')
    const calls: Array<{ path: string; method: string; body: string; headers: Headers }> = []
    let businessAttempts = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input))
      const body = init?.body instanceof ArrayBuffer ? new TextDecoder().decode(init.body) : String(init?.body ?? '')
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body, headers: new Headers(init?.headers) })
      if (url.pathname.endsWith('/passport/login/signIn')) return upstreamLoginResponse('renewed-session')
      businessAttempts += 1
      if (businessAttempts === 1) return Response.json({ success: false, status: 401 }, { status: 401 })
      return Response.json({ success: true, received: body })
    })
    vi.stubGlobal('fetch', fetchMock)

    const originalBody = 'billNo=ABC&action=save'
    const response = await dispatch(new Request(`${APP_ORIGIN}/agent-api/scm/example/save?mode=full`, {
      method: 'POST',
      headers: {
        'x-credential': created.token,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: originalBody,
    }))

    expect(response.status).toBe(200)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({ method: 'POST', body: originalBody })
    expect(calls[1].path).toMatch(/\/passport\/login\/signIn$/)
    expect(calls[2]).toMatchObject({ method: 'POST', body: originalBody })
    expect(calls[2].headers.get('cookie')).toContain('token=renewed-session')
  })

  it('re-authenticates and replays an exact GET query once after a login redirect', async () => {
    const ownerId = 'owner-get-replay'
    await putAccountCredential(env, validAccount(ownerId))
    const created = await createAgentToken(env, ownerId, 'GET 重放 Agent')
    const businessCalls: Array<{ url: string; method: string; headers: Headers }> = []
    let loginAttempts = 0

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/passport/login/signIn')) {
        loginAttempts += 1
        return upstreamLoginResponse('renewed-get-session')
      }
      businessCalls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
      })
      if (businessCalls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: '/index.php/passport/login/index' },
        })
      }
      return Response.json({ success: true })
    }))

    const response = await dispatch(new Request(
      `${APP_ORIGIN}/agent-api/report/list?a=1&a=2&encoded=%2Fvalue`,
      {
        headers: {
          'x-credential': created.token,
          accept: 'application/json',
          'x-business-header': 'preserved',
        },
      },
    ))

    expect(response.status).toBe(200)
    expect(loginAttempts).toBe(1)
    expect(businessCalls).toHaveLength(2)
    expect(businessCalls.map(({ method }) => method)).toEqual(['GET', 'GET'])
    expect(businessCalls[0].url).toBe(businessCalls[1].url)
    expect(new URL(businessCalls[0].url).search).toBe('?a=1&a=2&encoded=%2Fvalue')
    expect(businessCalls[0].headers.get('x-business-header')).toBe('preserved')
    expect(businessCalls[1].headers.get('x-business-header')).toBe('preserved')
    expect(businessCalls[1].headers.get('cookie')).toContain('token=renewed-get-session')
  })

  it('rejects auth endpoints, cross-origin-shaped paths, traversal encodings and forbidden methods', async () => {
    const ownerId = 'owner-paths'
    await putAccountCredential(env, validAccount(ownerId))
    const created = await createAgentToken(env, ownerId, '路径测试')
    const fetchMock = vi.fn(async () => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    const paths = [
      '/agent-api/passport/login/signIn',
      '/agent-api/passport//login/signOut',
      '/agent-api/https://evil.test/resource',
      '/agent-api/%252e%252e/secret',
      '/agent-api/%ZZ/secret',
      '/agent-api/report/%00hidden',
    ]
    for (const path of paths) {
      const response = await dispatch(new Request(`${APP_ORIGIN}${path}`, {
        headers: { 'x-credential': created.token },
      }))
      expect([400, 403]).toContain(response.status)
    }
    expect(fetchMock).not.toHaveBeenCalled()

    await expect(handleAgentProxy({ method: 'TRACE' } as Request, env, 'trace-id')).rejects.toMatchObject({ status: 405 })
    await expect(handleAgentProxy({ method: 'CONNECT' } as Request, env, 'connect-id')).rejects.toMatchObject({ status: 405 })
  })

  it('strips dangerous headers, preserves query order and does not retry an ordinary business failure', async () => {
    const ownerId = 'owner-headers'
    await putAccountCredential(env, validAccount(ownerId))
    const created = await createAgentToken(env, ownerId, '请求头测试')
    let forwardedUrl = ''
    let forwardedHeaders = new Headers()
    const responseHeaders = new Headers({
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
    responseHeaders.append('set-cookie', 'context=updated; Path=/; Max-Age=3600')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      forwardedUrl = String(input)
      forwardedHeaders = new Headers(init?.headers)
      return new Response(JSON.stringify({ success: false, msg: '库存不足' }), {
        status: 200,
        headers: responseHeaders,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await dispatch(new Request(
      `${APP_ORIGIN}/agent-api/report/list?a=1&a=2&encoded=%2Fvalue`,
      {
        headers: {
          'x-credential': created.token,
          cookie: 'attacker=1',
          authorization: 'Bearer attacker',
          origin: 'https://evil.test',
          referer: 'https://evil.test/page',
          forwarded: 'for=attacker',
          'x-forwarded-for': '203.0.113.1',
          'x-http-method-override': 'DELETE',
          'x-real-ip': '203.0.113.2',
          'cf-connecting-ip': '203.0.113.3',
          'x-business-header': 'kept',
        },
      },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: false, msg: '库存不足' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(forwardedUrl).search).toBe('?a=1&a=2&encoded=%2Fvalue')
    expect(forwardedHeaders.get('cookie')).toContain('token=cached-session')
    for (const blocked of [
      'authorization',
      'origin',
      'referer',
      'forwarded',
      'x-forwarded-for',
      'x-http-method-override',
      'x-real-ip',
      'cf-connecting-ip',
      'x-credential',
    ]) {
      expect(forwardedHeaders.get(blocked)).toBeNull()
    }
    expect(forwardedHeaders.get('x-business-header')).toBe('kept')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect((await getAccountCredential(env, ownerId))?.session.cookieJar).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'context', value: 'updated' }),
    ]))
  })

  it('proactively logs in when a session is missing or near expiry', async () => {
    const ownerId = 'owner-proactive'
    const account = validAccount(ownerId)
    account.session.refreshAt = Date.now() - 1
    await putAccountCredential(env, account)
    const created = await createAgentToken(env, ownerId, '主动刷新')
    const paths: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      if (url.pathname.endsWith('/passport/login/signIn')) return upstreamLoginResponse('proactive-session')
      return Response.json({ success: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await dispatch(new Request(`${APP_ORIGIN}/agent-api/report/list`, {
      headers: { 'x-credential': created.token },
    }))
    expect(response.status).toBe(200)
    expect(paths).toHaveLength(2)
    expect(paths[0]).toMatch(/\/passport\/login\/signIn$/)
  })

  it('proactively logs in when the stored Cookie jar has no token', async () => {
    const ownerId = 'owner-missing-cookie'
    const account = validAccount(ownerId)
    account.session.cookieJar = []
    account.session.refreshAt = Date.now() + 3_000_000
    account.session.expiresAt = Date.now() + 3_600_000
    await putAccountCredential(env, account)
    const created = await createAgentToken(env, ownerId, '缺失 Cookie')
    const paths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      if (url.pathname.endsWith('/passport/login/signIn')) return upstreamLoginResponse('replacement-session')
      return Response.json({ success: true })
    }))

    const response = await dispatch(new Request(`${APP_ORIGIN}/agent-api/report/list`, {
      headers: { 'x-credential': created.token },
    }))

    expect(response.status).toBe(200)
    expect(paths).toHaveLength(2)
    expect(paths[0]).toMatch(/\/passport\/login\/signIn$/)
  })

  it('never loops when the replay is also rejected', async () => {
    const ownerId = 'owner-second-failure'
    await putAccountCredential(env, validAccount(ownerId))
    const created = await createAgentToken(env, ownerId, '单次重试')
    let businessAttempts = 0
    let loginAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/passport/login/signIn')) {
        loginAttempts += 1
        return upstreamLoginResponse('retried-session')
      }
      businessAttempts += 1
      return Response.json({ success: false }, { status: 401 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await dispatch(new Request(`${APP_ORIGIN}/agent-api/scm/save`, {
      method: 'POST',
      headers: { 'x-credential': created.token, 'content-type': 'application/json' },
      body: '{}',
    }))
    expect(response.status).toBe(502)
    expect((await response.json<{ error: { code: string } }>()).error.code).toBe('UPSTREAM_AUTH_FAILED')
    expect(businessAttempts).toBe(2)
    expect(loginAttempts).toBe(1)
  })

  it('enforces the 4 MiB replay buffer before contacting upstream', async () => {
    const ownerId = 'owner-body-limit'
    await putAccountCredential(env, validAccount(ownerId))
    const created = await createAgentToken(env, ownerId, '请求体限制')
    const fetchMock = vi.fn(async () => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await dispatch(new Request(`${APP_ORIGIN}/agent-api/upload`, {
      method: 'POST',
      headers: { 'x-credential': created.token },
      body: new Uint8Array(4 * 1024 * 1024 + 1),
    }))
    expect(response.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cools down failed logins and sanitizes their response', async () => {
    const ownerId = 'owner-cooldown'
    const account = validAccount(ownerId)
    account.session.cookieJar = []
    account.session.refreshAt = 0
    account.session.expiresAt = 0
    await putAccountCredential(env, account)
    const created = await createAgentToken(env, ownerId, '冷却测试')
    const fetchMock = vi.fn(async () => Response.json({
      success: false,
      msg: 'sensitive upstream detail',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await dispatch(new Request(`${APP_ORIGIN}/agent-api/report/list`, {
      headers: { 'x-credential': created.token },
    }))
    const firstText = await first.text()
    expect(first.status).toBe(502)
    expect(firstText).not.toContain('sensitive upstream detail')

    const second = await dispatch(new Request(`${APP_ORIGIN}/agent-api/report/list`, {
      headers: { 'x-credential': created.token },
    }))
    expect(second.status).toBe(503)
    expect(second.headers.get('retry-after')).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent proactive logins inside one Worker isolate', async () => {
    const ownerId = 'owner-concurrent'
    const account = validAccount(ownerId)
    account.session.refreshAt = 0
    await putAccountCredential(env, account)
    const created = await createAgentToken(env, ownerId, '并发刷新')
    let loginAttempts = 0
    let businessAttempts = 0
    let releaseLogin!: () => void
    let markLoginStarted!: () => void
    const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve })
    const loginStarted = new Promise<void>((resolve) => { markLoginStarted = resolve })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/passport/login/signIn')) {
        loginAttempts += 1
        markLoginStarted()
        await loginGate
        return upstreamLoginResponse('shared-session')
      }
      businessAttempts += 1
      return Response.json({ success: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = dispatch(new Request(`${APP_ORIGIN}/agent-api/report/one`, {
      headers: { 'x-credential': created.token },
    }))
    await loginStarted
    const second = dispatch(new Request(`${APP_ORIGIN}/agent-api/report/two`, {
      headers: { 'x-credential': created.token },
    }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    releaseLogin()

    const responses = await Promise.all([first, second])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(loginAttempts).toBe(1)
    expect(businessAttempts).toBe(2)
    await Promise.all(responses.map((response) => response.body?.cancel()))
  })

  it('returns sanitized errors for invalid tokens and corrupted encrypted KV records', async () => {
    const invalid = await dispatch(new Request(`${APP_ORIGIN}/agent-api/report/list`, {
      headers: { 'x-credential': 'not-a-token' },
    }))
    expect(invalid.status).toBe(401)
    expect((await invalid.json<{ error: { code: string } }>()).error.code).toBe('INVALID_AGENT_CREDENTIAL')

    const ownerId = 'owner-corrupt'
    await putAccountCredential(env, validAccount(ownerId))
    const created = await createAgentToken(env, ownerId, '损坏记录')
    await env.AGENT_AUTH_KV.put(accountKey(ownerId), '{"plaintext":"must-not-leak"}')
    const corrupted = await dispatch(new Request(`${APP_ORIGIN}/agent-api/report/list`, {
      headers: { 'x-credential': created.token },
    }))
    const corruptedText = await corrupted.text()
    expect(corrupted.status).toBe(503)
    expect(corruptedText).toContain('CREDENTIAL_STORE_UNAVAILABLE')
    expect(corruptedText).not.toContain('plaintext')
    expect(corruptedText).not.toContain(ownerId)
  })
})
