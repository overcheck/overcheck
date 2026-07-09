import { describe, expect, it } from 'vitest'
import { testDb } from '../setup.js'
import {
  buildSparklinePaths,
  buildTickGradient,
  computePageVerdict,
  fetchDailyHistory,
  summarizeBuckets,
  type Bucket,
  type LatestStatus,
} from '../../src/status-page/aggregation.js'
import { markerShapeFor } from '../../src/status-page/public-data.js'

function latestStatusMap(entries: [number, LatestStatus['status']][]): Map<number, LatestStatus> {
  const now = new Date()
  return new Map(entries.map(([id, status]) => [id, { status, checkedAt: now }]))
}

async function insertMonitor(label: string): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({
      name: `${label} ${Date.now()}-${Math.random()}`,
      type: 'tcp',
      enabled: false,
      interval_seconds: 10,
      host: '127.0.0.1',
      port: 1,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

async function insertCheck(
  monitorId: number,
  status: 'up' | 'degraded' | 'down',
  responseTimeMs: number,
  checkedAt: Date,
): Promise<void> {
  await testDb
    .insertInto('check_results')
    .values({
      monitor_id: monitorId,
      status,
      response_time_ms: responseTimeMs,
      checked_at: checkedAt.toISOString(),
    })
    .execute()
}

describe('summarizeBuckets', () => {
  it('picks down over degraded and up when all three are present in the same slice', () => {
    const buckets: Bucket[] = [
      { date: new Date(), status: 'up', responseTimeMs: 100 },
      { date: new Date(), status: 'degraded', responseTimeMs: 500 },
      { date: new Date(), status: 'down', responseTimeMs: 0 },
      { date: new Date(), status: 'up', responseTimeMs: 110 },
    ]
    expect(summarizeBuckets(buckets).worstStatus).toBe('down')
  })

  it('picks degraded over up when no down bucket is present', () => {
    const buckets: Bucket[] = [
      { date: new Date(), status: 'up', responseTimeMs: 100 },
      { date: new Date(), status: 'degraded', responseTimeMs: 500 },
      { date: new Date(), status: 'up', responseTimeMs: 110 },
    ]
    expect(summarizeBuckets(buckets).worstStatus).toBe('degraded')
  })

  it('excludes no-data buckets from the uptime percentage denominator', () => {
    // 1 up day (100%), 1 no-data day, 1 degraded day (50%): expect (1 + 0.5) / 2 = 75%,
    // not (1 + 0.5) / 3.
    const buckets: Bucket[] = [
      { date: new Date(), status: 'up', responseTimeMs: 100 },
      { date: new Date(), status: null, responseTimeMs: null },
      { date: new Date(), status: 'degraded', responseTimeMs: 500 },
    ]
    const stats = summarizeBuckets(buckets)
    expect(stats.uptimePercent).toBe(75)
    expect(stats.worstStatus).toBe('degraded')
  })

  it('returns null worstStatus and uptimePercent when every bucket is no-data', () => {
    const buckets: Bucket[] = [
      { date: new Date(), status: null, responseTimeMs: null },
      { date: new Date(), status: null, responseTimeMs: null },
    ]
    const stats = summarizeBuckets(buckets)
    expect(stats.worstStatus).toBeNull()
    expect(stats.uptimePercent).toBeNull()
  })

  it('reports the latest non-null response time', () => {
    const buckets: Bucket[] = [
      { date: new Date(), status: 'up', responseTimeMs: 100 },
      { date: new Date(), status: null, responseTimeMs: null },
    ]
    expect(summarizeBuckets(buckets).latestResponseTimeMs).toBe(100)
  })
})

describe('buildTickGradient', () => {
  it('produces one hard-stop color pair per bucket, gray for no-data', () => {
    const buckets: Bucket[] = [
      { date: new Date(), status: 'up', responseTimeMs: 100 },
      { date: new Date(), status: null, responseTimeMs: null },
      { date: new Date(), status: 'down', responseTimeMs: 100 },
    ]
    const gradient = buildTickGradient(buckets)
    expect(gradient.startsWith('linear-gradient(to right,')).toBe(true)
    // 3 buckets * 2 stops each = 6 color-percentage entries
    const stopCount = gradient.match(/oklch\([^)]*\) [\d.]+%/g)?.length
    expect(stopCount).toBe(6)
    expect(gradient).toContain('oklch(0.9 0.005 250)') // no-data gray
  })
})

describe('computePageVerdict (worst-status-wins across multiple monitors)', () => {
  const monitors = [
    { id: 1, name: 'Monitor Down' },
    { id: 2, name: 'Monitor Degraded' },
    { id: 3, name: 'Monitor Up A' },
    { id: 4, name: 'Monitor Up B' },
    { id: 5, name: 'Monitor Up C' },
  ]

  it('rolls up to down when one down, one degraded, and several up monitors are mixed', () => {
    const latest = latestStatusMap([
      [1, 'down'],
      [2, 'degraded'],
      [3, 'up'],
      [4, 'up'],
      [5, 'up'],
    ])
    const verdict = computePageVerdict(monitors, latest)
    // Worst status wins outright — never a blended/averaged state — and the down monitor
    // shows up as affected alongside the degraded one, not just the single worst monitor.
    expect(verdict.status).toBe('down')
    expect(verdict.label).toBe('Partial Outage')
    expect(markerShapeFor(verdict.status)).toBe('square')
    expect(verdict.affectedMonitorNames.sort()).toEqual(['Monitor Degraded', 'Monitor Down'])
  })

  it('rolls up to degraded once the down monitor is removed, leaving degraded + up', () => {
    const latest = latestStatusMap([
      [2, 'degraded'],
      [3, 'up'],
      [4, 'up'],
      [5, 'up'],
    ])
    const degradedOnly = monitors.filter((m) => m.id !== 1)
    const verdict = computePageVerdict(degradedOnly, latest)
    expect(verdict.status).toBe('degraded')
    expect(verdict.label).toBe('Degraded Performance')
    expect(markerShapeFor(verdict.status)).toBe('diamond')
    expect(verdict.affectedMonitorNames).toEqual(['Monitor Degraded'])
  })
})

describe('markerShapeFor', () => {
  it('maps each status to its distinct shape, not just a color', () => {
    expect(markerShapeFor('up')).toBe('circle')
    expect(markerShapeFor('degraded')).toBe('diamond')
    expect(markerShapeFor('down')).toBe('square')
    expect(markerShapeFor(null)).toBe('none')
  })
})

describe('buildSparklinePaths', () => {
  it('returns empty paths when every value is null', () => {
    expect(buildSparklinePaths([null, null])).toEqual({ lineD: '', areaD: '' })
  })

  it('drops null points and scales remaining values into the 220x48 viewBox', () => {
    const { lineD, areaD } = buildSparklinePaths([100, null, 300])
    expect(lineD.startsWith('M')).toBe(true)
    // Two remaining points -> "M x,y L x,y"
    expect(lineD.split(' L').length).toBe(2)
    expect(areaD).toContain(lineD.replace('M', ''))
    expect(areaD.endsWith('Z')).toBe(true)
  })

  it('does not divide by zero when all values are identical', () => {
    const { lineD } = buildSparklinePaths([50, 50, 50])
    expect(lineD.startsWith('M')).toBe(true)
  })
})

describe('fetchDailyHistory', () => {
  it('buckets checks by UTC day, worst-status-wins per day, and marks gap days as no-data', async () => {
    const monitorId = await insertMonitor('aggregation daily')
    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000

    // Day -2 (2 days ago): two checks, one up one degraded -> worst = degraded
    await insertCheck(monitorId, 'up', 100, new Date(now.getTime() - 2 * dayMs))
    await insertCheck(monitorId, 'degraded', 900, new Date(now.getTime() - 2 * dayMs + 60_000))
    // Day -1 (yesterday): deliberately no checks -> gap day
    // Day 0 (today): single up check
    await insertCheck(monitorId, 'up', 120, now)

    const history = await fetchDailyHistory(testDb, monitorId, 3)
    expect(history).toHaveLength(3)
    expect(history[0].status).toBe('degraded')
    expect(history[0].responseTimeMs).toBe(900) // latest check that day
    expect(history[1].status).toBeNull()
    expect(history[1].responseTimeMs).toBeNull()
    expect(history[2].status).toBe('up')
    expect(history[2].responseTimeMs).toBe(120)
  })
})
