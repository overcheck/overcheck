import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

async function runMigrationsOnce(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: migrationsDir,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    createMigrationsSchema: true,
    ignorePattern: '.*\\.map$',
  })
}

/**
 * Retries a few times before giving up — Postgres's `pg_isready` (what docker-compose's
 * health check polls) can report ready slightly before the server accepts application
 * connections, which would otherwise surface as a raw, unhelpful pg exception on first boot.
 */
export async function runMigrations(
  databaseUrl: string,
  attempts = 5,
  delayMs = 2000,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runMigrationsOnce(databaseUrl)
      return
    } catch (err) {
      if (attempt === attempts) {
        throw new Error(
          `Could not reach the database after ${attempts} attempts — check DATABASE_URL and that Postgres is reachable. Last error: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
