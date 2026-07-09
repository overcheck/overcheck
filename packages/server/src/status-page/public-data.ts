import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import type { CheckStatus } from '../check-engine/types.js'
import {
  buildSparklinePaths,
  buildTickGradient,
  computePageVerdict,
  fetchDailyHistory,
  fetchHourlyHistory,
  fetchLatestStatuses,
  STATUS_COLOR,
  STATUS_LABEL,
  summarizeBuckets,
  type PageVerdict,
  type SparklinePaths,
} from './aggregation.js'

export type Window = '24h' | '7d' | '30d' | '90d'
export const WINDOWS: Window[] = ['24h', '7d', '30d', '90d']
const WINDOW_DAYS: Record<Window, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }

const NO_DATA_COLOR = 'oklch(0.9 0.005 250)'
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved'

const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
}

function incidentStatusColor(status: IncidentStatus): string {
  return status === 'resolved' ? STATUS_COLOR.up : STATUS_COLOR.degraded
}

function formatUtcDateTime(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.getUTCDate()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${month} ${day}, ${hh}:${mm} UTC`
}

function formatUtcTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} UTC`
}

export interface MonitorViewModel {
  id: number
  name: string
  status: CheckStatus | null
  statusLabel: string
  statusColor: string
  markerShape: 'circle' | 'diamond' | 'square' | 'none'
  uptimeLabel: string
  uptimePercentDisplay: string
  tickGradient: string
  sparkline: SparklinePaths
  latestResponseTimeDisplay: string
}

export interface IncidentUpdateViewModel {
  body: string
  timeDisplay: string
}

export interface IncidentViewModel {
  id: number
  title: string
  statusLabel: string
  statusColor: string
  affectedMonitorNames: string[]
  startedAtDisplay: string
  updates: IncidentUpdateViewModel[]
}

export interface MonitorGroupViewModel {
  name: string | null
  monitors: MonitorViewModel[]
}

export interface StatusPagePublicData {
  name: string
  slug: string
  logoUrl: string | null
  accentColor: string
  window: Window
  verdict: PageVerdict
  groups: MonitorGroupViewModel[]
  incidents: IncidentViewModel[]
}

export function markerShapeFor(status: CheckStatus | null): MonitorViewModel['markerShape'] {
  if (status === 'up') return 'circle'
  if (status === 'degraded') return 'diamond'
  if (status === 'down') return 'square'
  return 'none'
}

async function buildMonitorViewModel(
  db: Kysely<Database>,
  monitor: { id: number; name: string },
  window: Window,
  retentionDays: number,
): Promise<MonitorViewModel> {
  const dailyHistory = await fetchDailyHistory(db, monitor.id, retentionDays)
  const windowBuckets =
    window === '24h'
      ? await fetchHourlyHistory(db, monitor.id)
      : dailyHistory.slice(-WINDOW_DAYS[window])

  const stats = summarizeBuckets(windowBuckets)
  const status = stats.worstStatus
  const statusLabel = status ? STATUS_LABEL[status] : 'No data'
  const statusColor = status ? STATUS_COLOR[status] : NO_DATA_COLOR

  return {
    id: monitor.id,
    name: monitor.name,
    status,
    statusLabel,
    statusColor,
    markerShape: markerShapeFor(status),
    uptimeLabel: `Uptime (${window})`,
    uptimePercentDisplay: stats.uptimePercent === null ? '—' : `${stats.uptimePercent.toFixed(2)}%`,
    tickGradient: buildTickGradient(dailyHistory),
    sparkline: buildSparklinePaths(stats.responseTimeSeries),
    latestResponseTimeDisplay:
      stats.latestResponseTimeMs === null ? '—' : `${Math.round(stats.latestResponseTimeMs)}ms`,
  }
}

/**
 * Assembles the full DTO consumed by both the public JSON API and the HTML-rendering
 * route — the HTML route calls this same function rather than querying the DB itself, so
 * there is exactly one code path that decides what a status page shows publicly.
 */
export async function getPublicStatusPageData(
  db: Kysely<Database>,
  slug: string,
  window: Window,
  retentionDays: number,
): Promise<StatusPagePublicData | null> {
  const page = await db
    .selectFrom('status_pages')
    .selectAll()
    .where('slug', '=', slug)
    .executeTakeFirst()
  if (!page) return null

  const monitorRows = await db
    .selectFrom('status_page_monitors')
    .innerJoin('monitors', 'monitors.id', 'status_page_monitors.monitor_id')
    .select([
      'monitors.id as id',
      'monitors.name as name',
      'status_page_monitors.group_name as group_name',
      'status_page_monitors.sort_order as sort_order',
    ])
    .where('status_page_monitors.status_page_id', '=', page.id)
    .orderBy('status_page_monitors.sort_order')
    .execute()

  const monitorIds = monitorRows.map((r) => r.id)
  const latestStatuses = await fetchLatestStatuses(db, monitorIds)
  const verdict = computePageVerdict(monitorRows, latestStatuses)

  const groupOrder: (string | null)[] = []
  const groupMap = new Map<string | null, MonitorViewModel[]>()
  for (const row of monitorRows) {
    const key = row.group_name
    if (!groupMap.has(key)) {
      groupMap.set(key, [])
      groupOrder.push(key)
    }
    const vm = await buildMonitorViewModel(db, row, window, retentionDays)
    groupMap.get(key)!.push(vm)
  }
  const groups: MonitorGroupViewModel[] = groupOrder.map((name) => ({
    name,
    monitors: groupMap.get(name)!,
  }))

  const monitorNameById = new Map(monitorRows.map((r) => [r.id, r.name]))

  const incidentRows = await db
    .selectFrom('incidents')
    .selectAll()
    .where('status_page_id', '=', page.id)
    .orderBy('started_at', 'desc')
    .execute()

  const incidents: IncidentViewModel[] = []
  for (const incident of incidentRows) {
    const updateRows = await db
      .selectFrom('incident_updates')
      .selectAll()
      .where('incident_id', '=', incident.id)
      .orderBy('created_at', 'desc')
      .execute()

    const affectedRows = await db
      .selectFrom('incident_monitors')
      .select('monitor_id')
      .where('incident_id', '=', incident.id)
      .execute()

    incidents.push({
      id: incident.id,
      title: incident.title,
      statusLabel: INCIDENT_STATUS_LABEL[incident.status],
      statusColor: incidentStatusColor(incident.status),
      affectedMonitorNames: affectedRows
        .map((r) => monitorNameById.get(r.monitor_id))
        .filter((n): n is string => n !== undefined),
      startedAtDisplay: formatUtcDateTime(incident.started_at),
      updates: updateRows.map((u) => ({ body: u.body, timeDisplay: formatUtcTime(u.created_at) })),
    })
  }

  return {
    name: page.name,
    slug: page.slug,
    logoUrl: page.logo_url,
    accentColor: page.accent_color,
    window,
    verdict,
    groups,
    incidents,
  }
}
