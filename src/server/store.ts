import {
  decryptJson,
  EncryptedRecordError,
  encryptJson,
  generateAgentToken,
  hashAgentToken,
} from './crypto'
import {
  AGENT_TOKEN_PATTERN,
  MAX_AGENT_TOKENS_PER_OWNER,
  REAUTH_COOLDOWN_SECONDS,
  type AccountCredentialRecord,
  type AgentTokenIndexRecord,
  type AgentTokenRecord,
  isAccountCredentialRecord,
  isAgentTokenIndexRecord,
  isAgentTokenRecord,
  isReauthCooldownRecord,
  toTokenMetadata,
  type TokenMetadata,
} from './types'

type StoreEnv = Pick<
  CloudflareBindings,
  'AGENT_AUTH_KV' | 'AGENT_CREDENTIAL_ROOT_KEY_V1' | 'APP_ENV'
>

const ACCOUNT_PREFIX = 'agent:account:v1:'
const TOKEN_PREFIX = 'agent:token:v1:'
const INDEX_PREFIX = 'agent:index:v1:'
const COOLDOWN_PREFIX = 'agent:cooldown:v1:'

export class TokenLimitError extends Error {
  constructor() {
    super('Agent token limit reached')
    this.name = 'TokenLimitError'
  }
}

export function accountKey(ownerId: string): string {
  return `${ACCOUNT_PREFIX}${ownerId}`
}

export function tokenKey(tokenHash: string): string {
  return `${TOKEN_PREFIX}${tokenHash}`
}

export function tokenIndexKey(ownerId: string, tokenId: string): string {
  return `${INDEX_PREFIX}${ownerId}:${tokenId}`
}

function tokenIndexPrefix(ownerId: string): string {
  return `${INDEX_PREFIX}${ownerId}:`
}

function cooldownKey(ownerId: string): string {
  return `${COOLDOWN_PREFIX}${ownerId}`
}

async function readEncrypted<T>(
  env: StoreEnv,
  key: string,
  recordType: string,
  validate: (value: unknown) => value is T,
): Promise<T | null> {
  const serialized = await env.AGENT_AUTH_KV.get(key)
  if (serialized === null) return null
  return decryptJson(
    env.AGENT_CREDENTIAL_ROOT_KEY_V1,
    env.APP_ENV,
    recordType,
    key,
    serialized,
    validate,
  )
}

async function putEncrypted(
  env: StoreEnv,
  key: string,
  recordType: string,
  value: unknown,
): Promise<void> {
  const encrypted = await encryptJson(
    env.AGENT_CREDENTIAL_ROOT_KEY_V1,
    env.APP_ENV,
    recordType,
    key,
    value,
  )
  await env.AGENT_AUTH_KV.put(key, encrypted)
}

export async function getAccountCredential(env: StoreEnv, ownerId: string): Promise<AccountCredentialRecord | null> {
  const record = await readEncrypted(env, accountKey(ownerId), 'account-credential', isAccountCredentialRecord)
  if (record && record.ownerId !== ownerId) throw new EncryptedRecordError()
  return record
}

export async function putAccountCredential(env: StoreEnv, record: AccountCredentialRecord): Promise<void> {
  await putEncrypted(env, accountKey(record.ownerId), 'account-credential', record)
}

export async function resolveAgentToken(
  env: StoreEnv,
  rawToken: string,
): Promise<{ key: string; record: AgentTokenRecord } | null> {
  if (!AGENT_TOKEN_PATTERN.test(rawToken)) return null
  const key = tokenKey(await hashAgentToken(rawToken))
  const record = await readEncrypted(env, key, 'agent-token', isAgentTokenRecord)
  return record ? { key, record } : null
}

async function getIndex(
  env: StoreEnv,
  ownerId: string,
  tokenId: string,
): Promise<{ key: string; record: AgentTokenIndexRecord } | null> {
  const key = tokenIndexKey(ownerId, tokenId)
  const record = await readEncrypted(env, key, 'agent-token-index', isAgentTokenIndexRecord)
  if (!record || record.ownerId !== ownerId || record.tokenId !== tokenId) return null
  return { key, record }
}

async function getTokenByIndex(
  env: StoreEnv,
  index: AgentTokenIndexRecord,
): Promise<AgentTokenRecord | null> {
  const token = await readEncrypted(env, index.tokenKey, 'agent-token', isAgentTokenRecord)
  if (!token || token.ownerId !== index.ownerId || token.tokenId !== index.tokenId) return null
  return token
}

async function listIndexes(env: StoreEnv, ownerId: string): Promise<Array<{ key: string; record: AgentTokenIndexRecord }>> {
  const prefix = tokenIndexPrefix(ownerId)
  const indexes: Array<{ key: string; record: AgentTokenIndexRecord }> = []
  let cursor: string | undefined

  do {
    const result = await env.AGENT_AUTH_KV.list({ prefix, cursor, limit: 100 })
    const page = await Promise.all(result.keys.map(async ({ name }) => {
      const record = await readEncrypted(env, name, 'agent-token-index', isAgentTokenIndexRecord)
      return record && record.ownerId === ownerId ? { key: name, record } : null
    }))
    for (const item of page) if (item) indexes.push(item)
    if (result.list_complete) break
    cursor = result.cursor
  } while (cursor)

  return indexes
}

export async function listAgentTokens(env: StoreEnv, ownerId: string): Promise<TokenMetadata[]> {
  const indexes = await listIndexes(env, ownerId)
  const tokens = await Promise.all(indexes.map(({ record }) => getTokenByIndex(env, record)))
  return tokens
    .filter((token): token is AgentTokenRecord => token !== null)
    .map(toTokenMetadata)
    .sort((left, right) => right.createdAt - left.createdAt)
}

export async function createAgentToken(
  env: StoreEnv,
  ownerId: string,
  name: string,
): Promise<{ token: string; metadata: TokenMetadata }> {
  const existing = await listAgentTokens(env, ownerId)
  if (existing.length >= MAX_AGENT_TOKENS_PER_OWNER) throw new TokenLimitError()

  const generated = await generateAgentToken()
  const key = tokenKey(generated.hash)
  const now = Date.now()
  const record: AgentTokenRecord = {
    version: 1,
    tokenId: crypto.randomUUID(),
    ownerId,
    name,
    tokenHint: generated.token.slice(-6),
    permissions: 'full-proxy',
    createdAt: now,
    updatedAt: now,
  }
  const index: AgentTokenIndexRecord = {
    version: 1,
    tokenId: record.tokenId,
    ownerId,
    tokenKey: key,
  }

  await putEncrypted(env, key, 'agent-token', record)
  try {
    await putEncrypted(env, tokenIndexKey(ownerId, record.tokenId), 'agent-token-index', index)
  } catch (error) {
    await env.AGENT_AUTH_KV.delete(key)
    throw error
  }
  return { token: generated.token, metadata: toTokenMetadata(record) }
}

export async function renameAgentToken(
  env: StoreEnv,
  ownerId: string,
  tokenId: string,
  name: string,
): Promise<TokenMetadata | null> {
  const index = await getIndex(env, ownerId, tokenId)
  if (!index) return null
  const token = await getTokenByIndex(env, index.record)
  if (!token) return null
  const updated: AgentTokenRecord = { ...token, name, updatedAt: Date.now() }
  await putEncrypted(env, index.record.tokenKey, 'agent-token', updated)
  return toTokenMetadata(updated)
}

export async function rotateAgentToken(
  env: StoreEnv,
  ownerId: string,
  tokenId: string,
): Promise<{ token: string; metadata: TokenMetadata } | null> {
  const currentIndex = await getIndex(env, ownerId, tokenId)
  if (!currentIndex) return null
  const currentToken = await getTokenByIndex(env, currentIndex.record)
  if (!currentToken) return null

  const generated = await generateAgentToken()
  const newTokenKey = tokenKey(generated.hash)
  const updated: AgentTokenRecord = {
    ...currentToken,
    tokenHint: generated.token.slice(-6),
    updatedAt: Date.now(),
  }
  const newIndex: AgentTokenIndexRecord = { ...currentIndex.record, tokenKey: newTokenKey }

  await putEncrypted(env, newTokenKey, 'agent-token', updated)
  try {
    await putEncrypted(env, currentIndex.key, 'agent-token-index', newIndex)
  } catch (error) {
    await env.AGENT_AUTH_KV.delete(newTokenKey)
    throw error
  }
  await env.AGENT_AUTH_KV.delete(currentIndex.record.tokenKey)
  return { token: generated.token, metadata: toTokenMetadata(updated) }
}

export async function revokeAgentToken(env: StoreEnv, ownerId: string, tokenId: string): Promise<boolean> {
  const index = await getIndex(env, ownerId, tokenId)
  if (!index) return false
  await env.AGENT_AUTH_KV.delete(index.record.tokenKey)
  await env.AGENT_AUTH_KV.delete(index.key)
  return true
}

export async function deleteOwnerCredentials(env: StoreEnv, ownerId: string): Promise<void> {
  const indexes = await listIndexes(env, ownerId)
  await Promise.all(indexes.map(({ record }) => env.AGENT_AUTH_KV.delete(record.tokenKey)))
  await Promise.all(indexes.map(({ key }) => env.AGENT_AUTH_KV.delete(key)))
  await env.AGENT_AUTH_KV.delete(accountKey(ownerId))
  await env.AGENT_AUTH_KV.delete(cooldownKey(ownerId))
}

export async function getReauthCooldown(env: StoreEnv, ownerId: string): Promise<number> {
  const record = await readEncrypted(
    env,
    cooldownKey(ownerId),
    'reauth-cooldown',
    isReauthCooldownRecord,
  )
  if (!record) return 0
  if (record.ownerId !== ownerId) throw new EncryptedRecordError()
  return Math.max(0, Math.ceil((record.until - Date.now()) / 1000))
}

export async function setReauthCooldown(env: StoreEnv, ownerId: string): Promise<void> {
  const until = Date.now() + REAUTH_COOLDOWN_SECONDS * 1000
  const key = cooldownKey(ownerId)
  const encrypted = await encryptJson(
    env.AGENT_CREDENTIAL_ROOT_KEY_V1,
    env.APP_ENV,
    'reauth-cooldown',
    key,
    { version: 1, ownerId, until },
  )
  await env.AGENT_AUTH_KV.put(key, encrypted, { expirationTtl: 60 })
}

export async function clearReauthCooldown(env: StoreEnv, ownerId: string): Promise<void> {
  await env.AGENT_AUTH_KV.delete(cooldownKey(ownerId))
}
