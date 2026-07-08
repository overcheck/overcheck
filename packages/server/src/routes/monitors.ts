import { Type, type Static } from '@sinclair/typebox'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Kysely, Selectable } from 'kysely'
import { requireRole } from '../auth.js'
import type { CheckScheduler } from '../check-engine/scheduler.js'
import { toMonitor } from '../check-engine/repository.js'
import type { Database, MonitorTable } from '../db/client.js'
import { sendBadRequest, sendConflict, sendNotFound } from './http-errors.js'

const UNIQUE_VIOLATION = '23505'

const MonitorType = Type.Union([
  Type.Literal('http'),
  Type.Literal('tcp'),
  Type.Literal('ping'),
  Type.Literal('keyword'),
])

// Deliberately no schema-level `default`s: Fastify/ajv's useDefaults fills in missing
// properties even on a Type.Partial() PATCH body, which would silently reset a field the
// caller never mentioned back to its "default" instead of leaving it untouched. Defaults are
// applied in the POST handler only, via `?? <default>` on each field.
const MonitorBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  type: MonitorType,
  enabled: Type.Optional(Type.Boolean()),
  intervalSeconds: Type.Integer({ minimum: 10 }),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
  retries: Type.Optional(Type.Integer({ minimum: 0 })),
  degradedAfterMs: Type.Optional(Type.Integer({ minimum: 0 })),
  httpUrl: Type.Optional(Type.String()),
  httpMethod: Type.Optional(Type.String()),
  httpExpectedStatus: Type.Optional(Type.Integer()),
  httpBodyContains: Type.Optional(Type.String()),
  host: Type.Optional(Type.String()),
  port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
})

const MonitorUpdateBody = Type.Partial(MonitorBody)

const MonitorResponse = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  type: MonitorType,
  enabled: Type.Boolean(),
  intervalSeconds: Type.Number(),
  timeoutMs: Type.Number(),
  retries: Type.Number(),
  degradedAfterMs: Type.Number(),
  httpUrl: Type.Union([Type.String(), Type.Null()]),
  httpMethod: Type.String(),
  httpExpectedStatus: Type.Number(),
  httpBodyContains: Type.Union([Type.String(), Type.Null()]),
  host: Type.Union([Type.String(), Type.Null()]),
  port: Type.Union([Type.Number(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

const ParamsWithId = Type.Object({ id: Type.Integer() })

type MonitorBodyT = Static<typeof MonitorBody>
type MonitorUpdateBodyT = Static<typeof MonitorUpdateBody>

interface MergedMonitorFields {
  type: MonitorBodyT['type']
  httpUrl?: string
  httpBodyContains?: string
  host?: string
  port?: number
}

/**
 * Cross-field requirements (which fields a given `type` needs) are enforced here rather than as
 * DB CHECK constraints or a typebox oneOf — see the DB schema's own note on why: it keeps the
 * validation easy to evolve, at the cost of living in application code instead of the schema.
 */
function validateTypeRequirements(fields: MergedMonitorFields, reply: FastifyReply): boolean {
  if ((fields.type === 'http' || fields.type === 'keyword') && !fields.httpUrl) {
    sendBadRequest(reply, `httpUrl is required for type "${fields.type}"`)
    return false
  }
  if (fields.type === 'keyword' && !fields.httpBodyContains) {
    sendBadRequest(reply, 'httpBodyContains is required for type "keyword"')
    return false
  }
  if ((fields.type === 'tcp' || fields.type === 'ping') && !fields.host) {
    sendBadRequest(reply, `host is required for type "${fields.type}"`)
    return false
  }
  if (fields.type === 'tcp' && !fields.port) {
    sendBadRequest(reply, 'port is required for type "tcp"')
    return false
  }
  return true
}

function rowToApi(row: Selectable<MonitorTable>): Static<typeof MonitorResponse> {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    intervalSeconds: row.interval_seconds,
    timeoutMs: row.timeout_ms,
    retries: row.retries,
    degradedAfterMs: row.degraded_after_ms,
    httpUrl: row.http_url,
    httpMethod: row.http_method,
    httpExpectedStatus: row.http_expected_status,
    httpBodyContains: row.http_body_contains,
    host: row.host,
    port: row.port,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export function registerMonitorRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  scheduler: CheckScheduler,
): void {
  app.get(
    '/monitors',
    {
      preHandler: [requireRole('viewer')],
      schema: { response: { 200: Type.Array(MonitorResponse) } },
    },
    async () => {
      const rows = await db.selectFrom('monitors').selectAll().orderBy('id').execute()
      return rows.map(rowToApi)
    },
  )

  app.get(
    '/monitors/:id',
    {
      preHandler: [requireRole('viewer')],
      schema: { params: ParamsWithId, response: { 200: MonitorResponse } },
    },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const row = await db
        .selectFrom('monitors')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!row) return sendNotFound(reply, `monitor ${request.params.id} not found`)
      return rowToApi(row)
    },
  )

  app.post(
    '/monitors',
    {
      preHandler: [requireRole('editor')],
      schema: { body: MonitorBody, response: { 201: MonitorResponse } },
    },
    async (request: FastifyRequest<{ Body: MonitorBodyT }>, reply) => {
      const body = request.body
      if (!validateTypeRequirements(body, reply)) return

      let row
      try {
        row = await db
          .insertInto('monitors')
          .values({
            name: body.name,
            type: body.type,
            enabled: body.enabled ?? true,
            interval_seconds: body.intervalSeconds,
            timeout_ms: body.timeoutMs ?? 5000,
            retries: body.retries ?? 0,
            degraded_after_ms: body.degradedAfterMs ?? 2000,
            http_url: body.httpUrl ?? null,
            http_method: body.httpMethod ?? 'GET',
            http_expected_status: body.httpExpectedStatus ?? 200,
            http_body_contains: body.httpBodyContains ?? null,
            host: body.host ?? null,
            port: body.port ?? null,
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          return sendConflict(reply, `name "${body.name}" is already in use`)
        }
        throw err
      }

      if (row.enabled) scheduler.addMonitor(toMonitor(row))

      reply.code(201)
      return rowToApi(row)
    },
  )

  app.patch(
    '/monitors/:id',
    {
      preHandler: [requireRole('editor')],
      schema: {
        params: ParamsWithId,
        body: MonitorUpdateBody,
        response: { 200: MonitorResponse },
      },
    },
    async (
      request: FastifyRequest<{ Params: Static<typeof ParamsWithId>; Body: MonitorUpdateBodyT }>,
      reply,
    ) => {
      const existing = await db
        .selectFrom('monitors')
        .selectAll()
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!existing) return sendNotFound(reply, `monitor ${request.params.id} not found`)

      const body = request.body
      const merged: MergedMonitorFields = {
        type: body.type ?? existing.type,
        httpUrl: body.httpUrl ?? existing.http_url ?? undefined,
        httpBodyContains: body.httpBodyContains ?? existing.http_body_contains ?? undefined,
        host: body.host ?? existing.host ?? undefined,
        port: body.port ?? existing.port ?? undefined,
      }
      if (!validateTypeRequirements(merged, reply)) return

      let row
      try {
        row = await db
          .updateTable('monitors')
          .set({
            ...(body.name !== undefined && { name: body.name }),
            ...(body.type !== undefined && { type: body.type }),
            ...(body.enabled !== undefined && { enabled: body.enabled }),
            ...(body.intervalSeconds !== undefined && { interval_seconds: body.intervalSeconds }),
            ...(body.timeoutMs !== undefined && { timeout_ms: body.timeoutMs }),
            ...(body.retries !== undefined && { retries: body.retries }),
            ...(body.degradedAfterMs !== undefined && { degraded_after_ms: body.degradedAfterMs }),
            ...(body.httpUrl !== undefined && { http_url: body.httpUrl }),
            ...(body.httpMethod !== undefined && { http_method: body.httpMethod }),
            ...(body.httpExpectedStatus !== undefined && {
              http_expected_status: body.httpExpectedStatus,
            }),
            ...(body.httpBodyContains !== undefined && {
              http_body_contains: body.httpBodyContains,
            }),
            ...(body.host !== undefined && { host: body.host }),
            ...(body.port !== undefined && { port: body.port }),
            updated_at: new Date().toISOString(),
          })
          .where('id', '=', request.params.id)
          .returningAll()
          .executeTakeFirstOrThrow()
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          return sendConflict(reply, `name "${body.name}" is already in use`)
        }
        throw err
      }

      if (row.enabled) {
        scheduler.updateMonitor(toMonitor(row))
      } else {
        scheduler.removeMonitor(row.id)
      }

      return rowToApi(row)
    },
  )

  app.delete(
    '/monitors/:id',
    {
      preHandler: [requireRole('editor')],
      schema: { params: ParamsWithId, response: { 204: Type.Null() } },
    },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const result = await db
        .deleteFrom('monitors')
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        return sendNotFound(reply, `monitor ${request.params.id} not found`)
      }
      scheduler.removeMonitor(request.params.id)
      reply.code(204)
    },
  )

  const AlertChannelIdsBody = Type.Object({
    alertChannelIds: Type.Array(Type.Integer()),
  })
  const AlertChannelIdsResponse = Type.Object({
    alertChannelIds: Type.Array(Type.Integer()),
  })

  app.get(
    '/monitors/:id/alert-channels',
    {
      preHandler: [requireRole('viewer')],
      schema: { params: ParamsWithId, response: { 200: AlertChannelIdsResponse } },
    },
    async (request: FastifyRequest<{ Params: Static<typeof ParamsWithId> }>, reply) => {
      const monitor = await db
        .selectFrom('monitors')
        .select('id')
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!monitor) return sendNotFound(reply, `monitor ${request.params.id} not found`)

      const rows = await db
        .selectFrom('monitor_alert_channels')
        .select('alert_channel_id')
        .where('monitor_id', '=', request.params.id)
        .orderBy('alert_channel_id')
        .execute()

      return { alertChannelIds: rows.map((row) => row.alert_channel_id) }
    },
  )

  app.put(
    '/monitors/:id/alert-channels',
    {
      preHandler: [requireRole('editor')],
      schema: {
        params: ParamsWithId,
        body: AlertChannelIdsBody,
        response: { 200: AlertChannelIdsResponse },
      },
    },
    async (
      request: FastifyRequest<{
        Params: Static<typeof ParamsWithId>
        Body: Static<typeof AlertChannelIdsBody>
      }>,
      reply,
    ) => {
      const monitor = await db
        .selectFrom('monitors')
        .select('id')
        .where('id', '=', request.params.id)
        .executeTakeFirst()
      if (!monitor) return sendNotFound(reply, `monitor ${request.params.id} not found`)

      const alertChannelIds = [...new Set(request.body.alertChannelIds)]
      if (alertChannelIds.length > 0) {
        const existing = await db
          .selectFrom('alert_channels')
          .select('id')
          .where('id', 'in', alertChannelIds)
          .execute()
        const existingIds = new Set(existing.map((row) => row.id))
        const missing = alertChannelIds.find((id) => !existingIds.has(id))
        if (missing !== undefined) {
          return sendBadRequest(reply, `alert channel ${missing} does not exist`)
        }
      }

      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom('monitor_alert_channels')
          .where('monitor_id', '=', request.params.id)
          .execute()
        if (alertChannelIds.length > 0) {
          await trx
            .insertInto('monitor_alert_channels')
            .values(
              alertChannelIds.map((alertChannelId) => ({
                monitor_id: request.params.id,
                alert_channel_id: alertChannelId,
              })),
            )
            .execute()
        }
      })

      return { alertChannelIds }
    },
  )
}
