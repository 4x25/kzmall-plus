import {
  CryptoConfigurationError,
  deriveOwnerId,
  normalizeUsername,
  openCompactJson,
  sealCompactJson,
} from './crypto'
import { parseRequestCookies } from './cookies'
import {
  MANAGEMENT_COOKIE_NAME,
  MANAGEMENT_SESSION_TTL_MS,
  type ManagementSession,
  isManagementSession,
} from './types'

type ManagementEnv = Pick<
  CloudflareBindings,
  'AGENT_CREDENTIAL_ROOT_KEY_V1' | 'MANAGEMENT_SESSION_ROOT_KEY_V1' | 'APP_ENV'
>

function serializeCookie(name: string, value: string, expiresAt: number): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
    `Max-Age=${maxAge}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].filter(Boolean).join('; ')
}

export async function createManagementCookie(
  env: ManagementEnv,
  usernameInput: string,
  upstreamExpiresAt: number | null,
): Promise<{ ownerId: string; header: string }> {
  const now = Date.now()
  const username = normalizeUsername(usernameInput)
  const ownerId = await deriveOwnerId(env.AGENT_CREDENTIAL_ROOT_KEY_V1, env.APP_ENV, username)
  const localExpiry = now + MANAGEMENT_SESSION_TTL_MS
  const expiresAt = upstreamExpiresAt !== null && upstreamExpiresAt > now
    ? Math.min(localExpiry, upstreamExpiresAt)
    : localExpiry
  const session: ManagementSession = {
    version: 1,
    ownerId,
    username,
    issuedAt: now,
    expiresAt,
  }
  const value = await sealCompactJson(
    env.MANAGEMENT_SESSION_ROOT_KEY_V1,
    env.APP_ENV,
    'management-session',
    MANAGEMENT_COOKIE_NAME,
    session,
  )
  return { ownerId, header: serializeCookie(MANAGEMENT_COOKIE_NAME, value, expiresAt) }
}

export function clearManagementCookie(): string {
  return [
    `${MANAGEMENT_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ].filter(Boolean).join('; ')
}

export async function readManagementSession(
  env: ManagementEnv,
  request: Request,
): Promise<ManagementSession | null> {
  const cookies = parseRequestCookies(request.headers.get('cookie'))
  const value = cookies.get(MANAGEMENT_COOKIE_NAME)
  if (!value || !cookies.get('token')) return null

  try {
    const session = await openCompactJson(
      env.MANAGEMENT_SESSION_ROOT_KEY_V1,
      env.APP_ENV,
      'management-session',
      MANAGEMENT_COOKIE_NAME,
      value,
      isManagementSession,
    )
    if (session.expiresAt <= Date.now()) return null
    const ownerId = await deriveOwnerId(
      env.AGENT_CREDENTIAL_ROOT_KEY_V1,
      env.APP_ENV,
      session.username,
    )
    return ownerId === session.ownerId ? session : null
  } catch (error) {
    if (error instanceof CryptoConfigurationError) throw error
    return null
  }
}
