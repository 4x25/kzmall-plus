import { describe, expect, it } from 'vitest'
import expiredSessionFixture from './fixtures/upstream-expired-session.json'
import {
  createUpstreamSession,
  inspectResponsePrefix,
  isUpstreamAuthFailure,
} from '../src/server/upstream'

const baseUrl = 'https://upstream.test/index.php'

describe('upstream authentication failure classifier', () => {
  it('recognizes status, redirect, JSON and login HTML signals', async () => {
    await expect(isUpstreamAuthFailure(new Response('no', { status: 401 }), baseUrl, false)).resolves.toBe(true)
    await expect(isUpstreamAuthFailure(new Response(null, {
      status: 302,
      headers: { location: '/index.php/passport/login/index' },
    }), baseUrl, false)).resolves.toBe(true)
    await expect(isUpstreamAuthFailure(Response.json({ success: false, redirect: '/index.php/passport/login/index' }), baseUrl, false)).resolves.toBe(true)
    await expect(isUpstreamAuthFailure(new Response('<form action="/index.php/passport/login/signIn"></form>', {
      headers: { 'content-type': 'text/html' },
    }), baseUrl, false)).resolves.toBe(true)
    await expect(isUpstreamAuthFailure(Response.json({ success: false, status: '403' }, {
      status: 403,
    }), baseUrl, false)).resolves.toBe(true)
    await expect(isUpstreamAuthFailure(Response.json({ success: true }), baseUrl, true)).resolves.toBe(true)
    await expect(isUpstreamAuthFailure(new Response(expiredSessionFixture.body, {
      status: expiredSessionFixture.status,
      headers: expiredSessionFixture.headers,
    }), baseUrl, false)).resolves.toBe(true)
  })

  it('does not treat ordinary business failures as expired sessions', async () => {
    await expect(isUpstreamAuthFailure(Response.json({ success: false, msg: '库存不足' }), baseUrl, false)).resolves.toBe(false)
    await expect(isUpstreamAuthFailure(new Response('forbidden', { status: 403 }), baseUrl, false)).resolves.toBe(false)
    await expect(isUpstreamAuthFailure(new Response(
      "<script>window.location.href='/index.php/report/summary';</script>",
    ), baseUrl, false)).resolves.toBe(false)
    await expect(isUpstreamAuthFailure(new Response(null, {
      status: 302,
      headers: { location: 'https://partner.test/passport/login' },
    }), baseUrl, false)).resolves.toBe(false)
    await expect(isUpstreamAuthFailure(new Response('{}', {
      status: 200,
      headers: { location: '/index.php/passport/login/index' },
    }), baseUrl, false)).resolves.toBe(false)
  })

  it('replays a large inspected prefix without cloning or changing bytes', async () => {
    const first = new Uint8Array(70 * 1024).fill(65)
    const second = new Uint8Array(32 * 1024).fill(66)
    let index = 0
    const chunks = [first, second]
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index]
        index += 1
        if (chunk) controller.enqueue(chunk)
        else controller.close()
      },
    })
    const inspected = await inspectResponsePrefix(new Response(source), 64 * 1024)

    expect(inspected.complete).toBe(false)
    expect(inspected.bytes).toHaveLength(64 * 1024)
    const replayed = new Uint8Array(await inspected.response.arrayBuffer())
    expect(replayed).toHaveLength(first.byteLength + second.byteLength)
    expect(replayed.slice(0, first.byteLength)).toEqual(first)
    expect(replayed.slice(first.byteLength)).toEqual(second)
  })

  it('derives proactive refresh from token expiry with a five-minute skew', () => {
    const now = Date.UTC(2026, 7, 17, 0, 0, 0)
    const session = createUpstreamSession([{
      name: 'token',
      value: 'session',
      path: '/',
      expiresAt: now + 60 * 60 * 1000,
      secure: true,
      httpOnly: true,
      sameSite: null,
    }], now)

    expect(session.expiresAt).toBe(now + 60 * 60 * 1000)
    expect(session.refreshAt).toBe(now + 55 * 60 * 1000)
  })
})
