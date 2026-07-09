import { describe, expect, it } from 'vitest'
import { TEST_ADMIN_TOKEN, testApp, testDb } from '../setup.js'

const authHeader = {
  get authorization() {
    return `Bearer ${TEST_ADMIN_TOKEN}`
  },
}

async function createMonitor(overrides: Record<string, unknown> = {}) {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/monitors',
    headers: authHeader,
    payload: {
      name: `status-endpoint-monitor-${Date.now()}-${Math.random()}`,
      type: 'tcp',
      intervalSeconds: 10,
      host: '127.0.0.1',
      port: 1,
      enabled: false,
      ...overrides,
    },
  })
  return JSON.parse(response.body) as { id: number }
}

async function insertCheckResult(
  monitorId: number,
  overrides: Partial<{
    status: 'up' | 'degraded' | 'down'
    response_time_ms: number | null
    error_message: string | null
    checked_at: Date
  }> = {},
): Promise<void> {
  await testDb
    .insertInto('check_results')
    .values({
      monitor_id: monitorId,
      status: overrides.status ?? 'up',
      response_time_ms: overrides.response_time_ms ?? 100,
      error_message: overrides.error_message ?? null,
      checked_at: (overrides.checked_at ?? new Date()).toISOString(),
    })
    .execute()
}

describe('GET /api/monitors/status-summary', () => {
  it('requires auth', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/api/monitors/status-summary' })
    expect(response.statusCode).toBe(401)
  })

  it('returns a summary entry per monitor reflecting its latest checks', async () => {
    const monitor = await createMonitor()
    await insertCheckResult(monitor.id, { status: 'down', response_time_ms: null })

    const response = await testApp.inject({
      method: 'GET',
      url: '/api/monitors/status-summary?window=24h',
      headers: authHeader,
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as {
      monitorId: number
      status: string | null
      uptimePercent: number | null
      responseTimeMs: number | null
    }[]
    const entry = body.find((e) => e.monitorId === monitor.id)
    expect(entry).toBeDefined()
    expect(entry?.status).toBe('down')
  })
})

describe('GET /api/monitors/:id/check-results', () => {
  it('requires auth', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/api/monitors/1/check-results' })
    expect(response.statusCode).toBe(401)
  })

  it('404s for an unknown monitor', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/monitors/999999999/check-results',
      headers: authHeader,
    })
    expect(response.statusCode).toBe(404)
  })

  it('returns recent checks (with error messages) and chart paths', async () => {
    const monitor = await createMonitor()
    await insertCheckResult(monitor.id, { status: 'up', response_time_ms: 50 })
    await insertCheckResult(monitor.id, {
      status: 'down',
      response_time_ms: null,
      error_message: 'Connection timed out after 10s',
    })

    const response = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}/check-results?window=24h`,
      headers: authHeader,
    })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as {
      chart: { lineD: string; areaD: string }
      recentChecks: { status: string; errorMessage: string | null }[]
    }
    expect(body.recentChecks.length).toBeGreaterThan(0)
    expect(body.recentChecks.some((c) => c.errorMessage === 'Connection timed out after 10s')).toBe(
      true,
    )
    expect(typeof body.chart.lineD).toBe('string')
  })
})
