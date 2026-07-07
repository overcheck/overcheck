import type { Kysely, Selectable } from 'kysely'
import type { Database, MonitorTable } from '../db/client.js'
import type { CheckOutcome, Monitor } from './types.js'

function toMonitor(row: Selectable<MonitorTable>): Monitor {
  const base = {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    intervalSeconds: row.interval_seconds,
    timeoutMs: row.timeout_ms,
    retries: row.retries,
    degradedAfterMs: row.degraded_after_ms,
  }

  if (row.type === 'tcp') {
    if (row.host === null || row.port === null) {
      throw new Error(`tcp monitor ${row.id} is missing host/port`)
    }
    return { ...base, type: 'tcp', host: row.host, port: row.port }
  }

  if (row.type === 'ping') {
    if (row.host === null) {
      throw new Error(`ping monitor ${row.id} is missing host`)
    }
    return { ...base, type: 'ping', host: row.host }
  }

  if (row.http_url === null) {
    throw new Error(`${row.type} monitor ${row.id} is missing http_url`)
  }
  return {
    ...base,
    type: row.type,
    httpUrl: row.http_url,
    httpMethod: row.http_method,
    httpExpectedStatus: row.http_expected_status,
    httpBodyContains: row.http_body_contains,
  }
}

export async function fetchEnabledMonitors(db: Kysely<Database>): Promise<Monitor[]> {
  const rows = await db.selectFrom('monitors').selectAll().where('enabled', '=', true).execute()
  return rows.map(toMonitor)
}

export async function insertCheckResult(
  db: Kysely<Database>,
  monitorId: number,
  outcome: CheckOutcome,
): Promise<void> {
  await db
    .insertInto('check_results')
    .values({
      monitor_id: monitorId,
      status: outcome.status,
      response_time_ms: Math.round(outcome.responseTimeMs),
      error_message: outcome.errorMessage,
    })
    .execute()
}

export async function pruneOldCheckResults(
  db: Kysely<Database>,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await db
    .deleteFrom('check_results')
    .where('checked_at', '<', cutoff)
    .executeTakeFirst()
  return Number(result.numDeletedRows)
}
