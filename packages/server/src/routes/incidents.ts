import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import { requireRole } from '../auth.js'
import type { Database } from '../db/client.js'
import { sendNotFound } from './http-errors.js'

const IncidentStatus = Type.Union([
  Type.Literal('investigating'),
  Type.Literal('identified'),
  Type.Literal('monitoring'),
  Type.Literal('resolved'),
])

const IncidentBody = Type.Object({
  title: Type.String({ minLength: 1 }),
  status: Type.Optional(IncidentStatus),
  affectedMonitorIds: Type.Optional(Type.Array(Type.Integer())),
})

const IncidentUpdateBody = Type.Partial(
  Type.Object({
    title: Type.String({ minLength: 1 }),
    status: IncidentStatus,
    affectedMonitorIds: Type.Array(Type.Integer()),
  }),
)

const IncidentUpdateCreateBody = Type.Object({
  body: Type.String({ minLength: 1 }),
})

const IncidentUpdateResponse = Type.Object({
  id: Type.Number(),
  body: Type.String(),
  createdAt: Type.String(),
})

const IncidentResponse = Type.Object({
  id: Type.Number(),
  statusPageId: Type.Number(),
  title: Type.String(),
  status: IncidentStatus,
  affectedMonitorIds: Type.Array(Type.Number()),
  startedAt: Type.String(),
  updates: Type.Array(IncidentUpdateResponse),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

const ParamsWithStatusPageId = Type.Object({ statusPageId: Type.Integer() })
const ParamsWithIncidentId = Type.Object({ statusPageId: Type.Integer(), id: Type.Integer() })
const ParamsWithUpdateId = Type.Object({
  statusPageId: Type.Integer(),
  id: Type.Integer(),
  updateId: Type.Integer(),
})

type IncidentBodyT = Static<typeof IncidentBody>
type IncidentUpdateBodyT = Static<typeof IncidentUpdateBody>
type IncidentUpdateCreateBodyT = Static<typeof IncidentUpdateCreateBody>

async function fetchAffectedMonitorIds(
  db: Kysely<Database>,
  incidentId: number,
): Promise<number[]> {
  const rows = await db
    .selectFrom('incident_monitors')
    .select('monitor_id')
    .where('incident_id', '=', incidentId)
    .execute()
  return rows.map((r) => r.monitor_id)
}

async function replaceAffectedMonitors(
  db: Kysely<Database>,
  incidentId: number,
  monitorIds: number[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('incident_monitors').where('incident_id', '=', incidentId).execute()
    if (monitorIds.length > 0) {
      await trx
        .insertInto('incident_monitors')
        .values(monitorIds.map((monitorId) => ({ incident_id: incidentId, monitor_id: monitorId })))
        .execute()
    }
  })
}

async function serializeIncident(
  db: Kysely<Database>,
  row: {
    id: number
    status_page_id: number
    title: string
    status: string
    started_at: Date
    created_at: Date
    updated_at: Date
  },
) {
  const updates = await db
    .selectFrom('incident_updates')
    .selectAll()
    .where('incident_id', '=', row.id)
    .orderBy('created_at', 'desc')
    .execute()

  return {
    id: row.id,
    statusPageId: row.status_page_id,
    title: row.title,
    status: row.status as Static<typeof IncidentStatus>,
    affectedMonitorIds: await fetchAffectedMonitorIds(db, row.id),
    startedAt: row.started_at.toISOString(),
    updates: updates.map((u) => ({
      id: u.id,
      body: u.body,
      createdAt: u.created_at.toISOString(),
    })),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

async function findStatusPageOrNotFound(
  db: Kysely<Database>,
  statusPageId: number,
): Promise<{ id: number } | null> {
  const row = await db
    .selectFrom('status_pages')
    .select('id')
    .where('id', '=', statusPageId)
    .executeTakeFirst()
  return row ?? null
}

export function registerIncidentRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get(
    '/status-pages/:statusPageId/incidents',
    {
      preHandler: [requireRole('viewer')],
      schema: { params: ParamsWithStatusPageId, response: { 200: Type.Array(IncidentResponse) } },
    },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithStatusPageId> }>, reply) => {
      const page = await findStatusPageOrNotFound(db, request.params.statusPageId)
      if (!page) return sendNotFound(reply, `status page ${request.params.statusPageId} not found`)

      const rows = await db
        .selectFrom('incidents')
        .selectAll()
        .where('status_page_id', '=', page.id)
        .orderBy('started_at', 'desc')
        .execute()
      return Promise.all(rows.map((row) => serializeIncident(db, row)))
    },
  )

  app.post(
    '/status-pages/:statusPageId/incidents',
    {
      preHandler: [requireRole('editor')],
      schema: {
        params: ParamsWithStatusPageId,
        body: IncidentBody,
        response: { 201: IncidentResponse },
      },
    },
    async (
      request: FastifyRequest<{
        Params: Static<typeof ParamsWithStatusPageId>
        Body: IncidentBodyT
      }>,
      reply,
    ) => {
      const page = await findStatusPageOrNotFound(db, request.params.statusPageId)
      if (!page) return sendNotFound(reply, `status page ${request.params.statusPageId} not found`)

      const row = await db
        .insertInto('incidents')
        .values({
          status_page_id: page.id,
          title: request.body.title,
          status: request.body.status ?? 'investigating',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      if (request.body.affectedMonitorIds?.length) {
        await replaceAffectedMonitors(db, row.id, request.body.affectedMonitorIds)
      }

      reply.code(201)
      return serializeIncident(db, row)
    },
  )

  app.patch(
    '/status-pages/:statusPageId/incidents/:id',
    {
      preHandler: [requireRole('editor')],
      schema: {
        params: ParamsWithIncidentId,
        body: IncidentUpdateBody,
        response: { 200: IncidentResponse },
      },
    },
    async (
      request: FastifyRequest<{
        Params: Static<typeof ParamsWithIncidentId>
        Body: IncidentUpdateBodyT
      }>,
      reply,
    ) => {
      const row = await db
        .updateTable('incidents')
        .set({
          ...(request.body.title !== undefined && { title: request.body.title }),
          ...(request.body.status !== undefined && { status: request.body.status }),
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', request.params.id)
        .where('status_page_id', '=', request.params.statusPageId)
        .returningAll()
        .executeTakeFirst()
      if (!row) return sendNotFound(reply, `incident ${request.params.id} not found`)

      if (request.body.affectedMonitorIds !== undefined) {
        await replaceAffectedMonitors(db, row.id, request.body.affectedMonitorIds)
      }

      return serializeIncident(db, row)
    },
  )

  app.delete(
    '/status-pages/:statusPageId/incidents/:id',
    {
      preHandler: [requireRole('editor')],
      schema: { params: ParamsWithIncidentId, response: { 204: Type.Null() } },
    },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithIncidentId> }>, reply) => {
      const result = await db
        .deleteFrom('incidents')
        .where('id', '=', request.params.id)
        .where('status_page_id', '=', request.params.statusPageId)
        .executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        return sendNotFound(reply, `incident ${request.params.id} not found`)
      }
      reply.code(204)
    },
  )

  app.post(
    '/status-pages/:statusPageId/incidents/:id/updates',
    {
      preHandler: [requireRole('editor')],
      schema: {
        params: ParamsWithIncidentId,
        body: IncidentUpdateCreateBody,
        response: { 201: IncidentUpdateResponse },
      },
    },
    async (
      request: FastifyRequest<{
        Params: Static<typeof ParamsWithIncidentId>
        Body: IncidentUpdateCreateBodyT
      }>,
      reply,
    ) => {
      const incident = await db
        .selectFrom('incidents')
        .select('id')
        .where('id', '=', request.params.id)
        .where('status_page_id', '=', request.params.statusPageId)
        .executeTakeFirst()
      if (!incident) return sendNotFound(reply, `incident ${request.params.id} not found`)

      const row = await db
        .insertInto('incident_updates')
        .values({ incident_id: incident.id, body: request.body.body })
        .returningAll()
        .executeTakeFirstOrThrow()

      reply.code(201)
      return { id: row.id, body: row.body, createdAt: row.created_at.toISOString() }
    },
  )

  app.delete(
    '/status-pages/:statusPageId/incidents/:id/updates/:updateId',
    {
      preHandler: [requireRole('editor')],
      schema: { params: ParamsWithUpdateId, response: { 204: Type.Null() } },
    },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithUpdateId> }>, reply) => {
      const incident = await db
        .selectFrom('incidents')
        .select('id')
        .where('id', '=', request.params.id)
        .where('status_page_id', '=', request.params.statusPageId)
        .executeTakeFirst()
      if (!incident) return sendNotFound(reply, `incident ${request.params.id} not found`)

      const result = await db
        .deleteFrom('incident_updates')
        .where('id', '=', request.params.updateId)
        .where('incident_id', '=', incident.id)
        .executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        return sendNotFound(reply, `incident update ${request.params.updateId} not found`)
      }
      reply.code(204)
    },
  )
}
