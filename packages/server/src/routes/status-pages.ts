import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import { sendConflict, sendNotFound } from './http-errors.js'

const StatusPageBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  slug: Type.String({ minLength: 1, pattern: '^[a-z0-9-]+$' }),
  monitorIds: Type.Optional(Type.Array(Type.Integer())),
})

const StatusPageUpdateBody = Type.Partial(StatusPageBody)

const StatusPageResponse = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  slug: Type.String(),
  monitorIds: Type.Array(Type.Number()),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

const ParamsWithId = Type.Object({ id: Type.Integer() })

type StatusPageBodyT = Static<typeof StatusPageBody>
type StatusPageUpdateBodyT = Static<typeof StatusPageUpdateBody>

const UNIQUE_VIOLATION = '23505'

async function fetchMonitorIds(db: Kysely<Database>, statusPageId: number): Promise<number[]> {
  const rows = await db
    .selectFrom('status_page_monitors')
    .select('monitor_id')
    .where('status_page_id', '=', statusPageId)
    .orderBy('sort_order')
    .execute()
  return rows.map((r) => r.monitor_id)
}

async function replaceMonitorAssociations(
  db: Kysely<Database>,
  statusPageId: number,
  monitorIds: number[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('status_page_monitors')
      .where('status_page_id', '=', statusPageId)
      .execute()
    if (monitorIds.length > 0) {
      await trx
        .insertInto('status_page_monitors')
        .values(
          monitorIds.map((monitorId, index) => ({
            status_page_id: statusPageId,
            monitor_id: monitorId,
            sort_order: index,
          })),
        )
        .execute()
    }
  })
}

export function registerStatusPageRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get(
    '/status-pages',
    { schema: { response: { 200: Type.Array(StatusPageResponse) } } },
    async () => {
      const rows = await db.selectFrom('status_pages').selectAll().orderBy('id').execute()
      return Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          monitorIds: await fetchMonitorIds(db, row.id),
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        })),
      )
    },
  )

  app.get(
    '/status-pages/:id',
    { schema: { params: ParamsWithId, response: { 200: StatusPageResponse } } },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const row = await db
        .selectFrom('status_pages')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!row) return sendNotFound(reply, `status page ${request.params.id} not found`)
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        monitorIds: await fetchMonitorIds(db, row.id),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }
    },
  )

  app.post(
    '/status-pages',
    { schema: { body: StatusPageBody, response: { 201: StatusPageResponse } } },
    async (request: FastifyRequest<{ Body: StatusPageBodyT }>, reply: FastifyReply) => {
      const body = request.body
      let row
      try {
        row = await db
          .insertInto('status_pages')
          .values({ name: body.name, slug: body.slug })
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          return sendConflict(reply, `slug "${body.slug}" is already in use`)
        }
        throw err
      }

      if (body.monitorIds?.length) {
        await replaceMonitorAssociations(db, row.id, body.monitorIds)
      }

      reply.code(201)
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        monitorIds: body.monitorIds ?? [],
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }
    },
  )

  app.patch(
    '/status-pages/:id',
    {
      schema: {
        params: ParamsWithId,
        body: StatusPageUpdateBody,
        response: { 200: StatusPageResponse },
      },
    },
    async (
      request: FastifyRequest<{
        Params: Static<typeof ParamsWithId>
        Body: StatusPageUpdateBodyT
      }>,
      reply,
    ) => {
      const body = request.body
      let row
      try {
        row = await db
          .updateTable('status_pages')
          .set({
            ...(body.name !== undefined && { name: body.name }),
            ...(body.slug !== undefined && { slug: body.slug }),
            updated_at: new Date().toISOString(),
          })
          .where('id', '=', request.params.id)
          .returningAll()
          .executeTakeFirst()
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          return sendConflict(reply, `slug "${body.slug}" is already in use`)
        }
        throw err
      }
      if (!row) return sendNotFound(reply, `status page ${request.params.id} not found`)

      if (body.monitorIds !== undefined) {
        await replaceMonitorAssociations(db, row.id, body.monitorIds)
      }

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        monitorIds: await fetchMonitorIds(db, row.id),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }
    },
  )

  app.delete(
    '/status-pages/:id',
    { schema: { params: ParamsWithId, response: { 204: Type.Null() } } },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const result = await db
        .deleteFrom('status_pages')
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        return sendNotFound(reply, `status page ${request.params.id} not found`)
      }
      reply.code(204)
    },
  )
}
