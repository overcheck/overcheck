import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { SmtpConfig } from './alerting/types.js'
import { registerSessionAuth } from './auth.js'
import type { CheckScheduler } from './check-engine/scheduler.js'
import type { Database } from './db/client.js'
import { registerAlertChannelRoutes } from './routes/alert-channels.js'
import { registerAuthProtectedRoutes, registerAuthPublicRoutes } from './routes/auth.js'
import { registerHealthRoute } from './routes/health.js'
import { registerMonitorRoutes } from './routes/monitors.js'
import { registerStatusPageRoutes } from './routes/status-pages.js'
import { registerUserRoutes } from './routes/users.js'

export async function buildApp(
  db: Kysely<Database>,
  scheduler: CheckScheduler,
  sessionTtlHours: number,
  smtp: SmtpConfig | undefined = undefined,
  alertTimeoutMs = 5000,
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
      registerAuthPublicRoutes(api, db, sessionTtlHours)

      await api.register(async (authed) => {
        await registerSessionAuth(authed, db)
        registerAuthProtectedRoutes(authed, db)
        registerUserRoutes(authed, db)
        registerMonitorRoutes(authed, db, scheduler)
        registerAlertChannelRoutes(authed, db, smtp, alertTimeoutMs)
        registerStatusPageRoutes(authed, db)
      })
    },
    { prefix: '/api' },
  )

  return app
}
