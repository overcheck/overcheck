import { createServer } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { CheckScheduler } from '../../src/check-engine/scheduler.js'
import type { Monitor } from '../../src/check-engine/types.js'
import { testDb } from '../setup.js'

// The row only needs to exist to satisfy check_results' FK — the scheduler in these tests
// is driven from a hand-built Monitor object (below) with a sub-10s interval for speed, not
// from fetchEnabledMonitors, so the DB row's interval_seconds (constrained to >=10) is unused.
async function insertMonitor(host: string, port: number): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({ name: 'scheduler test monitor', type: 'tcp', interval_seconds: 10, host, port })
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
})
