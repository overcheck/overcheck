import { describe, expect, it } from 'vitest'
import { TEST_ADMIN_TOKEN, testApp, testDb } from '../setup.js'

const authHeader = {
  get authorization() {
    return `Bearer ${TEST_ADMIN_TOKEN}`
  },
}

async function insertMonitor(label: string): Promise<{ id: number; name: string }> {
  const name = `${label} ${Date.now()}-${Math.random()}`
  const row = await testDb
    .insertInto('monitors')
    .values({
      name,
      type: 'tcp',
      enabled: false,
      interval_seconds: 10,
      host: '127.0.0.1',
      port: 1,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id: row.id, name }
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

async function createStatusPage(
  slug: string,
  monitors: { monitorId: number; groupName?: string }[],
): Promise<number> {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/status-pages',
    headers: authHeader,
    payload: { name: 'Public API Test', slug, monitors },
  })
  return response.json().id
}

describe('public status-pages API', () => {
  it('returns 404 for an unknown slug', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/public/status-pages/does-not-exist',
    })
    expect(response.statusCode).toBe(404)
  })

  it('requires no authentication', async () => {
    const monitor = await insertMonitor('public no auth')
    const slug = `public-no-auth-${Date.now()}`
    await createStatusPage(slug, [{ monitorId: monitor.id }])

    const response = await testApp.inject({
      method: 'GET',
      url: `/api/public/status-pages/${slug}`,
    })
    expect(response.statusCode).toBe(200)
  })

  it('rejects an invalid window with 400', async () => {
    const monitor = await insertMonitor('public bad window')
    const slug = `public-bad-window-${Date.now()}`
    await createStatusPage(slug, [{ monitorId: monitor.id }])

    const response = await testApp.inject({
      method: 'GET',
      url: `/api/public/status-pages/${slug}?window=3y`,
    })
    expect(response.statusCode).toBe(400)
  })

  it('groups monitors by group_name, deriving status and uptime% from the same window data', async () => {
    const up = await insertMonitor('public group up')
    const degraded = await insertMonitor('public group degraded')
    const ungrouped = await insertMonitor('public group none')
    const slug = `public-groups-${Date.now()}`
    await createStatusPage(slug, [
      { monitorId: up.id, groupName: 'Core' },
      { monitorId: degraded.id, groupName: 'Core' },
      { monitorId: ungrouped.id },
    ])

    const now = new Date()
    await insertCheck(up.id, 'up', 100, now)
    await insertCheck(degraded.id, 'degraded', 900, now)
    await insertCheck(ungrouped.id, 'up', 50, now)

    const response = await testApp.inject({
      method: 'GET',
      url: `/api/public/status-pages/${slug}?window=7d`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()

    const coreGroup = body.groups.find((g: { name: string | null }) => g.name === 'Core')
    const ungroupedGroup = body.groups.find((g: { name: string | null }) => g.name === null)
    expect(coreGroup.monitors).toHaveLength(2)
    expect(ungroupedGroup.monitors).toHaveLength(1)

    const degradedMonitor = coreGroup.monitors.find((m: { id: number }) => m.id === degraded.id)
    expect(degradedMonitor.status).toBe('degraded')
    expect(degradedMonitor.statusLabel).toBe('Degraded')
    // Status marker and uptime % must derive from the same worst-status data: a single
    // degraded check today gives 50% uptime for a 1-day-of-data window.
    expect(degradedMonitor.uptimePercentDisplay).toBe('50.00%')

    // Page-level verdict reflects the worst current status across all monitors (degraded).
    expect(body.verdict.status).toBe('degraded')
    expect(body.verdict.affectedMonitorNames).toContain(degraded.name)
  })

  it('includes incidents with their updates and affected monitor names', async () => {
    const monitor = await insertMonitor('public incident monitor')
    const slug = `public-incidents-${Date.now()}`
    const pageId = await createStatusPage(slug, [{ monitorId: monitor.id }])

    const incidentResponse = await testApp.inject({
      method: 'POST',
      url: `/api/status-pages/${pageId}/incidents`,
      headers: authHeader,
      payload: {
        title: 'Elevated latency',
        status: 'investigating',
        affectedMonitorIds: [monitor.id],
      },
    })
    const incidentId = incidentResponse.json().id

    await testApp.inject({
      method: 'POST',
      url: `/api/status-pages/${pageId}/incidents/${incidentId}/updates`,
      headers: authHeader,
      payload: { body: 'Investigating the root cause.' },
    })

    const response = await testApp.inject({
      method: 'GET',
      url: `/api/public/status-pages/${slug}`,
    })
    const body = response.json()
    expect(body.incidents).toHaveLength(1)
    expect(body.incidents[0]).toMatchObject({
      title: 'Elevated latency',
      statusLabel: 'Investigating',
      affectedMonitorNames: [monitor.name],
    })
    expect(body.incidents[0].updates[0].body).toBe('Investigating the root cause.')
  })
})
