import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { createDbClient, type Database } from '../src/db/client.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://overcheck:overcheck@localhost:5432/overcheck_test'

export let testDb: Kysely<Database>
export let testApp: FastifyInstance

beforeAll(async () => {
  testDb = createDbClient(TEST_DATABASE_URL)
  testApp = buildApp(testDb)
  await testApp.ready()
})

afterAll(async () => {
  await testApp.close()
  await testDb.destroy()
})
