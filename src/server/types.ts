export const AGENT_TOKEN_PREFIX = 'kza_v1_'
export const AGENT_TOKEN_PATTERN = /^kza_v1_[A-Za-z0-9_-]{43}$/
export const MANAGEMENT_COOKIE_NAME = 'kzp_mgmt'
export const MANAGEMENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const SESSION_FALLBACK_TTL_MS = 60 * 60 * 1000
export const SESSION_REFRESH_SKEW_MS = 5 * 60 * 1000
export const REAUTH_COOLDOWN_SECONDS = 30
export const MAX_AGENT_REQUEST_BODY_BYTES = 4 * 1024 * 1024
export const MAX_INSPECTION_BYTES = 64 * 1024
export const MAX_MANAGEMENT_BODY_BYTES = 16 * 1024
export const MAX_AGENT_TOKENS_PER_OWNER = 10

export interface StoredCookie {
  name: string
  value: string
  path: string
  expiresAt: number | null
  secure: boolean
  httpOnly: boolean
  sameSite: string | null
}

export interface UpstreamSession {
  cookieJar: StoredCookie[]
  sessionObtainedAt: number
  refreshAt: number
  expiresAt: number
}

export interface AccountCredentialRecord {
  version: 1
  ownerId: string
  username: string
  password: string
  session: UpstreamSession
  lastValidatedAt: number
}

export interface AgentTokenRecord {
  version: 1
  tokenId: string
  ownerId: string
  name: string
  tokenHint: string
  permissions: 'full-proxy'
  createdAt: number
  updatedAt: number
}

export interface AgentTokenIndexRecord {
  version: 1
  tokenId: string
  ownerId: string
  tokenKey: string
}

export interface ReauthCooldownRecord {
  version: 1
  ownerId: string
  until: number
}

export interface ManagementSession {
  version: 1
  ownerId: string
  username: string
  issuedAt: number
  expiresAt: number
}

export interface EncryptedEnvelope {
  version: 1
  kid: 'v1'
  iv: string
  ciphertext: string
}

export interface TokenMetadata {
  id: string
  name: string
  tokenHint: string
  permissions: 'full-proxy'
  createdAt: number
  updatedAt: number
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isStoredCookie(value: unknown): value is StoredCookie {
  return isObject(value)
    && typeof value.name === 'string'
    && typeof value.value === 'string'
    && typeof value.path === 'string'
    && (value.expiresAt === null || isFiniteNumber(value.expiresAt))
    && typeof value.secure === 'boolean'
    && typeof value.httpOnly === 'boolean'
    && isNullableString(value.sameSite)
}

export function isUpstreamSession(value: unknown): value is UpstreamSession {
  return isObject(value)
    && Array.isArray(value.cookieJar)
    && value.cookieJar.every(isStoredCookie)
    && isFiniteNumber(value.sessionObtainedAt)
    && isFiniteNumber(value.refreshAt)
    && isFiniteNumber(value.expiresAt)
}

export function isAccountCredentialRecord(value: unknown): value is AccountCredentialRecord {
  return isObject(value)
    && value.version === 1
    && typeof value.ownerId === 'string'
    && typeof value.username === 'string'
    && typeof value.password === 'string'
    && isUpstreamSession(value.session)
    && isFiniteNumber(value.lastValidatedAt)
}

export function isAgentTokenRecord(value: unknown): value is AgentTokenRecord {
  return isObject(value)
    && value.version === 1
    && typeof value.tokenId === 'string'
    && typeof value.ownerId === 'string'
    && typeof value.name === 'string'
    && typeof value.tokenHint === 'string'
    && value.permissions === 'full-proxy'
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt)
}

export function isAgentTokenIndexRecord(value: unknown): value is AgentTokenIndexRecord {
  return isObject(value)
    && value.version === 1
    && typeof value.tokenId === 'string'
    && typeof value.ownerId === 'string'
    && typeof value.tokenKey === 'string'
}

export function isReauthCooldownRecord(value: unknown): value is ReauthCooldownRecord {
  return isObject(value)
    && value.version === 1
    && typeof value.ownerId === 'string'
    && isFiniteNumber(value.until)
}

export function isManagementSession(value: unknown): value is ManagementSession {
  return isObject(value)
    && value.version === 1
    && typeof value.ownerId === 'string'
    && typeof value.username === 'string'
    && isFiniteNumber(value.issuedAt)
    && isFiniteNumber(value.expiresAt)
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return isObject(value)
    && value.version === 1
    && value.kid === 'v1'
    && typeof value.iv === 'string'
    && typeof value.ciphertext === 'string'
}

export function toTokenMetadata(record: AgentTokenRecord): TokenMetadata {
  return {
    id: record.tokenId,
    name: record.name,
    tokenHint: record.tokenHint,
    permissions: record.permissions,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
