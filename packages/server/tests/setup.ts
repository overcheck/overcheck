import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { createSession, hashPassword } from '../src/auth.js'
import type { UserRole } from '../src/auth.js'
import { CheckScheduler } from '../src/check-engine/scheduler.js'
import { createDbClient, type Database } from '../src/db/client.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://overcheck:overcheck@localhost:5432/overcheck_test'

export const TEST_SESSION_TTL_HOURS = 24
export const TEST_USER_PASSWORD = 'test-password'

export let testDb: Kysely<Database>
export let testApp: FastifyInstance
export let testScheduler: CheckScheduler
export let TEST_ADMIN_TOKEN: string

let userCounter = 0

export interface TestUser {
  id: number
  email: string
  role: UserRole
  token: string
}

// Seeds a fresh user with the given role directly in the DB (bypassing the admin-only
// /api/users endpoint) and returns a ready-to-use session token — for tests that need to
// exercise role boundaries rather than always acting as the seeded admin.
export async function createTestUser(role: UserRole): Promise<TestUser> {
  userCounter += 1
  const user = await testDb
    .insertInto('users')
    .values({
      email: `test-${role}-${Date.now()}-${userCounter}@example.com`,
      password_hash: hashPassword(TEST_USER_PASSWORD),
      role,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  const token = await createSession(testDb, user.id, TEST_SESSION_TTL_HOURS)
  return { id: user.id, email: user.email, role: user.role, token }
}

beforeAll(async () => {
  testDb = createDbClient(TEST_DATABASE_URL)
  testScheduler = new CheckScheduler(testDb)
  testApp = await buildApp(testDb, testScheduler, TEST_SESSION_TTL_HOURS)
  await testApp.ready()

  const admin = await createTestUser('admin')
  TEST_ADMIN_TOKEN = admin.token
})

afterAll(async () => {
  await testScheduler.stop()
  await testApp.close()
  await testDb.destroy()
})
