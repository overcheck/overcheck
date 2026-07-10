import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from './db/client.js'
import { sendForbidden, sendUnauthorized } from './routes/http-errors.js'

export const SESSION_COOKIE_NAME = 'session'

export type UserRole = 'admin' | 'editor' | 'viewer'

export interface AuthUser {
  id: number
  email: string
  role: UserRole
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser
  }
}

const SCRYPT_KEY_LENGTH = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH)
  return `${salt.toString('base64')}:${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(':')
  if (!saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(password, salt, SCRYPT_KEY_LENGTH)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 }

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim() || undefined
}

/** Parses a single cookie value out of a raw `Cookie` header. Hand-rolled rather than
 * pulling in `@fastify/cookie` — this app only ever needs to read/write one cookie. */
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    const value = part.slice(eq + 1).trim()
    if (!value) return undefined
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return undefined
}

/** Sets the browser session cookie. `secure` should be true in production (HTTPS) and can
 * be disabled for plain-http local development — see `registerLoginHtmlRoute`'s caller. */
export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  ttlHours: number,
  secure: boolean,
): void {
  const maxAgeSeconds = Math.round(ttlHours * 60 * 60)
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) attrs.push('Secure')
  reply.header('set-cookie', attrs.join('; '))
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  const attrs = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0']
  if (secure) attrs.push('Secure')
  reply.header('set-cookie', attrs.join('; '))
}

/** Extracts the session token from either the Bearer header (CLI/API clients) or the
 * browser session cookie (dashboard), and resolves it to the authenticated user. Shared by
 * `registerSessionAuth` (JSON API — replies 401 on failure) and `registerDashboardAuth`
 * (browser HTML routes — redirects to /login on failure) so both stay in sync. */
export function extractSessionToken(request: FastifyRequest): string | undefined {
  return (
    extractBearerToken(request.headers.authorization) ??
    parseCookie(request.headers.cookie, SESSION_COOKIE_NAME)
  )
}

export async function resolveSessionUser(
  db: Kysely<Database>,
  token: string,
): Promise<AuthUser | null> {
  const session = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['users.id', 'users.email', 'users.role', 'sessions.expires_at'])
    .where('sessions.token_hash', '=', hashToken(token))
    .executeTakeFirst()

  if (!session || session.expires_at.getTime() <= Date.now()) return null
  return { id: session.id, email: session.email, role: session.role }
}

export async function registerSessionAuth(
  app: FastifyInstance,
  db: Kysely<Database>,
): Promise<void> {
  app.addHook('onRequest', async (request, reply: FastifyReply) => {
    const token = extractSessionToken(request)
    if (!token) return sendUnauthorized(reply, 'Authorization bearer token required')

    const user = await resolveSessionUser(db, token)
    if (!user) return sendUnauthorized(reply, 'Invalid or expired session')

    request.user = user
  })
}

/**
 * Same session resolution as `registerSessionAuth`, but for browser-facing dashboard HTML
 * routes: on missing/invalid session it redirects to `/login?next=<original path>` instead
 * of replying with a JSON 401, since there's no API client here to parse that body.
 */
export async function registerDashboardAuth(
  app: FastifyInstance,
  db: Kysely<Database>,
): Promise<void> {
  app.addHook('onRequest', async (request, reply: FastifyReply) => {
    const token = extractSessionToken(request)
    const user = token ? await resolveSessionUser(db, token) : null
    if (!user) {
      const next = encodeURIComponent(request.url)
      return reply.redirect(`/login?next=${next}`)
    }
    request.user = user
  })
}

/**
 * Creates the first admin user if (and only if) no users exist yet — returns null otherwise.
 * Shared by the JSON `/api/auth/register` route and the browser `/login/setup` route so
 * "registration is closed after the first admin" is enforced in exactly one place.
 */
export async function createFirstAdminUser(
  db: Kysely<Database>,
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const existingUser = await db.selectFrom('users').select('id').executeTakeFirst()
  if (existingUser) return null

  const user = await db
    .insertInto('users')
    .values({ email, password_hash: hashPassword(password), role: 'admin' })
    .returningAll()
    .executeTakeFirstOrThrow()
  return { id: user.id, email: user.email, role: user.role }
}

export async function createSession(
  db: Kysely<Database>,
  userId: number,
  ttlHours: number,
): Promise<string> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
  await db
    .insertInto('sessions')
    .values({ user_id: userId, token_hash: hashToken(token), expires_at: expiresAt.toISOString() })
    .execute()
  return token
}

export function requireRole(min: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (ROLE_RANK[request.user.role] < ROLE_RANK[min]) {
      sendForbidden(reply, `${min} role required`)
    }
  }
}
