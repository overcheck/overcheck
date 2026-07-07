import { Client } from 'pg'
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
    // 42P04 = duplicate_database — already exists from a previous run.
    if ((err as { code?: string }).code !== '42P04') throw err
  } finally {
    await admin.end()
  }
}

// Vitest's globalSetup runs exactly once in its own process, before any test file's worker
// starts — unlike setupFiles (tests/setup.ts), which runs once per test file/worker. Creating
// the database and running migrations here (instead of in setupFiles) avoids every worker
// racing node-pg-migrate's advisory lock against the same overcheck_test database.
export default async function globalSetup(): Promise<void> {
  await ensureTestDatabaseExists()
  await runMigrations(TEST_DATABASE_URL)
}
