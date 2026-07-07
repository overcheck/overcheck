import Fastify, { type FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from './db/client.js'
import { registerHealthRoute } from './routes/health.js'

export function buildApp(db: Kysely<Database>): FastifyInstance {
  const app = Fastify({ logger: true })

  registerHealthRoute(app, db)

  return app
}
