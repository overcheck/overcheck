import { describe, expect, it } from 'vitest'
import { sortMonitorRows, type SortableMonitorRow } from '../../src/dashboard/sorting.js'

function row(overrides: Partial<SortableMonitorRow> & { id: number }): SortableMonitorRow {
  return {
    id: overrides.id,
    name: overrides.name ?? `monitor-${overrides.id}`,
    type: overrides.type ?? 'http',
    status: overrides.status ?? 'up',
    uptimePercent: overrides.uptimePercent ?? null,
    responseTimeMs: overrides.responseTimeMs ?? null,
  }
}

describe('sortMonitorRows', () => {
  it('always ranks down > degraded > up regardless of the secondary column', () => {
    const rows = [
      row({ id: 1, name: 'Z Up', status: 'up' }),
      row({ id: 2, name: 'A Down', status: 'down' }),
      row({ id: 3, name: 'M Degraded', status: 'degraded' }),
    ]
    const sorted = sortMonitorRows(rows, 'name', 'asc')
    expect(sorted.map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('is not overridden even by descending secondary sort', () => {
    const rows = [
      row({ id: 1, name: 'Z Up', status: 'up' }),
      row({ id: 2, name: 'A Down', status: 'down' }),
    ]
    const sorted = sortMonitorRows(rows, 'name', 'desc')
    // "desc" by name would normally put Z before A, but severity still wins.
    expect(sorted.map((r) => r.id)).toEqual([2, 1])
  })

  it('sorts by name within a severity group, both directions', () => {
    const rows = [
      row({ id: 1, name: 'Charlie', status: 'up' }),
      row({ id: 2, name: 'Alpha', status: 'up' }),
      row({ id: 3, name: 'Bravo', status: 'up' }),
    ]
    expect(sortMonitorRows(rows, 'name', 'asc').map((r) => r.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
    expect(sortMonitorRows(rows, 'name', 'desc').map((r) => r.name)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ])
  })

  it('sorts by type within a severity group', () => {
    const rows = [
      row({ id: 1, type: 'tcp', status: 'up' }),
      row({ id: 2, type: 'http', status: 'up' }),
      row({ id: 3, type: 'ping', status: 'up' }),
    ]
    expect(sortMonitorRows(rows, 'type', 'asc').map((r) => r.type)).toEqual(['http', 'ping', 'tcp'])
  })

  it('sorts by uptime within a severity group, treating missing uptime as lowest', () => {
    const rows = [
      row({ id: 1, uptimePercent: 99.9, status: 'up' }),
      row({ id: 2, uptimePercent: null, status: 'up' }),
      row({ id: 3, uptimePercent: 50, status: 'up' }),
    ]
    expect(sortMonitorRows(rows, 'uptime', 'asc').map((r) => r.id)).toEqual([2, 3, 1])
    expect(sortMonitorRows(rows, 'uptime', 'desc').map((r) => r.id)).toEqual([1, 3, 2])
  })

  it('sorts by response time within a severity group, treating missing response as slowest', () => {
    const rows = [
      row({ id: 1, responseTimeMs: 100, status: 'up' }),
      row({ id: 2, responseTimeMs: null, status: 'up' }),
      row({ id: 3, responseTimeMs: 50, status: 'up' }),
    ]
    expect(sortMonitorRows(rows, 'response', 'asc').map((r) => r.id)).toEqual([3, 1, 2])
  })

  it('is stable for equal secondary keys', () => {
    const rows = [
      row({ id: 1, name: 'Same', status: 'up' }),
      row({ id: 2, name: 'Same', status: 'up' }),
      row({ id: 3, name: 'Same', status: 'up' }),
    ]
    expect(sortMonitorRows(rows, 'name', 'asc').map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('treats monitors with no status data as least urgent (after "up")', () => {
    const rows = [
      row({ id: 1, status: 'up' }),
      row({ id: 2, status: null }),
      row({ id: 3, status: 'down' }),
    ]
    expect(sortMonitorRows(rows, 'name', 'asc').map((r) => r.id)).toEqual([3, 1, 2])
  })
})
