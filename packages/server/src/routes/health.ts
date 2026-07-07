import type { FastifyInstance } from 'fastify'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/client.js'

async function checkDatabase(db: Kysely<Database>): Promise<'ok' | 'error'> {
  try {
    await sql`select 1`.execute(db)
    return 'ok'
  } catch {
    return 'error'
  }
}

export function registerHealthRoute(app: FastifyInstance, db: Kysely<Database>): void {
  app.get('/health', async () => {
    const database = await checkDatabase(db)
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      checks: { database },
      timestamp: new Date().toISOString(),
    }
  })
}
