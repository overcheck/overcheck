import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import { renderNotFoundHtml, renderStatusPageHtml } from '../status-page/html.js'
import { getPublicStatusPageData, WINDOWS, type Window } from '../status-page/public-data.js'

function isWindow(value: unknown): value is Window {
  return typeof value === 'string' && (WINDOWS as string[]).includes(value)
}

/**
 * Server-rendered HTML for a status page. Calls the same data-assembly function as the
 * public JSON API (never queries the DB directly) so there is one source of truth for
 * what a status page shows publicly.
 */
export function registerStatusPageHtmlRoute(
  app: FastifyInstance,
  db: Kysely<Database>,
  checkRetentionDays: number,
): void {
  app.get(
    '/status/:slug',
    async (
      request: FastifyRequest<{ Params: { slug: string }; Querystring: { window?: string } }>,
      reply,
    ) => {
      const windowParam = request.query.window ?? '7d'
      const window: Window = isWindow(windowParam) ? windowParam : '7d'

      const data = await getPublicStatusPageData(
        db,
        request.params.slug,
        window,
        checkRetentionDays,
      )
      if (!data) {
        reply.code(404).type('text/html')
        return renderNotFoundHtml(request.params.slug)
      }

      reply.type('text/html')
      return renderStatusPageHtml(data, request.hostname)
    },
  )
}
