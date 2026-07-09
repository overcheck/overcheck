import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import { getPublicStatusPageData, WINDOWS, type Window } from '../status-page/public-data.js'
import { sendBadRequest, sendNotFound } from './http-errors.js'

function isWindow(value: unknown): value is Window {
  return typeof value === 'string' && (WINDOWS as string[]).includes(value)
}

export function registerPublicStatusPageRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  checkRetentionDays: number,
): void {
  app.get(
    '/public/status-pages/:slug',
    async (
      request: FastifyRequest<{ Params: { slug: string }; Querystring: { window?: string } }>,
      reply,
    ) => {
      const windowParam = request.query.window ?? '7d'
      if (!isWindow(windowParam)) {
        return sendBadRequest(reply, `window must be one of: ${WINDOWS.join(', ')}`)
      }

      const data = await getPublicStatusPageData(
        db,
        request.params.slug,
        windowParam,
        checkRetentionDays,
      )
      if (!data) return sendNotFound(reply, `status page '${request.params.slug}' not found`)
      return data
    },
  )
}
