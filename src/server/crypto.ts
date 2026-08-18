import {
  AGENT_TOKEN_PREFIX,
  type EncryptedEnvelope,
  isEncryptedEnvelope,
} from './types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const MANAGEMENT_VALUE_PREFIX = 'kzm_v1_'

type Validator<T> = (value: unknown) => value is T

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export class CryptoConfigurationError extends Error {
  constructor() {
    super('Credential encryption is not configured')
    this.name = 'CryptoConfigurationError'
  }
}

export class EncryptedRecordError extends Error {
  constructor() {
    super('Encrypted credential record is invalid')
    this.name = 'EncryptedRecordError'
  }
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(`${normalized}${padding}`)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function decodeRootSecret(value: string | undefined): Uint8Array {
  try {
    if (typeof value !== 'string') throw new CryptoConfigurationError()
    const normalized = value.trim()
    if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) throw new CryptoConfigurationError()
    const bytes = decodeBase64Url(normalized)
    if (bytes.byteLength !== 32) throw new CryptoConfigurationError()
    return bytes
  } catch (error) {
    if (error instanceof CryptoConfigurationError) throw error
    throw new CryptoConfigurationError()
  }
}

async function deriveKey(
  rootSecret: string | undefined,
  appEnv: string,
  purpose: string,
  algorithm: AesKeyGenParams | HmacImportParams,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const rootKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(decodeRootSecret(rootSecret)),
    'HKDF',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(`kzmall-plus|${appEnv}|v1`),
      info: encoder.encode(purpose),
    },
    rootKey,
    algorithm,
    false,
    usages,
  )
}

function aad(appEnv: string, recordType: string, recordKey: string): Uint8Array {
  return encoder.encode(`kzmall-plus|${appEnv}|${recordType}|${recordKey}|v1`)
}

export async function encryptJson(
  rootSecret: string | undefined,
  appEnv: string,
  recordType: string,
  recordKey: string,
  value: unknown,
): Promise<string> {
  const key = await deriveKey(
    rootSecret,
    appEnv,
    `aes-gcm:${recordType}`,
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad(appEnv, recordType, recordKey)),
      tagLength: 128,
    },
    key,
    plaintext,
  )
  const envelope: EncryptedEnvelope = {
    version: 1,
    kid: 'v1',
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  }
  return JSON.stringify(envelope)
}

export async function decryptJson<T>(
  rootSecret: string | undefined,
  appEnv: string,
  recordType: string,
  recordKey: string,
  serialized: string,
  validate: Validator<T>,
): Promise<T> {
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!isEncryptedEnvelope(parsed)) throw new EncryptedRecordError()
    const key = await deriveKey(
      rootSecret,
      appEnv,
      `aes-gcm:${recordType}`,
      { name: 'AES-GCM', length: 256 },
      ['encrypt', 'decrypt'],
    )
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(decodeBase64Url(parsed.iv)),
        additionalData: toArrayBuffer(aad(appEnv, recordType, recordKey)),
        tagLength: 128,
      },
      key,
      toArrayBuffer(decodeBase64Url(parsed.ciphertext)),
    )
    const value: unknown = JSON.parse(decoder.decode(plaintext))
    if (!validate(value)) throw new EncryptedRecordError()
    return value
  } catch (error) {
    if (error instanceof CryptoConfigurationError) throw error
    throw new EncryptedRecordError()
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().normalize('NFC')
}

export async function deriveOwnerId(rootSecret: string | undefined, appEnv: string, username: string): Promise<string> {
  const key = await deriveKey(
    rootSecret,
    appEnv,
    'owner-id:hmac-sha256',
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    ['sign', 'verify'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(normalizeUsername(username)))
  return encodeBase64Url(new Uint8Array(signature))
}

export async function hashAgentToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return encodeBase64Url(new Uint8Array(digest))
}

export async function generateAgentToken(): Promise<{ token: string; hash: string }> {
  const random = crypto.getRandomValues(new Uint8Array(32))
  const token = `${AGENT_TOKEN_PREFIX}${encodeBase64Url(random)}`
  return { token, hash: await hashAgentToken(token) }
}

export async function sealCompactJson(
  rootSecret: string | undefined,
  appEnv: string,
  recordType: string,
  recordKey: string,
  value: unknown,
): Promise<string> {
  const envelope = await encryptJson(rootSecret, appEnv, recordType, recordKey, value)
  return `${MANAGEMENT_VALUE_PREFIX}${encodeBase64Url(encoder.encode(envelope))}`
}

export async function openCompactJson<T>(
  rootSecret: string | undefined,
  appEnv: string,
  recordType: string,
  recordKey: string,
  value: string,
  validate: Validator<T>,
): Promise<T> {
  if (!value.startsWith(MANAGEMENT_VALUE_PREFIX)) throw new EncryptedRecordError()
  let envelope: string
  try {
    envelope = decoder.decode(decodeBase64Url(value.slice(MANAGEMENT_VALUE_PREFIX.length)))
  } catch {
    throw new EncryptedRecordError()
  }
  return decryptJson(rootSecret, appEnv, recordType, recordKey, envelope, validate)
}
