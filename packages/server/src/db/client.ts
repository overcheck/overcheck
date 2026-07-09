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

export interface AlertChannelTable {
  id: Generated<number>
  name: string
  type: 'slack' | 'webhook' | 'email'
  // pg returns jsonb columns already parsed on select, but node-postgres does not
  // serialize JS objects for you on insert/update — callers must JSON.stringify first.
  config: ColumnType<unknown, string, string>
  enabled: boolean
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | undefined>
}

export interface StatusPageTable {
  id: Generated<number>
  name: string
  slug: string
  logo_url: ColumnType<string | null, string | null | undefined, string | null | undefined>
  accent_color: Generated<string>
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | undefined>
}

export interface StatusPageMonitorTable {
  status_page_id: number
  monitor_id: number
  sort_order: number
  group_name: string | null
}

export interface MonitorAlertChannelTable {
  monitor_id: number
  alert_channel_id: number
}

export interface IncidentTable {
  id: Generated<number>
  status_page_id: number
  title: string
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved'
  started_at: ColumnType<Date, string | undefined, never>
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | undefined>
}

export interface IncidentUpdateTable {
  id: Generated<number>
  incident_id: number
  body: string
  created_at: ColumnType<Date, string | undefined, never>
}

export interface IncidentMonitorTable {
  incident_id: number
  monitor_id: number
}

export interface UserTable {
  id: Generated<number>
  email: string
  password_hash: string
  role: 'admin' | 'editor' | 'viewer'
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | undefined>
}

export interface SessionTable {
  id: Generated<number>
  user_id: number
  token_hash: string
  expires_at: ColumnType<Date, string, string>
  created_at: ColumnType<Date, string | undefined, never>
}

export interface Database {
  monitors: MonitorTable
  check_results: CheckResultTable
  alert_channels: AlertChannelTable
  status_pages: StatusPageTable
  status_page_monitors: StatusPageMonitorTable
  monitor_alert_channels: MonitorAlertChannelTable
  users: UserTable
  sessions: SessionTable
  incidents: IncidentTable
  incident_updates: IncidentUpdateTable
  incident_monitors: IncidentMonitorTable
}

export function createDbClient(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  })
}
