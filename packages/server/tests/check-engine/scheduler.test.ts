import { createServer } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import type { Server as HttpServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { CheckScheduler } from '../../src/check-engine/scheduler.js'
import type { HttpMonitor, Monitor } from '../../src/check-engine/types.js'
import { testDb } from '../setup.js'

// The row only needs to exist to satisfy check_results' FK — the scheduler in these tests
// is driven from a hand-built Monitor object (below) with a sub-10s interval for speed, not
// from fetchEnabledMonitors, so the DB row's interval_seconds (constrained to >=10) is unused.
// Name must be unique per call: the test DB is shared and never truncated between runs (ADR-005),
// and monitors.name has a unique constraint.
async function insertMonitor(host: string, port: number): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({
      name: `scheduler test monitor ${Date.now()}-${Math.random()}`,
      type: 'tcp',
      interval_seconds: 10,
      host,
      port,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

async function insertHttpMonitor(httpUrl: string): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({
      name: `scheduler http test monitor ${Date.now()}-${Math.random()}`,
      type: 'http',
      interval_seconds: 10,
      http_url: httpUrl,
      http_method: 'GET',
      http_expected_status: 200,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`condition not met within ${timeoutMs}ms`)
}

async function statusesFor(monitorId: number): Promise<string[]> {
  const rows = await testDb
    .selectFrom('check_results')
    .select('status')
    .where('monitor_id', '=', monitorId)
    .orderBy('checked_at', 'asc')
    .execute()
  return rows.map((r) => r.status)
}

describe('CheckScheduler', () => {
  let server: Server | undefined
  let scheduler: CheckScheduler | undefined

  afterEach(async () => {
    await scheduler?.stop()
    scheduler = undefined
    if (server?.listening) await new Promise((res) => server?.close(() => res(undefined)))
    server = undefined
  })

  it('records a transition (up -> down -> up) across successive ticks', async () => {
    server = createServer()
    await new Promise<void>((res) => server?.listen(0, '127.0.0.1', res))
    const port = (server.address() as AddressInfo).port

    const monitorId = await insertMonitor('127.0.0.1', port)
    const monitor: Monitor = {
      id: monitorId,
      name: 'flap test',
      type: 'tcp',
      enabled: true,
      intervalSeconds: 0.15, // scheduler multiplies by 1000 for setTimeout ms; sub-10s is fine here since we bypass the DB constraint
      timeoutMs: 50,
      retries: 0,
      degradedAfterMs: 2000,
      host: '127.0.0.1',
      port,
    }

    scheduler = new CheckScheduler(testDb)
    scheduler.start([monitor])

    await waitFor(async () => (await statusesFor(monitorId)).length >= 1, 1000)
    expect(await statusesFor(monitorId)).toEqual(['up'])

    // Take the server down and wait for the next tick to observe the failure.
    await new Promise((res) => server?.close(() => res(undefined)))
    await waitFor(async () => (await statusesFor(monitorId)).length >= 2, 1000)
    expect(await statusesFor(monitorId)).toEqual(['up', 'down'])

    // Bring it back up on the same port and confirm the scheduler recovers.
    server = createServer()
    await new Promise<void>((res) => server?.listen(port, '127.0.0.1', res))
    await waitFor(async () => (await statusesFor(monitorId)).length >= 3, 1000)
    expect(await statusesFor(monitorId)).toEqual(['up', 'down', 'up'])
  }, 5000)

  it('stops cleanly: no further checks run after stop()', async () => {
    server = createServer()
    await new Promise<void>((res) => server?.listen(0, '127.0.0.1', res))
    const port = (server.address() as AddressInfo).port
    const monitorId = await insertMonitor('127.0.0.1', port)
    const monitor: Monitor = {
      id: monitorId,
      name: 'stop test',
      type: 'tcp',
      enabled: true,
      intervalSeconds: 0.1,
      timeoutMs: 50,
      retries: 0,
      degradedAfterMs: 2000,
      host: '127.0.0.1',
      port,
    }

    scheduler = new CheckScheduler(testDb)
    scheduler.start([monitor])

    await waitFor(async () => (await statusesFor(monitorId)).length >= 1, 1000)
    await scheduler.stop()
    const countAfterStop = (await statusesFor(monitorId)).length

    await new Promise((r) => setTimeout(r, 300))
    expect(await statusesFor(monitorId)).toHaveLength(countAfterStop)
  }, 5000)

  it('calls the injected dispatcher only on real transitions, with the right transition data', async () => {
    server = createServer()
    await new Promise<void>((res) => server?.listen(0, '127.0.0.1', res))
    const port = (server.address() as AddressInfo).port

    const monitorId = await insertMonitor('127.0.0.1', port)
    const monitor: Monitor = {
      id: monitorId,
      name: 'dispatch test',
      type: 'tcp',
      enabled: true,
      intervalSeconds: 0.15,
      timeoutMs: 50,
      retries: 0,
      degradedAfterMs: 2000,
      host: '127.0.0.1',
      port,
    }

    const calls: Array<{ monitor: Monitor; transition: unknown }> = []
    scheduler = new CheckScheduler(testDb, undefined, async (m, transition) => {
      calls.push({ monitor: m, transition })
    })
    scheduler.start([monitor])

    // First check (up) is a baseline — no previous result to compare against, so no dispatch.
    await waitFor(async () => (await statusesFor(monitorId)).length >= 1, 1000)
    expect(calls).toHaveLength(0)

    // Second check on the same up server repeats the status — still no dispatch.
    await waitFor(async () => (await statusesFor(monitorId)).length >= 2, 1000)
    expect(calls).toHaveLength(0)

    await new Promise((res) => server?.close(() => res(undefined)))
    await waitFor(() => Promise.resolve(calls.length >= 1), 1000)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.monitor.id).toBe(monitorId)
    expect(calls[0]?.transition).toMatchObject({ previousStatus: 'up', newStatus: 'down' })
  }, 5000)

  it('dispatches on up -> degraded and degraded -> up, with downtime duration on recovery', async () => {
    let responseDelayMs = 0
    const httpServer: HttpServer = createHttpServer((_req, res) => {
      setTimeout(() => {
        res.statusCode = 200
        res.end('ok')
      }, responseDelayMs)
    })
    await new Promise<void>((res) => httpServer.listen(0, '127.0.0.1', res))
    const port = (httpServer.address() as { port: number }).port

    const monitorId = await insertHttpMonitor(`http://127.0.0.1:${port}/`)
    const monitor: HttpMonitor = {
      id: monitorId,
      name: 'degraded test',
      type: 'http',
      enabled: true,
      intervalSeconds: 0.15,
      timeoutMs: 500,
      retries: 0,
      degradedAfterMs: 100,
      httpUrl: `http://127.0.0.1:${port}/`,
      httpMethod: 'GET',
      httpExpectedStatus: 200,
      httpBodyContains: null,
    }

    const calls: Array<{ monitor: Monitor; transition: unknown }> = []
    const dispatcherScheduler = new CheckScheduler(testDb, undefined, async (m, transition) => {
      calls.push({ monitor: m, transition })
    })

    try {
      dispatcherScheduler.start([monitor])

      // First check (fast, "up") is a baseline — no dispatch.
      await waitFor(async () => (await statusesFor(monitorId)).length >= 1, 1000)
      expect(calls).toHaveLength(0)

      // Slow the response past degradedAfterMs and wait for the up -> degraded transition.
      responseDelayMs = 300
      await waitFor(() => Promise.resolve(calls.length >= 1), 2000)
      expect(calls[0]?.transition).toMatchObject({
        previousStatus: 'up',
        newStatus: 'degraded',
        downtimeDurationMs: null,
      })

      // Speed the response back up and wait for the degraded -> up recovery, which should carry
      // a downtime duration even though the monitor was never fully "down".
      responseDelayMs = 0
      await waitFor(() => Promise.resolve(calls.length >= 2), 2000)
      expect(calls[1]?.transition).toMatchObject({ previousStatus: 'degraded', newStatus: 'up' })
      const transition = calls[1]?.transition as { downtimeDurationMs: number | null }
      expect(transition.downtimeDurationMs).not.toBeNull()
      expect(transition.downtimeDurationMs).toBeGreaterThan(0)
    } finally {
      await dispatcherScheduler.stop()
      await new Promise((res) => httpServer.close(() => res(undefined)))
    }
  }, 8000)
})
