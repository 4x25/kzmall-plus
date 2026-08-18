import { buildCookieHeader, findTokenCookie, getSetCookieHeaders, mergeSetCookieHeaders, rewriteBrowserSetCookie } from './cookies'
import { normalizeUsername } from './crypto'
import { AppError, logEvent } from './errors'
import { createManagementCookie, clearManagementCookie } from './management-session'
import {
  clearReauthCooldown,
  getAccountCredential,
  getReauthCooldown,
  putAccountCredential,
  resolveAgentToken,
  setReauthCooldown,
} from './store'
import {
  BodyTooLargeError,
  buildUpstreamUrl,
  createUpstreamSession,
  inspectSmallJsonResponse,
  inspectUpstreamAuthFailure,
  loginToUpstream,
  readRequestBodyBounded,
  updateSessionFromResponse,
  UpstreamLoginError,
  UpstreamUnavailableError,
} from './upstream'
import {
  MAX_AGENT_REQUEST_BODY_BYTES,
  MAX_MANAGEMENT_BODY_BYTES,
  type AccountCredentialRecord,
  isObject,
} from './types'

type ProxyEnv = CloudflareBindings

const BROWSER_FORWARD_HEADERS = [
  'cookie',
  'content-type',
  'accept',
  'authorization',
  'user-agent',
  'accept-language',
] as const

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const AGENT_BLOCKED_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  'authorization',
  'content-length',
  'cookie',
  'forwarded',
  'host',
  'origin',
  'referer',
  'x-credential',
  'x-http-method-override',
  'x-real-ip',
])

function browserForwardHeaders(request: Request): Headers {
  const headers = new Headers()
  for (const name of BROWSER_FORWARD_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('sun', '5516')
  return headers
}

function shouldBlockAgentHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return AGENT_BLOCKED_HEADERS.has(lower)
    || lower.startsWith('cf-')
    || lower.startsWith('x-forwarded-')
}

function agentForwardHeaders(request: Request, cookieHeader: string): Headers {
  const headers = new Headers()
  const connectionHeaders = new Set(
    (request.headers.get('connection') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
  for (const [name, value] of request.headers.entries()) {
    if (!shouldBlockAgentHeader(name) && !connectionHeaders.has(name.toLowerCase())) {
      headers.append(name, value)
    }
  }
  if (cookieHeader) headers.set('cookie', cookieHeader)
  headers.set('sun', '5516')
  return headers
}

function copyUpstreamHeaders(response: Response, agent: boolean, requestId: string): Headers {
  const headers = new Headers()
  const connectionHeaders = new Set(
    (response.headers.get('connection') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
  for (const [name, value] of response.headers.entries()) {
    const lower = name.toLowerCase()
    if (lower === 'set-cookie' || HOP_BY_HOP_HEADERS.has(lower) || connectionHeaders.has(lower)) continue
    if (agent && lower.startsWith('access-control-')) continue
    headers.append(name, value)
  }
  headers.set('x-request-id', requestId)
  if (agent) headers.set('cache-control', 'no-store')
  return headers
}

function browserResponse(response: Response, requestId: string, extraCookies: string[] = []): Response {
  const headers = copyUpstreamHeaders(response, false, requestId)
  for (const cookie of getSetCookieHeaders(response.headers)) {
    headers.append('set-cookie', rewriteBrowserSetCookie(cookie))
  }
  for (const cookie of extraCookies) headers.append('set-cookie', cookie)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function agentResponse(response: Response, requestId: string): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyUpstreamHeaders(response, true, requestId),
  })
}

function browserTarget(request: Request, env: ProxyEnv): URL {
  const url = new URL(request.url)
  const apiPath = url.pathname.replace(/^\/api\/?/, '')
  return buildUpstreamUrl(env.KZ_API_BASE, apiPath, url.search)
}

export async function handleBrowserProxy(request: Request, env: ProxyEnv, requestId: string): Promise<Response> {
  const target = browserTarget(request, env)
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: browserForwardHeaders(request),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    })
    return browserResponse(response, requestId)
  } catch {
    throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
  }
}

export async function handleBrowserLogin(request: Request, env: ProxyEnv, requestId: string): Promise<Response> {
  let body: ArrayBuffer | undefined
  try {
    body = await readRequestBodyBounded(request, MAX_MANAGEMENT_BODY_BYTES)
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      throw new AppError(413, 'REQUEST_BODY_TOO_LARGE', '登录请求体过大')
    }
    throw error
  }
  const target = browserTarget(request, env)
  let response: Response
  try {
    response = await fetch(target, {
      method: 'POST',
      redirect: 'manual',
      headers: browserForwardHeaders(request),
      body,
    })
  } catch {
    throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
  }
  const extraCookies: string[] = []
  let payload: unknown | null
  try {
    const inspected = await inspectSmallJsonResponse(response)
    response = inspected.response
    payload = inspected.payload
  } catch {
    throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
  }

  if (response.ok && isObject(payload) && payload.success === true) {
    let managementIssued = false
    if (body) {
      const form = new URLSearchParams(new TextDecoder().decode(body))
      const username = normalizeUsername(form.get('username') ?? '')
      const password = form.get('userpwd') ?? ''
      const now = Date.now()
      const merged = mergeSetCookieHeaders([], getSetCookieHeaders(response.headers), target, now)
      const tokenCookie = findTokenCookie(merged.cookieJar, now)
      if (username && tokenCookie) {
        let ownerId: string | null = null
        try {
          const management = await createManagementCookie(
            env,
            username,
            tokenCookie.expiresAt,
          )
          extraCookies.push(management.header)
          ownerId = management.ownerId
          managementIssued = true
        } catch {
          logEvent('error', 'management_session_issue_failed', { requestId, method: 'POST', path: '/api/passport/login/signIn' })
        }

        // Reuse this proven login instead of asking the user for their password
        // again or performing a second upstream login. Credential persistence is
        // best-effort so a transient KV failure never breaks normal browser login.
        if (ownerId && password) {
          try {
            const record: AccountCredentialRecord = {
              version: 1,
              ownerId,
              username,
              password,
              session: createUpstreamSession(merged.cookieJar, now),
              lastValidatedAt: now,
            }
            await putAccountCredential(env, record)
            try {
              await clearReauthCooldown(env, ownerId)
            } catch {
              logEvent('error', 'reauth_cooldown_clear_failed', {
                requestId,
                method: 'POST',
                path: '/api/passport/login/signIn',
              })
            }
          } catch {
            logEvent('error', 'account_credential_sync_failed', {
              requestId,
              method: 'POST',
              path: '/api/passport/login/signIn',
            })
          }
        }
      }
    }
    // A proven successful upstream login changes browser identity. Never let a
    // management session for the previous account survive if a replacement
    // cannot be issued (for example, because the token Cookie is malformed).
    if (!managementIssued) extraCookies.push(clearManagementCookie())
  }
  return browserResponse(response, requestId, extraCookies)
}

export async function handleBrowserLogout(request: Request, env: ProxyEnv, requestId: string): Promise<Response> {
  const clearCookie = clearManagementCookie()
  try {
    const response = await fetch(browserTarget(request, env), {
      method: 'POST',
      headers: browserForwardHeaders(request),
      body: request.body,
    })
    return browserResponse(response, requestId, [clearCookie])
  } catch {
    const error = new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    })
    headers.append('set-cookie', clearCookie)
    return new Response(JSON.stringify({
      error: { code: error.code, message: error.publicMessage, requestId },
    }), { status: error.status, headers })
  }
}

export function extractAgentPath(request: Request): { apiPath: string; search: string } {
  const url = new URL(request.url)
  const prefix = '/agent-api/'
  if (!url.pathname.startsWith(prefix)) throw new AppError(404, 'AGENT_PATH_NOT_FOUND', 'Agent 接口不存在')
  const encodedPath = url.pathname.slice(prefix.length)
  if (!encodedPath
    || encodedPath.startsWith('/')
    || encodedPath.includes('\\')
    || /%(?:25|2e|2f|5c)/i.test(encodedPath)) {
    throw new AppError(400, 'INVALID_UPSTREAM_PATH', '上游接口路径无效')
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(encodedPath)
  } catch {
    throw new AppError(400, 'INVALID_UPSTREAM_PATH', '上游接口路径编码无效')
  }
  if (/[\u0000-\u001F\u007F]/.test(decodedPath)) {
    throw new AppError(400, 'INVALID_UPSTREAM_PATH', '上游接口路径无效')
  }
  if (decodedPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new AppError(400, 'INVALID_UPSTREAM_PATH', '上游接口路径无效')
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(decodedPath)) {
    throw new AppError(400, 'INVALID_UPSTREAM_PATH', '上游接口路径无效')
  }
  const normalized = `/${decodedPath.replace(/\/{2,}/g, '/')}`
  if (/^\/passport\/login\/(?:signIn|signOut)\/?$/i.test(normalized)) {
    throw new AppError(403, 'UPSTREAM_AUTH_PATH_FORBIDDEN', 'Agent 不允许调用快准登录或退出接口')
  }
  return { apiPath: encodedPath, search: url.search }
}

async function performAccountSessionRefresh(
  env: ProxyEnv,
  account: AccountCredentialRecord,
  requestId: string,
  reason: 'proactive' | 'reactive',
): Promise<AccountCredentialRecord> {
  const cooldown = await getReauthCooldown(env, account.ownerId)
  if (cooldown > 0) {
    throw new AppError(503, 'UPSTREAM_REAUTH_COOLDOWN', '快准登录暂时处于冷却期，请稍后重试', cooldown)
  }

  try {
    const session = await loginToUpstream(env, account.username, account.password)
    const updated: AccountCredentialRecord = {
      ...account,
      session,
      lastValidatedAt: Date.now(),
    }
    await putAccountCredential(env, updated)
    try {
      await clearReauthCooldown(env, account.ownerId)
    } catch {
      logEvent('error', 'reauth_cooldown_clear_failed', { requestId, reason, method: 'POST', path: '/passport/login/signIn' })
    }
    logEvent('info', 'upstream_reauth_succeeded', { requestId, reason, method: 'POST', path: '/passport/login/signIn' })
    return updated
  } catch (error) {
    if (!(error instanceof UpstreamLoginError) && !(error instanceof UpstreamUnavailableError)) throw error
    try {
      await setReauthCooldown(env, account.ownerId)
    } catch {
      logEvent('error', 'reauth_cooldown_set_failed', { requestId, reason, method: 'POST', path: '/passport/login/signIn' })
    }
    logEvent('error', 'upstream_reauth_failed', { requestId, reason, method: 'POST', path: '/passport/login/signIn' })
    if (error instanceof UpstreamUnavailableError) {
      throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
    }
    throw new AppError(502, 'UPSTREAM_REAUTH_FAILED', '快准登录失败，请退出后重新登录以更新凭证')
  }
}

interface ReauthFlight {
  done: Promise<void>
  resolve: () => void
  result?: AccountCredentialRecord
  error?: unknown
}

// This map contains only a short-lived, pure-JS completion signal and is
// removed as soon as the originating refresh settles. It coalesces requests
// already concurrent in one isolate without pretending to be a global lock.
const reauthFlights = new Map<string, ReauthFlight>()

async function refreshAccountSession(
  env: ProxyEnv,
  account: AccountCredentialRecord,
  requestId: string,
  reason: 'proactive' | 'reactive',
): Promise<AccountCredentialRecord> {
  const existing = reauthFlights.get(account.ownerId)
  if (existing) {
    logEvent('info', 'upstream_reauth_joined', {
      requestId,
      reason,
      method: 'POST',
      path: '/passport/login/signIn',
    })
    await existing.done
    if (existing.result) return existing.result
    if (existing.error) throw existing.error
    throw new AppError(502, 'UPSTREAM_REAUTH_FAILED', '快准登录失败，请退出后重新登录以更新凭证')
  }

  let resolveFlight!: () => void
  const flight: ReauthFlight = {
    done: new Promise<void>((resolve) => { resolveFlight = resolve }),
    resolve: () => resolveFlight(),
  }
  reauthFlights.set(account.ownerId, flight)

  try {
    const result = await performAccountSessionRefresh(env, account, requestId, reason)
    flight.result = result
    return result
  } catch (error) {
    flight.error = error
    throw error
  } finally {
    flight.resolve()
    if (reauthFlights.get(account.ownerId) === flight) reauthFlights.delete(account.ownerId)
  }
}

async function forwardAgentAttempt(
  request: Request,
  target: URL,
  body: ArrayBuffer | undefined,
  account: AccountCredentialRecord,
): Promise<Response> {
  const cookie = buildCookieHeader(account.session.cookieJar, target)
  try {
    return await fetch(target, {
      method: request.method,
      redirect: 'manual',
      headers: agentForwardHeaders(request, cookie),
      body,
    })
  } catch {
    throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
  }
}

export async function handleAgentProxy(request: Request, env: ProxyEnv, requestId: string): Promise<Response> {
  if (String(env.AGENT_API_ENABLED) !== 'true') {
    throw new AppError(503, 'AGENT_API_DISABLED', 'Agent 接口尚未启用')
  }
  if (request.method === 'CONNECT' || request.method === 'TRACE') {
    throw new AppError(405, 'METHOD_NOT_ALLOWED', '该 HTTP 方法不允许转发')
  }

  const { apiPath, search } = extractAgentPath(request)
  const rawToken = request.headers.get('x-credential') ?? ''
  const resolved = await resolveAgentToken(env, rawToken)
  if (!resolved) throw new AppError(401, 'INVALID_AGENT_CREDENTIAL', '凭证无效或已撤销')

  let account = await getAccountCredential(env, resolved.record.ownerId)
  if (!account) throw new AppError(401, 'INVALID_AGENT_CREDENTIAL', '凭证无效或已撤销')

  let body: ArrayBuffer | undefined
  try {
    body = await readRequestBodyBounded(request, MAX_AGENT_REQUEST_BODY_BYTES)
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      throw new AppError(413, 'REQUEST_BODY_TOO_LARGE', 'Agent 请求体不能超过 4 MiB')
    }
    throw error
  }

  const now = Date.now()
  if (now >= account.session.refreshAt || !findTokenCookie(account.session.cookieJar, now)) {
    account = await refreshAccountSession(env, account, requestId, 'proactive')
  }

  const target = buildUpstreamUrl(env.KZ_API_BASE, apiPath, search)
  let response = await forwardAgentAttempt(request, target, body, account)
  let sessionUpdate = updateSessionFromResponse(account.session, response, target)
  let inspected
  try {
    inspected = await inspectUpstreamAuthFailure(response, env.KZ_API_BASE, sessionUpdate.tokenDeleted)
  } catch {
    if (response.body) await response.body.cancel().catch(() => undefined)
    throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
  }
  response = inspected.response

  if (inspected.authFailure) {
    if (response.body) await response.body.cancel()
    account = await refreshAccountSession(env, account, requestId, 'reactive')
    logEvent('info', 'agent_request_replayed', { requestId, method: request.method, path: `/${apiPath}` })
    response = await forwardAgentAttempt(request, target, body, account)
    sessionUpdate = updateSessionFromResponse(account.session, response, target)
    try {
      inspected = await inspectUpstreamAuthFailure(response, env.KZ_API_BASE, sessionUpdate.tokenDeleted)
    } catch {
      if (response.body) await response.body.cancel().catch(() => undefined)
      throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
    }
    response = inspected.response
    if (inspected.authFailure) {
      if (response.body) await response.body.cancel()
      throw new AppError(502, 'UPSTREAM_AUTH_FAILED', '重新登录后快准仍拒绝了本次请求')
    }
  }

  if (sessionUpdate.changed) {
    account = { ...account, session: sessionUpdate.session }
    await putAccountCredential(env, account)
  }
  return agentResponse(response, requestId)
}
