import { findTokenCookie, getSetCookieHeaders, mergeSetCookieHeaders } from './cookies'
import {
  MAX_INSPECTION_BYTES,
  SESSION_FALLBACK_TTL_MS,
  SESSION_REFRESH_SKEW_MS,
  type StoredCookie,
  type UpstreamSession,
  isObject,
} from './types'

type UpstreamEnv = Pick<CloudflareBindings, 'KZ_API_BASE'>

export class UpstreamLoginError extends Error {
  constructor() {
    super('Upstream login failed')
    this.name = 'UpstreamLoginError'
  }
}

export class UpstreamUnavailableError extends Error {
  constructor() {
    super('Upstream service is unavailable')
    this.name = 'UpstreamUnavailableError'
  }
}

export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large')
    this.name = 'BodyTooLargeError'
  }
}

function concatChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function readStreamBounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      length += value.byteLength
      if (length > limit) {
        try {
          await reader.cancel()
        } catch {
          // The size violation remains the actionable, sanitized error.
        }
        throw new BodyTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return concatChunks(chunks, length)
}

export async function readRequestBodyBounded(request: Request, limit: number): Promise<ArrayBuffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD' || request.body === null) return undefined
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await request.body.cancel().catch(() => undefined)
    throw new BodyTooLargeError()
  }
  const bytes = await readStreamBounded(request.body, limit)
  const body = new Uint8Array(bytes.byteLength)
  body.set(bytes)
  return body.buffer
}

interface PrefixResult {
  bytes: Uint8Array
  complete: boolean
}

export interface InspectedResponse extends PrefixResult {
  response: Response
}

function replayResponseBody(
  response: Response,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  consumedChunks: Uint8Array[],
  sourceComplete: boolean,
): Response {
  let consumedIndex = 0
  let done = sourceComplete
  let released = false

  const releaseReader = () => {
    if (released) return
    released = true
    reader.releaseLock()
  }

  if (done) releaseReader()

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (consumedIndex < consumedChunks.length) {
        controller.enqueue(consumedChunks[consumedIndex])
        consumedIndex += 1
        return
      }
      if (done) {
        controller.close()
        return
      }

      try {
        const next = await reader.read()
        if (next.done) {
          done = true
          releaseReader()
          controller.close()
        } else if (next.value) {
          controller.enqueue(next.value)
        }
      } catch (error) {
        done = true
        releaseReader()
        controller.error(error)
      }
    },
    async cancel(reason) {
      if (!done) {
        done = true
        try {
          await reader.cancel(reason)
        } finally {
          releaseReader()
        }
      }
    },
  })

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Reads no more than `limit` bytes for classification, then rebuilds the body
 * from the consumed chunks and the untouched reader. Unlike Response.clone(),
 * this cannot buffer an arbitrarily large unread branch in memory.
 */
export async function inspectResponsePrefix(
  response: Response,
  limit = MAX_INSPECTION_BYTES,
): Promise<InspectedResponse> {
  if (response.body === null) {
    return { response, bytes: new Uint8Array(), complete: true }
  }

  const reader = response.body.getReader()
  const consumedChunks: Uint8Array[] = []
  const prefixChunks: Uint8Array[] = []
  let length = 0
  let complete = false

  try {
    while (length < limit) {
      const { value, done } = await reader.read()
      if (done) {
        complete = true
        break
      }
      if (!value) continue
      consumedChunks.push(value)
      const remaining = limit - length
      const prefixChunk = value.byteLength > remaining ? value.slice(0, remaining) : value
      if (prefixChunk.byteLength > 0) prefixChunks.push(prefixChunk)
      length += prefixChunk.byteLength
    }
  } catch (error) {
    reader.releaseLock()
    throw error
  }

  return {
    response: replayResponseBody(response, reader, consumedChunks, complete),
    bytes: concatChunks(prefixChunks, length),
    complete,
  }
}

export async function inspectSmallJsonResponse(
  response: Response,
  limit = MAX_INSPECTION_BYTES,
): Promise<{ response: Response; payload: unknown | null }> {
  const inspected = await inspectResponsePrefix(response, limit)
  if (!inspected.complete) return { response: inspected.response, payload: null }

  try {
    const text = new TextDecoder().decode(inspected.bytes)
    return { response: inspected.response, payload: JSON.parse(text) as unknown }
  } catch {
    return { response: inspected.response, payload: null }
  }
}

async function readSmallResponseText(response: Response, limit: number): Promise<string> {
  if (response.body === null) return ''
  const bytes = await readStreamBounded(response.body, limit)
  return new TextDecoder().decode(bytes)
}

export function buildUpstreamUrl(baseUrl: string, apiPath: string, search = ''): URL {
  const base = new URL(baseUrl)
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`
  base.pathname = `${basePath}${apiPath.replace(/^\/+/, '')}`
  base.search = search
  base.hash = ''
  return base
}

export function createUpstreamSession(cookieJar: StoredCookie[], now = Date.now()): UpstreamSession {
  const tokenCookie = findTokenCookie(cookieJar, now)
  if (!tokenCookie) throw new UpstreamLoginError()
  const expiresAt = tokenCookie.expiresAt ?? now + SESSION_FALLBACK_TTL_MS
  return {
    cookieJar,
    sessionObtainedAt: now,
    refreshAt: Math.max(now, expiresAt - SESSION_REFRESH_SKEW_MS),
    expiresAt,
  }
}

export async function loginToUpstream(
  env: UpstreamEnv,
  username: string,
  password: string,
): Promise<UpstreamSession> {
  const targetUrl = buildUpstreamUrl(env.KZ_API_BASE, '/passport/login/signIn')
  const form = new URLSearchParams({
    username,
    userpwd: password,
    token: '',
    ispwd: '0',
  })
  let response: Response
  try {
    response = await fetch(targetUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded',
        sun: '5516',
      },
      body: form.toString(),
    })
  } catch {
    throw new UpstreamUnavailableError()
  }

  let payload: unknown
  try {
    const text = await readSmallResponseText(response, MAX_INSPECTION_BYTES)
    payload = JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof BodyTooLargeError)) {
      throw new UpstreamUnavailableError()
    }
    throw new UpstreamLoginError()
  }

  if (!response.ok || !isObject(payload) || payload.success !== true) throw new UpstreamLoginError()
  const now = Date.now()
  const merged = mergeSetCookieHeaders([], getSetCookieHeaders(response.headers), targetUrl, now)
  return createUpstreamSession(merged.cookieJar, now)
}

export function updateSessionFromResponse(
  session: UpstreamSession,
  response: Response,
  responseUrl: URL,
  now = Date.now(),
): { session: UpstreamSession; changed: boolean; tokenDeleted: boolean } {
  const merged = mergeSetCookieHeaders(
    session.cookieJar,
    getSetCookieHeaders(response.headers),
    responseUrl,
    now,
  )
  if (!merged.changed) return { session, changed: false, tokenDeleted: merged.tokenDeleted }

  let refreshAt = session.refreshAt
  let expiresAt = session.expiresAt
  if (merged.tokenTouched) {
    const tokenCookie = findTokenCookie(merged.cookieJar, now)
    if (tokenCookie) {
      expiresAt = tokenCookie.expiresAt ?? now + SESSION_FALLBACK_TTL_MS
      refreshAt = Math.max(now, expiresAt - SESSION_REFRESH_SKEW_MS)
    }
  }

  return {
    session: {
      ...session,
      cookieJar: merged.cookieJar,
      refreshAt,
      expiresAt,
    },
    changed: true,
    tokenDeleted: merged.tokenDeleted,
  }
}

function pointsToLogin(value: string, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl)
    const url = new URL(value, base)
    return url.origin === base.origin && /\/passport\/login(?:\/|$)/i.test(url.pathname)
  } catch {
    return false
  }
}

function structuredAuthFailure(payload: unknown, baseUrl: string): boolean {
  if (!isObject(payload)) return false
  if (typeof payload.redirect === 'string' && pointsToLogin(payload.redirect, baseUrl)) return true
  const status = typeof payload.status === 'number' || typeof payload.status === 'string'
    ? Number(payload.status)
    : 0
  return payload.success === false && (status === 401 || status === 403)
}

function scriptRedirectsToLogin(text: string, baseUrl: string): boolean {
  if (!/^\s*<script\b[^>]*>[\s\S]*<\/script>\s*$/i.test(text)) return false
  const assignment = text.match(
    /(?:window\.)?(?:top\.)?location\.href\s*=\s*(["'])([^"']+)\1/i,
  )
  return assignment ? pointsToLogin(assignment[2], baseUrl) : false
}

export async function inspectUpstreamAuthFailure(
  response: Response,
  baseUrl: string,
  tokenDeleted: boolean,
): Promise<{ response: Response; authFailure: boolean }> {
  if (response.status === 401 || tokenDeleted) return { response, authFailure: true }
  const location = response.headers.get('location')
  if (response.status >= 300 && response.status < 400
    && location
    && pointsToLogin(location, baseUrl)) {
    return { response, authFailure: true }
  }

  const inspected = await inspectResponsePrefix(response, MAX_INSPECTION_BYTES)
  const prefix: PrefixResult = inspected
  const text = new TextDecoder().decode(prefix.bytes).trim()
  const lower = text.toLowerCase()
  const loginHtml = lower.includes('<form') && lower.includes('/passport/login/signin')
  const loginScript = prefix.complete && scriptRedirectsToLogin(text, baseUrl)

  let jsonFailure = false
  if (prefix.complete && text.startsWith('{')) {
    try {
      const payload: unknown = JSON.parse(text)
      jsonFailure = structuredAuthFailure(payload, baseUrl)
    } catch {
      jsonFailure = false
    }
  }
  const authFailure = loginHtml || loginScript || jsonFailure
  return { response: inspected.response, authFailure }
}

// Kept as a small classifier-facing helper for unit tests and other callers
// that do not need to consume the response body afterwards.
export async function isUpstreamAuthFailure(
  response: Response,
  baseUrl: string,
  tokenDeleted: boolean,
): Promise<boolean> {
  const inspected = await inspectUpstreamAuthFailure(response, baseUrl, tokenDeleted)
  if (inspected.response.body) await inspected.response.body.cancel()
  return inspected.authFailure
}
