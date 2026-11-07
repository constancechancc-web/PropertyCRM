import bcrypt from 'bcryptjs'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const COOKIE = 'crm_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 11)
}

export function checkPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash)
}

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 32) return s
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set (at least 32 characters)')
  }
  return 'local-development-only-secret-change-me-please'
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

export interface TokenData {
  uid: string
  email: string
  exp: number
}

export function makeToken(uid: string, email: string): string {
  const body = b64(JSON.stringify({ uid, email, exp: Math.floor(Date.now() / 1000) + MAX_AGE }))
  return `${body}.${sign(body)}`
}

export function readToken(token: string | undefined): TokenData | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(sign(body))
  const got = Buffer.from(sig)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenData
    if (!data.exp || data.exp < Date.now() / 1000) return null
    return data
  } catch {
    return null
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`
}

export function clearCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}
