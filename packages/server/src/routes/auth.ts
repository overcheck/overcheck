import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import { createFirstAdminUser, createSession, hashToken, verifyPassword } from '../auth.js'
import type { Database } from '../db/client.js'
import { sendForbidden, sendUnauthorized } from './http-errors.js'

const Credentials = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
})

const AuthUserResponse = Type.Object({
  id: Type.Number(),
  email: Type.String(),
  role: Type.Union([Type.Literal('admin'), Type.Literal('editor'), Type.Literal('viewer')]),
})

const SessionResponse = Type.Object({
  user: AuthUserResponse,
  token: Type.String(),
})

type CredentialsT = Static<typeof Credentials>

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim() || undefined
}

export function registerAuthPublicRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  sessionTtlHours: number,
): void {
  app.post(
    '/auth/register',
    { schema: { body: Credentials, response: { 201: SessionResponse } } },
    async (request: FastifyRequest<{ Body: CredentialsT }>, reply) => {
      const user = await createFirstAdminUser(db, request.body.email, request.body.password)
      if (!user) {
        return sendForbidden(reply, 'registration is closed; ask an admin to create your account')
      }

      const token = await createSession(db, user.id, sessionTtlHours)
      reply.code(201)
      return { user, token }
    },
  )

  app.post(
    '/auth/login',
    { schema: { body: Credentials, response: { 200: SessionResponse } } },
    async (request: FastifyRequest<{ Body: CredentialsT }>, reply) => {
      const body = request.body
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', body.email)
        .executeTakeFirst()

      if (!user || !verifyPassword(body.password, user.password_hash)) {
        return sendUnauthorized(reply, 'invalid email or password')
      }

      const token = await createSession(db, user.id, sessionTtlHours)
      return { user: { id: user.id, email: user.email, role: user.role }, token }
    },
  )
}

export function registerAuthProtectedRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.post(
    '/auth/logout',
    { schema: { response: { 204: Type.Null() } } },
    async (request, reply) => {
      const token = extractBearerToken(request.headers.authorization)
      if (token) {
        await db.deleteFrom('sessions').where('token_hash', '=', hashToken(token)).execute()
      }
      reply.code(204)
    },
  )

  app.get('/auth/me', { schema: { response: { 200: AuthUserResponse } } }, async (request) => {
    return request.user
  })
}
