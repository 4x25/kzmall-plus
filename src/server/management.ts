import { AppError, logEvent } from './errors'
import { readManagementSession } from './management-session'
import {
  TokenLimitError,
  clearReauthCooldown,
  createAgentToken,
  deleteOwnerCredentials,
  getAccountCredential,
  listAgentTokens,
  putAccountCredential,
  renameAgentToken,
  revokeAgentToken,
  rotateAgentToken,
} from './store'
import {
  BodyTooLargeError,
  loginToUpstream,
  readRequestBodyBounded,
  UpstreamLoginError,
  UpstreamUnavailableError,
} from './upstream'
import {
  MAX_AGENT_TOKENS_PER_OWNER,
  MAX_MANAGEMENT_BODY_BYTES,
  type AccountCredentialRecord,
  isObject,
} from './types'

type ManagementEnv = CloudflareBindings

interface ManagementContext {
  ownerId: string
  username: string
}

const TOKEN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function jsonResponse(value: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  })
}

function noContentResponse(requestId: string): Response {
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  })
}

function maskUsername(username: string): string {
  if (username.length <= 2) return `${username.slice(0, 1)}*`
  if (username.length <= 4) return `${username.slice(0, 1)}***${username.slice(-1)}`
  return `${username.slice(0, 2)}***${username.slice(-2)}`
}

async function requireManagementContext(env: ManagementEnv, request: Request): Promise<ManagementContext> {
  const session = await readManagementSession(env, request)
  if (!session) throw new AppError(401, 'MANAGEMENT_SESSION_REQUIRED', '请重新登录后管理 Agent Token')
  return { ownerId: session.ownerId, username: session.username }
}

function requireSameOriginJson(request: Request): void {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin !== url.origin) throw new AppError(403, 'INVALID_REQUEST_ORIGIN', '请求来源校验失败')
  const contentType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase() ?? ''
  if (contentType !== 'application/json') {
    throw new AppError(415, 'JSON_REQUIRED', '请求必须使用 application/json')
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await readRequestBodyBounded(request, MAX_MANAGEMENT_BODY_BYTES)
    if (!body) throw new AppError(400, 'INVALID_REQUEST_BODY', '请求体不能为空')
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body))
    if (!isObject(parsed)) throw new AppError(400, 'INVALID_REQUEST_BODY', '请求体格式无效')
    return parsed
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof BodyTooLargeError) {
      throw new AppError(413, 'REQUEST_BODY_TOO_LARGE', '管理请求体过大')
    }
    throw new AppError(400, 'INVALID_REQUEST_BODY', '请求体不是有效 JSON')
  }
}

function readTokenName(body: Record<string, unknown>): string {
  if (typeof body.name !== 'string') throw new AppError(400, 'INVALID_TOKEN_NAME', '请输入 Token 名称')
  const name = body.name.trim().normalize('NFC')
  if (name.length < 1 || name.length > 64) {
    throw new AppError(400, 'INVALID_TOKEN_NAME', 'Token 名称长度必须为 1 到 64 个字符')
  }
  return name
}

function requireTokenId(tokenId: string): string {
  if (!TOKEN_ID_PATTERN.test(tokenId)) {
    throw new AppError(400, 'INVALID_TOKEN_ID', 'Agent Token 标识无效')
  }
  return tokenId
}

export async function getCredentialManagement(
  request: Request,
  env: ManagementEnv,
  requestId: string,
): Promise<Response> {
  const context = await requireManagementContext(env, request)
  const [account, tokens] = await Promise.all([
    getAccountCredential(env, context.ownerId),
    listAgentTokens(env, context.ownerId),
  ])
  return jsonResponse({
    account: {
      usernameHint: maskUsername(context.username),
      credentialConfigured: account !== null,
      lastValidatedAt: account?.lastValidatedAt ?? null,
    },
    tokens,
    limits: { maxTokens: MAX_AGENT_TOKENS_PER_OWNER },
  }, 200, requestId)
}

export async function updateAccountCredential(
  request: Request,
  env: ManagementEnv,
  requestId: string,
): Promise<Response> {
  requireSameOriginJson(request)
  const context = await requireManagementContext(env, request)
  const body = await readJsonBody(request)
  if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 256) {
    throw new AppError(400, 'INVALID_PASSWORD', '请输入有效的快准账号密码')
  }

  try {
    const session = await loginToUpstream(env, context.username, body.password)
    const record: AccountCredentialRecord = {
      version: 1,
      ownerId: context.ownerId,
      username: context.username,
      password: body.password,
      session,
      lastValidatedAt: Date.now(),
    }
    await putAccountCredential(env, record)
    try {
      await clearReauthCooldown(env, context.ownerId)
    } catch {
      // The credential itself is already durably updated. A stale cooldown is
      // short-lived and must not turn this successful operation into a retry.
      logEvent('error', 'reauth_cooldown_clear_failed', {
        requestId,
        method: request.method,
        path: '/api/agent-credentials/account',
      })
    }
    return jsonResponse({
      account: {
        usernameHint: maskUsername(context.username),
        credentialConfigured: true,
        lastValidatedAt: record.lastValidatedAt,
      },
    }, 200, requestId)
  } catch (error) {
    if (error instanceof UpstreamLoginError) {
      throw new AppError(422, 'UPSTREAM_CREDENTIAL_REJECTED', '快准账号或密码验证失败')
    }
    if (error instanceof UpstreamUnavailableError) {
      throw new AppError(502, 'UPSTREAM_UNAVAILABLE', '快准服务暂时不可用')
    }
    throw error
  }
}

export async function deleteAccountCredential(
  request: Request,
  env: ManagementEnv,
  requestId: string,
): Promise<Response> {
  requireSameOriginJson(request)
  const context = await requireManagementContext(env, request)
  await readJsonBody(request)
  await deleteOwnerCredentials(env, context.ownerId)
  return noContentResponse(requestId)
}

export async function createCredentialToken(
  request: Request,
  env: ManagementEnv,
  requestId: string,
): Promise<Response> {
  requireSameOriginJson(request)
  const context = await requireManagementContext(env, request)
  const account = await getAccountCredential(env, context.ownerId)
  if (!account) throw new AppError(409, 'ACCOUNT_CREDENTIAL_REQUIRED', '请先绑定快准账号凭证')
  const name = readTokenName(await readJsonBody(request))

  try {
    const created = await createAgentToken(env, context.ownerId, name)
    return jsonResponse(created, 201, requestId)
  } catch (error) {
    if (error instanceof TokenLimitError) {
      throw new AppError(409, 'TOKEN_LIMIT_REACHED', '每个账号最多创建 10 枚 Agent Token')
    }
    throw error
  }
}

export async function renameCredentialToken(
  request: Request,
  env: ManagementEnv,
  requestId: string,
  tokenId: string,
): Promise<Response> {
  requireSameOriginJson(request)
  const context = await requireManagementContext(env, request)
  const name = readTokenName(await readJsonBody(request))
  const metadata = await renameAgentToken(env, context.ownerId, requireTokenId(tokenId), name)
  if (!metadata) throw new AppError(404, 'TOKEN_NOT_FOUND', 'Agent Token 不存在')
  return jsonResponse({ metadata }, 200, requestId)
}

export async function rotateCredentialToken(
  request: Request,
  env: ManagementEnv,
  requestId: string,
  tokenId: string,
): Promise<Response> {
  requireSameOriginJson(request)
  const context = await requireManagementContext(env, request)
  await readJsonBody(request)
  const rotated = await rotateAgentToken(env, context.ownerId, requireTokenId(tokenId))
  if (!rotated) throw new AppError(404, 'TOKEN_NOT_FOUND', 'Agent Token 不存在')
  return jsonResponse(rotated, 200, requestId)
}

export async function revokeCredentialToken(
  request: Request,
  env: ManagementEnv,
  requestId: string,
  tokenId: string,
): Promise<Response> {
  requireSameOriginJson(request)
  const context = await requireManagementContext(env, request)
  await readJsonBody(request)
  const revoked = await revokeAgentToken(env, context.ownerId, requireTokenId(tokenId))
  if (!revoked) throw new AppError(404, 'TOKEN_NOT_FOUND', 'Agent Token 不存在')
  return noContentResponse(requestId)
}
