import type { StoredCookie } from './types'

export interface CookieMergeResult {
  cookieJar: StoredCookie[]
  changed: boolean
  tokenTouched: boolean
  tokenDeleted: boolean
}

interface ParsedSetCookie {
  cookie: StoredCookie
  deleteCookie: boolean
}

export function getSetCookieHeaders(headers: Headers): string[] {
  return headers.getSetCookie()
}

export function parseRequestCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header) return cookies

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name) cookies.set(name, value)
  }
  return cookies
}

function defaultCookiePath(pathname: string): string {
  if (!pathname.startsWith('/') || pathname === '/') return '/'
  const lastSlash = pathname.lastIndexOf('/')
  return lastSlash <= 0 ? '/' : pathname.slice(0, lastSlash)
}

function parseSetCookie(header: string, responseUrl: URL, now: number): ParsedSetCookie | null {
  const parts = header.split(';')
  const first = parts.shift()?.trim() ?? ''
  const separator = first.indexOf('=')
  if (separator <= 0) return null

  const name = first.slice(0, separator).trim()
  const value = first.slice(separator + 1).trim()
  if (!name) return null

  let path = defaultCookiePath(responseUrl.pathname)
  let expiresAt: number | null = null
  let maxAge: number | null = null
  let secure = false
  let httpOnly = false
  let sameSite: string | null = null

  for (const rawAttribute of parts) {
    const attribute = rawAttribute.trim()
    const attributeSeparator = attribute.indexOf('=')
    const key = (attributeSeparator < 0 ? attribute : attribute.slice(0, attributeSeparator)).trim().toLowerCase()
    const attributeValue = attributeSeparator < 0 ? '' : attribute.slice(attributeSeparator + 1).trim()

    if (key === 'path' && attributeValue.startsWith('/')) path = attributeValue
    if (key === 'expires') {
      const parsed = Date.parse(attributeValue)
      if (Number.isFinite(parsed)) expiresAt = parsed
    }
    if (key === 'max-age' && /^-?\d+$/.test(attributeValue)) maxAge = Number(attributeValue)
    if (key === 'secure') secure = true
    if (key === 'httponly') httpOnly = true
    if (key === 'samesite' && attributeValue) sameSite = attributeValue
  }

  if (maxAge !== null) expiresAt = now + maxAge * 1000
  const deleteCookie = value === '' || (expiresAt !== null && expiresAt <= now)
  return {
    cookie: { name, value, path, expiresAt, secure, httpOnly, sameSite },
    deleteCookie,
  }
}

function cookieIdentity(cookie: Pick<StoredCookie, 'name' | 'path'>): string {
  return `${cookie.name}\u0000${cookie.path}`
}

function sortedCookieJar(cookieJar: StoredCookie[]): StoredCookie[] {
  return [...cookieJar].sort((left, right) => cookieIdentity(left).localeCompare(cookieIdentity(right)))
}

function cookieJarsEqual(left: StoredCookie[], right: StoredCookie[]): boolean {
  return JSON.stringify(sortedCookieJar(left)) === JSON.stringify(sortedCookieJar(right))
}

export function mergeSetCookieHeaders(
  currentJar: StoredCookie[],
  headers: string[],
  responseUrl: URL,
  now = Date.now(),
): CookieMergeResult {
  const original = currentJar.filter((cookie) => cookie.expiresAt === null || cookie.expiresAt > now)
  const byIdentity = new Map(original.map((cookie) => [cookieIdentity(cookie), cookie]))
  let tokenTouched = false
  let tokenDeleted = false

  for (const header of headers) {
    const parsed = parseSetCookie(header, responseUrl, now)
    if (!parsed) continue
    const identity = cookieIdentity(parsed.cookie)
    if (parsed.cookie.name === 'token') {
      tokenTouched = true
      if (parsed.deleteCookie) tokenDeleted = true
    }
    if (parsed.deleteCookie) byIdentity.delete(identity)
    else byIdentity.set(identity, parsed.cookie)
  }

  const cookieJar = sortedCookieJar([...byIdentity.values()])
  return {
    cookieJar,
    // Expired entries are a real jar change too. Persist their removal once so
    // every later request does not repeatedly carry stale encrypted entries.
    changed: !cookieJarsEqual(currentJar, cookieJar),
    tokenTouched,
    tokenDeleted,
  }
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === '/') return true
  if (!requestPath.startsWith(cookiePath)) return false
  if (requestPath.length === cookiePath.length) return true
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'
}

export function buildCookieHeader(cookieJar: StoredCookie[], requestUrl: URL, now = Date.now()): string {
  return cookieJar
    .filter((cookie) => (cookie.expiresAt === null || cookie.expiresAt > now)
      && (!cookie.secure || requestUrl.protocol === 'https:')
      && pathMatches(cookie.path, requestUrl.pathname))
    .sort((left, right) => right.path.length - left.path.length)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

export function findTokenCookie(cookieJar: StoredCookie[], now = Date.now()): StoredCookie | null {
  return cookieJar.find((cookie) => cookie.name === 'token'
    && cookie.value !== ''
    && (cookie.expiresAt === null || cookie.expiresAt > now)) ?? null
}

export function rewriteBrowserSetCookie(header: string): string {
  return header.replace(/;\s*domain=[^;]*/gi, '')
}
