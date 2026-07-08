import type { Kysely, Selectable } from 'kysely'
import type { Database, MonitorTable } from '../db/client.js'
import type { CheckOutcome, Monitor, StateTransition } from './types.js'

export function toMonitor(row: Selectable<MonitorTable>): Monitor {
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

/**
 * Inserts a check result and reports whether it represents a status change from the
 * monitor's previous check. The previous row is read before the insert rather than derived
 * from some cached "current state" — check_results is the only source of truth for status
 * history, so there's nothing else to keep in sync.
 */
export async function insertCheckResultAndDetectTransition(
  db: Kysely<Database>,
  monitorId: number,
  outcome: CheckOutcome,
): Promise<StateTransition> {
  const previous = await db
    .selectFrom('check_results')
    .select(['status'])
    .where('monitor_id', '=', monitorId)
    .orderBy('checked_at', 'desc')
    .limit(1)
    .executeTakeFirst()

  const inserted = await db
    .insertInto('check_results')
    .values({
      monitor_id: monitorId,
      status: outcome.status,
      response_time_ms: Math.round(outcome.responseTimeMs),
      error_message: outcome.errorMessage,
    })
    .returning(['checked_at'])
    .executeTakeFirstOrThrow()

  let downtimeDurationMs: number | null = null
  if (outcome.status === 'up' && previous && previous.status !== 'up') {
    const lastUp = await db
      .selectFrom('check_results')
      .select(['checked_at'])
      .where('monitor_id', '=', monitorId)
      .where('status', '=', 'up')
      .where('checked_at', '<', inserted.checked_at)
      .orderBy('checked_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    if (lastUp) {
      downtimeDurationMs = inserted.checked_at.getTime() - lastUp.checked_at.getTime()
    }
  }

  return {
    previousStatus: previous?.status ?? null,
    newStatus: outcome.status,
    errorMessage: outcome.errorMessage,
    downtimeDurationMs,
  }
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
