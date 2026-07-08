import { describe, expect, it } from 'vitest'
import { insertCheckResultAndDetectTransition } from '../../src/check-engine/repository.js'
import { testDb } from '../setup.js'

// Unique per test: the test DB is shared and never truncated between runs (ADR-005), and
// monitors.name has a unique constraint.
async function insertMonitor(): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({
      name: `repository test monitor ${Date.now()}-${Math.random()}`,
      type: 'tcp',
      interval_seconds: 10,
      host: '127.0.0.1',
      port: 1,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

describe('insertCheckResultAndDetectTransition', () => {
  it('reports no transition on the first-ever check for a monitor', async () => {
    const monitorId = await insertMonitor()
    const transition = await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 10,
      errorMessage: null,
    })
    expect(transition.previousStatus).toBeNull()
    expect(transition.newStatus).toBe('up')
    expect(transition.downtimeDurationMs).toBeNull()
  })

  it('reports a transition when status changes from the previous check', async () => {
    const monitorId = await insertMonitor()
    await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 10,
      errorMessage: null,
    })
    const transition = await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'down',
      responseTimeMs: 10,
      errorMessage: 'connection refused',
    })
    expect(transition.previousStatus).toBe('up')
    expect(transition.newStatus).toBe('down')
    expect(transition.errorMessage).toBe('connection refused')
    expect(transition.downtimeDurationMs).toBeNull()
  })

  it('reports no transition when status repeats', async () => {
    const monitorId = await insertMonitor()
    await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 10,
      errorMessage: null,
    })
    const transition = await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 12,
      errorMessage: null,
    })
    expect(transition.previousStatus).toBe('up')
    expect(transition.newStatus).toBe('up')
  })

  it('computes downtime duration on recovery from down to up', async () => {
    const monitorId = await insertMonitor()
    await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 10,
      errorMessage: null,
    })
    await new Promise((r) => setTimeout(r, 30))
    await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'down',
      responseTimeMs: 10,
      errorMessage: 'timeout',
    })
    await new Promise((r) => setTimeout(r, 30))
    await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'down',
      responseTimeMs: 10,
      errorMessage: 'timeout',
    })
    await new Promise((r) => setTimeout(r, 30))
    const recovery = await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 10,
      errorMessage: null,
    })

    expect(recovery.previousStatus).toBe('down')
    expect(recovery.newStatus).toBe('up')
    expect(recovery.downtimeDurationMs).not.toBeNull()
    expect(recovery.downtimeDurationMs).toBeGreaterThanOrEqual(80)
  })

  it('computes downtime duration on recovery from degraded to up', async () => {
    const monitorId = await insertMonitor()
    await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 10,
      errorMessage: null,
    })
    await new Promise((r) => setTimeout(r, 20))
    await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'degraded',
      responseTimeMs: 3000,
      errorMessage: null,
    })
    await new Promise((r) => setTimeout(r, 20))
    const recovery = await insertCheckResultAndDetectTransition(testDb, monitorId, {
      status: 'up',
      responseTimeMs: 10,
      errorMessage: null,
    })
    expect(recovery.previousStatus).toBe('degraded')
    expect(recovery.downtimeDurationMs).not.toBeNull()
  })
})
