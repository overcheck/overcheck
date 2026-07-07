import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function runMigrations(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: migrationsDir,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    createMigrationsSchema: true,
    ignorePattern: '.*\\.map$',
  })
}
