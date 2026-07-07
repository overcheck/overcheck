import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

// No tables yet — the check engine milestone will populate this.
export type Database = Record<string, never>

export function createDbClient(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  })
}
