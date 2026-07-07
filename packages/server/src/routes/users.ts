import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Kysely, Selectable } from 'kysely'
import { hashPassword, requireRole } from '../auth.js'
import type { Database, UserTable } from '../db/client.js'
import { sendBadRequest, sendConflict, sendForbidden, sendNotFound } from './http-errors.js'

const UNIQUE_VIOLATION = '23505'

const Role = Type.Union([Type.Literal('admin'), Type.Literal('editor'), Type.Literal('viewer')])

const UserBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  role: Role,
})

const UserUpdateBody = Type.Object({
  email: Type.Optional(Type.String({ format: 'email' })),
  password: Type.Optional(Type.String({ minLength: 8 })),
  role: Type.Optional(Role),
})

const UserResponse = Type.Object({
  id: Type.Number(),
  email: Type.String(),
  role: Role,
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

const ParamsWithId = Type.Object({ id: Type.Integer() })

type UserBodyT = Static<typeof UserBody>
type UserUpdateBodyT = Static<typeof UserUpdateBody>

function rowToApi(row: Selectable<UserTable>): Static<typeof UserResponse> {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

async function countAdmins(db: Kysely<Database>): Promise<number> {
  const admins = await db.selectFrom('users').select('id').where('role', '=', 'admin').execute()
  return admins.length
}

export function registerUserRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get(
    '/users',
    { preHandler: [requireRole('admin')], schema: { response: { 200: Type.Array(UserResponse) } } },
    async () => {
      const rows = await db.selectFrom('users').selectAll().orderBy('id').execute()
      return rows.map(rowToApi)
    },
  )

  app.post(
    '/users',
    {
      preHandler: [requireRole('admin')],
      schema: { body: UserBody, response: { 201: UserResponse } },
    },
    async (request: FastifyRequest<{ Body: UserBodyT }>, reply) => {
      const body = request.body
      let row
      try {
        row = await db
          .insertInto('users')
          .values({
            email: body.email,
            password_hash: hashPassword(body.password),
            role: body.role,
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          return sendConflict(reply, `email "${body.email}" is already in use`)
        }
        throw err
      }
      reply.code(201)
      return rowToApi(row)
    },
  )

  function assertSelfOrAdmin(
    request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>,
    reply: FastifyReply,
  ): boolean {
    if (request.user.role !== 'admin' && request.user.id !== request.params.id) {
      sendForbidden(reply, 'admin role required to access another user')
      return false
    }
    return true
  }

  app.get(
    '/users/:id',
    { schema: { params: ParamsWithId, response: { 200: UserResponse } } },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      if (!assertSelfOrAdmin(request, reply)) return

      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!row) return sendNotFound(reply, `user ${request.params.id} not found`)
      return rowToApi(row)
    },
  )

  app.patch(
    '/users/:id',
    { schema: { params: ParamsWithId, body: UserUpdateBody, response: { 200: UserResponse } } },
    async (
      request: FastifyRequest<{ Params: Static<typeof ParamsWithId>; Body: UserUpdateBodyT }>,
      reply,
    ) => {
      if (!assertSelfOrAdmin(request, reply)) return

      const body = request.body
      if (body.role !== undefined && request.user.role !== 'admin') {
        return sendForbidden(reply, 'admin role required to change role')
      }

      const existing = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!existing) return sendNotFound(reply, `user ${request.params.id} not found`)

      if (body.role !== undefined && existing.role === 'admin' && body.role !== 'admin') {
        const adminCount = await countAdmins(db)
        if (adminCount <= 1) {
          return sendBadRequest(reply, 'cannot demote the last remaining admin')
        }
      }

      let row
      try {
        row = await db
          .updateTable('users')
          .set({
            ...(body.email !== undefined && { email: body.email }),
            ...(body.password !== undefined && { password_hash: hashPassword(body.password) }),
            ...(body.role !== undefined && { role: body.role }),
            updated_at: new Date().toISOString(),
          })
          .where('id', '=', request.params.id)
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          return sendConflict(reply, `email "${body.email}" is already in use`)
        }
        throw err
      }

      return rowToApi(row)
    },
  )

  app.delete(
    '/users/:id',
    {
      preHandler: [requireRole('admin')],
      schema: { params: ParamsWithId, response: { 204: Type.Null() } },
    },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const existing = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!existing) return sendNotFound(reply, `user ${request.params.id} not found`)

      if (existing.role === 'admin') {
        const adminCount = await countAdmins(db)
        if (adminCount <= 1) {
          return sendBadRequest(reply, 'cannot delete the last remaining admin')
        }
      }

      await db.deleteFrom('users').where('id', '=', request.params.id).execute()
      reply.code(204)
    },
  )
}
