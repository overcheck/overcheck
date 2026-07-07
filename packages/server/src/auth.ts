import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from './db/client.js'
import { sendForbidden, sendUnauthorized } from './routes/http-errors.js'

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

export async function registerSessionAuth(
  app: FastifyInstance,
  db: Kysely<Database>,
): Promise<void> {
  app.addHook('onRequest', async (request, reply: FastifyReply) => {
    const token = extractBearerToken(request.headers.authorization)
    if (!token) return sendUnauthorized(reply, 'Authorization bearer token required')

    const session = await db
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.user_id')
      .select(['users.id', 'users.email', 'users.role', 'sessions.expires_at'])
      .where('sessions.token_hash', '=', hashToken(token))
      .executeTakeFirst()

    if (!session || session.expires_at.getTime() <= Date.now()) {
      return sendUnauthorized(reply, 'Invalid or expired session')
    }

    request.user = { id: session.id, email: session.email, role: session.role }
  })
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
