import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import type { CheckStatus } from '../check-engine/types.js'

interface CheckResultRow {
  status: CheckStatus
  response_time_ms: number | null
  checked_at: Date
}

export interface Bucket {
  date: Date
  status: CheckStatus | null
  responseTimeMs: number | null
}

export interface WindowStats {
  worstStatus: CheckStatus | null
  uptimePercent: number | null
  responseTimeSeries: (number | null)[]
  latestResponseTimeMs: number | null
}

const STATUS_RANK: Record<CheckStatus, number> = { up: 0, degraded: 1, down: 2 }

function worstOf(statuses: CheckStatus[]): CheckStatus | null {
  if (statuses.length === 0) return null
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst))
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function utcHourKey(d: Date): string {
  return d.toISOString().slice(0, 13)
}

/**
 * Buckets a monitor's raw check_results into fixed-size time buckets over the trailing
 * window, one bucket per unit (day or hour). Buckets with zero checks are explicit
 * `status: null` entries rather than being omitted, so callers can render "no data"
 * distinctly from "up" instead of silently assuming uptime.
 */
async function fetchBuckets(
  db: Kysely<Database>,
  monitorId: number,
  unit: 'day' | 'hour',
  count: number,
): Promise<Bucket[]> {
  const unitMs = unit === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
  const since = new Date(Date.now() - count * unitMs)

  const rows = await db
    .selectFrom('check_results')
    .select(['status', 'response_time_ms', 'checked_at'])
    .where('monitor_id', '=', monitorId)
    .where('checked_at', '>=', since)
    .orderBy('checked_at', 'asc')
    .execute()

  const keyFn = unit === 'day' ? utcDayKey : utcHourKey
  const byBucket = new Map<string, CheckResultRow[]>()
  for (const row of rows) {
    const key = keyFn(row.checked_at)
    const existing = byBucket.get(key)
    if (existing) existing.push(row)
    else byBucket.set(key, [row])
  }

  const currentBucketStart = Math.floor(Date.now() / unitMs) * unitMs

  const buckets: Bucket[] = []
  for (let i = count - 1; i >= 0; i--) {
    const bucketStart = new Date(currentBucketStart - i * unitMs)
    const key = keyFn(bucketStart)
    const bucketRows = byBucket.get(key)
    if (!bucketRows || bucketRows.length === 0) {
      buckets.push({ date: bucketStart, status: null, responseTimeMs: null })
      continue
    }
    const status = worstOf(bucketRows.map((r) => r.status))
    const latest = bucketRows[bucketRows.length - 1]
    buckets.push({ date: bucketStart, status, responseTimeMs: latest.response_time_ms })
  }
  return buckets
}

/** Full 90-day daily history for a monitor. Always the full retention window, regardless
 * of the selected display window — the tick-gradient bar never shrinks. */
export async function fetchDailyHistory(
  db: Kysely<Database>,
  monitorId: number,
  days = 90,
): Promise<Bucket[]> {
  return fetchBuckets(db, monitorId, 'day', days)
}

/** Hourly buckets for the last 24h, used only for the 24h window (too coarse to reuse the
 * daily bucketing for that window). */
export async function fetchHourlyHistory(
  db: Kysely<Database>,
  monitorId: number,
): Promise<Bucket[]> {
  return fetchBuckets(db, monitorId, 'hour', 24)
}

/**
 * Derives worst-status and uptime % from the same bucket slice — the single source of
 * truth behind both the status marker/label and the uptime percentage, so they can never
 * disagree. No-data buckets are excluded from the uptime denominator entirely (not
 * counted as up or down).
 */
export function summarizeBuckets(buckets: Bucket[]): WindowStats {
  const withData = buckets.filter((b): b is Bucket & { status: CheckStatus } => b.status !== null)

  const worstStatus = withData.length > 0 ? worstOf(withData.map((b) => b.status)) : null

  let uptimePercent: number | null = null
  if (withData.length > 0) {
    const upCount = withData.filter((b) => b.status === 'up').length
    const degradedCount = withData.filter((b) => b.status === 'degraded').length
    uptimePercent = Number((((upCount + degradedCount * 0.5) / withData.length) * 100).toFixed(2))
  }

  const responseTimeSeries = buckets.map((b) => b.responseTimeMs)
  const latestWithData = [...buckets].reverse().find((b) => b.responseTimeMs !== null)

  return {
    worstStatus,
    uptimePercent,
    responseTimeSeries,
    latestResponseTimeMs: latestWithData?.responseTimeMs ?? null,
  }
}

const NO_DATA_COLOR = 'oklch(0.9 0.005 250)'

export const STATUS_COLOR: Record<CheckStatus, string> = {
  up: 'oklch(0.6 0.14 150)',
  degraded: 'oklch(0.7 0.16 70)',
  down: 'oklch(0.56 0.19 25)',
}

export const STATUS_LABEL: Record<CheckStatus, string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
}

/** Builds the CSS linear-gradient string for the 90-day tick bar: one hard color stop
 * per day, always covering the full 90-day history independent of the selected window. */
export function buildTickGradient(days: Bucket[]): string {
  const n = days.length
  const stops: string[] = []
  days.forEach((day, i) => {
    const color = day.status ? STATUS_COLOR[day.status] : NO_DATA_COLOR
    const p1 = ((i / n) * 100).toFixed(2)
    const p2 = (((i + 1) / n) * 100).toFixed(2)
    stops.push(`${color} ${p1}%`, `${color} ${p2}%`)
  })
  return `linear-gradient(to right, ${stops.join(', ')})`
}

export interface SparklinePaths {
  lineD: string
  areaD: string
}

const SPARK_WIDTH = 220
const SPARK_HEIGHT = 48
const SPARK_PAD = 4

/** Builds the inline SVG line + area path for a response-time chart at the given viewBox
 * size, min/max-scaled y. No-data points are dropped from the series entirely (rather than
 * fabricated) since neither surface's design has gaps to account for. Defaults match the
 * status page's 220x48 sparkline; the dashboard's monitor-detail chart calls this with its
 * own 640x120 dimensions instead of duplicating the path math. */
export function buildSparklinePaths(
  series: (number | null)[],
  width = SPARK_WIDTH,
  height = SPARK_HEIGHT,
  pad = SPARK_PAD,
): SparklinePaths {
  const values = series.filter((v): v is number => v !== null)
  if (values.length === 0) return { lineD: '', areaD: '' }

  const min = Math.min(...values)
  let max = Math.max(...values)
  if (max === min) max = min + 1

  const step = (width - 2 * pad) / (values.length - 1 || 1)
  const points = values.map((v, i) => ({
    x: pad + i * step,
    y: height - pad - ((v - min) / (max - min)) * (height - 2 * pad),
  }))

  const lineD = 'M' + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')
  const last = points[points.length - 1]
  const first = points[0]
  const areaD = `${lineD} L${last.x.toFixed(1)},${height - pad} L${first.x.toFixed(1)},${height - pad} Z`

  return { lineD, areaD }
}

export interface LatestStatus {
  status: CheckStatus
  checkedAt: Date
}

/** Latest check per monitor, via DISTINCT ON — the source for the page-level "current
 * status" verdict, which is deliberately not window-scoped (it reflects right now). */
export async function fetchLatestStatuses(
  db: Kysely<Database>,
  monitorIds: number[],
): Promise<Map<number, LatestStatus>> {
  if (monitorIds.length === 0) return new Map()
  const rows = await db
    .selectFrom('check_results')
    .select(['monitor_id', 'status', 'checked_at'])
    .distinctOn('monitor_id')
    .where('monitor_id', 'in', monitorIds)
    .orderBy('monitor_id')
    .orderBy('checked_at', 'desc')
    .execute()

  const result = new Map<number, LatestStatus>()
  for (const row of rows) {
    result.set(row.monitor_id, { status: row.status, checkedAt: row.checked_at })
  }
  return result
}

export function formatRelativeTime(sinceMs: number): string {
  const seconds = Math.max(0, Math.floor(sinceMs / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export interface PageVerdict {
  status: CheckStatus | null
  label: string
  color: string
  affectedMonitorNames: string[]
  lastCheckedRelative: string | null
}

const VERDICT_LABEL: Record<CheckStatus, string> = {
  up: 'All Systems Operational',
  degraded: 'Degraded Performance',
  down: 'Partial Outage',
}

/** Page-level verdict: worst *current* status across the page's monitors (not
 * window-scoped), the affected monitor names for the sub-message, and how long ago the
 * most recent check ran. Derived from the same fetchLatestStatuses data used nowhere
 * else, so this too never disagrees with the per-monitor markers below it. */
export function computePageVerdict(
  monitors: { id: number; name: string }[],
  latestStatuses: Map<number, LatestStatus>,
): PageVerdict {
  const withStatus = monitors
    .map((m) => ({ ...m, latest: latestStatuses.get(m.id) }))
    .filter((m): m is typeof m & { latest: LatestStatus } => m.latest !== undefined)

  if (withStatus.length === 0) {
    return {
      status: null,
      label: 'No Data',
      color: NO_DATA_COLOR,
      affectedMonitorNames: [],
      lastCheckedRelative: null,
    }
  }

  const worstStatus = worstOf(withStatus.map((m) => m.latest.status)) as CheckStatus
  const affectedMonitorNames = withStatus.filter((m) => m.latest.status !== 'up').map((m) => m.name)

  const mostRecentCheckedAt = Math.max(...withStatus.map((m) => m.latest.checkedAt.getTime()))

  return {
    status: worstStatus,
    label: VERDICT_LABEL[worstStatus],
    color: STATUS_COLOR[worstStatus],
    affectedMonitorNames,
    lastCheckedRelative: formatRelativeTime(Date.now() - mostRecentCheckedAt),
  }
}
