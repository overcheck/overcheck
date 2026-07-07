import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Kysely, Selectable } from 'kysely'
import type { AlertChannelTable, Database } from '../db/client.js'
import { sendNotFound } from './http-errors.js'

const AlertChannelType = Type.Union([
  Type.Literal('slack'),
  Type.Literal('webhook'),
  Type.Literal('email'),
])

const AlertChannelConfig = Type.Record(Type.String(), Type.Unknown())

// See the comment on MonitorBody in routes/monitors.ts: no schema-level `default` here either,
// for the same reason — it would leak into PATCH bodies via ajv's useDefaults.
const AlertChannelBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  type: AlertChannelType,
  config: AlertChannelConfig,
  enabled: Type.Optional(Type.Boolean()),
})

const AlertChannelUpdateBody = Type.Partial(AlertChannelBody)

const AlertChannelResponse = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  type: AlertChannelType,
  config: AlertChannelConfig,
  enabled: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

const ParamsWithId = Type.Object({ id: Type.Integer() })

type AlertChannelBodyT = Static<typeof AlertChannelBody>
type AlertChannelUpdateBodyT = Static<typeof AlertChannelUpdateBody>

function rowToApi(row: Selectable<AlertChannelTable>): Static<typeof AlertChannelResponse> {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: row.config as Record<string, unknown>,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export function registerAlertChannelRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get(
    '/alert-channels',
    { schema: { response: { 200: Type.Array(AlertChannelResponse) } } },
    async () => {
      const rows = await db.selectFrom('alert_channels').selectAll().orderBy('id').execute()
      return rows.map(rowToApi)
    },
  )

  app.get(
    '/alert-channels/:id',
    { schema: { params: ParamsWithId, response: { 200: AlertChannelResponse } } },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const row = await db
        .selectFrom('alert_channels')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!row) return sendNotFound(reply, `alert channel ${request.params.id} not found`)
      return rowToApi(row)
    },
  )

  app.post(
    '/alert-channels',
    { schema: { body: AlertChannelBody, response: { 201: AlertChannelResponse } } },
    async (request: FastifyRequest<{ Body: AlertChannelBodyT }>, reply) => {
      const body = request.body
      const row = await db
        .insertInto('alert_channels')
        .values({
          name: body.name,
          type: body.type,
          config: JSON.stringify(body.config),
          enabled: body.enabled ?? true,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      reply.code(201)
      return rowToApi(row)
    },
  )

  app.patch(
    '/alert-channels/:id',
    {
      schema: {
        params: ParamsWithId,
        body: AlertChannelUpdateBody,
        response: { 200: AlertChannelResponse },
      },
    },
    async (
      request: FastifyRequest<{
        Params: Static<typeof ParamsWithId>
        Body: AlertChannelUpdateBodyT
      }>,
      reply,
    ) => {
      const body = request.body
      const row = await db
        .updateTable('alert_channels')
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.config !== undefined && { config: JSON.stringify(body.config) }),
          ...(body.enabled !== undefined && { enabled: body.enabled }),
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirst()
      if (!row) return sendNotFound(reply, `alert channel ${request.params.id} not found`)
      return rowToApi(row)
    },
  )

  app.delete(
    '/alert-channels/:id',
    { schema: { params: ParamsWithId, response: { 204: Type.Null() } } },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const result = await db
        .deleteFrom('alert_channels')
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        return sendNotFound(reply, `alert channel ${request.params.id} not found`)
      }
      reply.code(204)
    },
  )
}
