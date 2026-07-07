import type { ColumnType, Generated } from 'kysely'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

export interface MonitorTable {
  id: Generated<number>
  name: string
  type: 'http' | 'tcp' | 'ping' | 'keyword'
  enabled: boolean
  interval_seconds: number
  timeout_ms: number
  retries: number
  degraded_after_ms: number
  http_url: string | null
  http_method: string
  http_expected_status: number
  http_body_contains: string | null
  host: string | null
  port: number | null
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | undefined>
}

export interface CheckResultTable {
  id: Generated<string>
  monitor_id: number
  status: 'up' | 'degraded' | 'down'
  response_time_ms: number | null
  error_message: string | null
  checked_at: ColumnType<Date, string | undefined, never>
}

export interface Database {
  monitors: MonitorTable
  check_results: CheckResultTable
}

export function createDbClient(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  })
}
