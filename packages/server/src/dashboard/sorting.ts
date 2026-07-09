import type { CheckStatus } from '../check-engine/types.js'

export type SortColumn = 'name' | 'type' | 'uptime' | 'response'
export type SortDirection = 'asc' | 'desc'

export interface SortableMonitorRow {
  id: number
  name: string
  type: string
  status: CheckStatus | null
  uptimePercent: number | null
  responseTimeMs: number | null
}

// Lower rank floats to the top. A monitor with no data yet is treated as least urgent
// (sorts after "up") rather than most urgent, since there's nothing to act on.
const SEVERITY_RANK: Record<'down' | 'degraded' | 'up' | 'none', number> = {
  down: 0,
  degraded: 1,
  up: 2,
  none: 3,
}

function severityRank(status: CheckStatus | null): number {
  return SEVERITY_RANK[status ?? 'none']
}

function compareSecondary(
  a: SortableMonitorRow,
  b: SortableMonitorRow,
  sortColumn: SortColumn,
): number {
  switch (sortColumn) {
    case 'name':
      return a.name.localeCompare(b.name)
    case 'type':
      return a.type.localeCompare(b.type)
    case 'uptime':
      return (a.uptimePercent ?? -1) - (b.uptimePercent ?? -1)
    case 'response':
      // Missing response time (e.g. a down monitor with no successful check) sorts as
      // "worst" (slowest) regardless of direction, mirroring the design's "timeout" display.
      return (a.responseTimeMs ?? Number.POSITIVE_INFINITY) - (b.responseTimeMs ?? Number.POSITIVE_INFINITY)
  }
}

/**
 * Severity (down > degraded > up) is always the primary sort and is never overridden by
 * `sortColumn` — that only controls the secondary tiebreak order *within* each severity
 * group. This is a deliberate product decision (see design_handoff_dashboard/README.md)
 * so the worst problems always float to the top regardless of which column a viewer is
 * eyeballing. Sort is stable: equal rows keep their relative input order.
 */
export function sortMonitorRows<T extends SortableMonitorRow>(
  rows: T[],
  sortColumn: SortColumn,
  sortDirection: SortDirection,
): T[] {
  const dir = sortDirection === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const severityDiff = severityRank(a.row.status) - severityRank(b.row.status)
      if (severityDiff !== 0) return severityDiff
      const secondary = compareSecondary(a.row, b.row, sortColumn)
      if (secondary !== 0) return dir * secondary
      return a.index - b.index
    })
    .map(({ row }) => row)
}
