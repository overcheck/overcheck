import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { registerApiKeyAuth } from './auth.js'
import type { CheckScheduler } from './check-engine/scheduler.js'
import type { Database } from './db/client.js'
import { registerAlertChannelRoutes } from './routes/alert-channels.js'
import { registerHealthRoute } from './routes/health.js'
import { registerMonitorRoutes } from './routes/monitors.js'
import { registerStatusPageRoutes } from './routes/status-pages.js'

export async function buildApp(
  db: Kysely<Database>,
  scheduler: CheckScheduler,
  apiKey: string,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  await app.register(swagger, {
    openapi: {
      info: { title: 'Overcheck API', version: '0.1.0' },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/api/docs' })

  registerHealthRoute(app, db)

  await app.register(
    async (api) => {
      await registerApiKeyAuth(api, apiKey)
      registerMonitorRoutes(api, db, scheduler)
      registerAlertChannelRoutes(api, db)
      registerStatusPageRoutes(api, db)
    },
    { prefix: '/api' },
  )

  return app
}
