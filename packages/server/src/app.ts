import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { SmtpConfig } from './alerting/types.js'
import { registerDashboardAuth, registerSessionAuth } from './auth.js'
import type { CheckScheduler } from './check-engine/scheduler.js'
import type { Database } from './db/client.js'
import { registerAlertChannelRoutes } from './routes/alert-channels.js'
import { registerAuthProtectedRoutes, registerAuthPublicRoutes } from './routes/auth.js'
import { registerDashboardHtmlRoutes } from './routes/dashboard-html.js'
import { registerHealthRoute } from './routes/health.js'
import { registerIncidentRoutes } from './routes/incidents.js'
import { registerLoginHtmlRoute } from './routes/login-html.js'
import { registerMonitorRoutes } from './routes/monitors.js'
import { registerPublicStatusPageRoutes } from './routes/public-status-pages.js'
import { registerStatusPageHtmlRoute } from './routes/status-page-html.js'
import { registerStatusPageRoutes } from './routes/status-pages.js'
import { registerUserRoutes } from './routes/users.js'
import { registerFormBodyParser } from './utils/form-body.js'

export async function buildApp(
  db: Kysely<Database>,
  scheduler: CheckScheduler,
  sessionTtlHours: number,
  smtp: SmtpConfig | undefined = undefined,
  alertTimeoutMs = 5000,
  checkRetentionDays = 90,
  secureCookies = true,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  registerFormBodyParser(app)

  await app.register(swagger, {
    openapi: {
      info: { title: 'Overcheck API', version: '0.1.0' },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/api/docs' })

  registerHealthRoute(app, db)
  app.get('/', async (_request, reply) => reply.redirect('/dashboard'))
  registerStatusPageHtmlRoute(app, db, checkRetentionDays)
  registerLoginHtmlRoute(app, db, sessionTtlHours, secureCookies)

  await app.register(async (dashboard) => {
    await registerDashboardAuth(dashboard, db)
    registerDashboardHtmlRoutes(dashboard)
  })

  await app.register(
    async (api) => {
      registerAuthPublicRoutes(api, db, sessionTtlHours)
      registerPublicStatusPageRoutes(api, db, checkRetentionDays)

      await api.register(async (authed) => {
        await registerSessionAuth(authed, db)
        registerAuthProtectedRoutes(authed, db)
        registerUserRoutes(authed, db)
        registerMonitorRoutes(authed, db, scheduler)
        registerAlertChannelRoutes(authed, db, smtp, alertTimeoutMs)
        registerStatusPageRoutes(authed, db)
        registerIncidentRoutes(authed, db)
      })
    },
    { prefix: '/api' },
  )

  return app
}
