import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { CheckScheduler } from '../src/check-engine/scheduler.js'
import { createDbClient, type Database } from '../src/db/client.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://overcheck:overcheck@localhost:5432/overcheck_test'

export const TEST_API_KEY = 'test-api-key'

export let testDb: Kysely<Database>
export let testApp: FastifyInstance
export let testScheduler: CheckScheduler

beforeAll(async () => {
  testDb = createDbClient(TEST_DATABASE_URL)
  testScheduler = new CheckScheduler(testDb)
  testApp = await buildApp(testDb, testScheduler, TEST_API_KEY)
  await testApp.ready()
})

afterAll(async () => {
  await testScheduler.stop()
  await testApp.close()
  await testDb.destroy()
})
