import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { Client } from 'pg'
import { afterAll, beforeAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { createDbClient, type Database } from '../src/db/client.js'
import { runMigrations } from '../src/db/migrate.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://overcheck:overcheck@localhost:5432/overcheck_test'

async function ensureTestDatabaseExists(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.replace(/^\//, '')
  url.pathname = '/postgres'

  const admin = new Client({ connectionString: url.toString() })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`)
  } catch (err) {
    // 42P04 = duplicate_database — fine, it already exists from a previous run.
    if ((err as { code?: string }).code !== '42P04') throw err
  } finally {
    await admin.end()
  }
}

export let testDb: Kysely<Database>
export let testApp: FastifyInstance

beforeAll(async () => {
  await ensureTestDatabaseExists()
  await runMigrations(TEST_DATABASE_URL)
  testDb = createDbClient(TEST_DATABASE_URL)
  testApp = buildApp(testDb)
  await testApp.ready()
})

afterAll(async () => {
  await testApp.close()
  await testDb.destroy()
})
