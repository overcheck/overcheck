import { describe, expect, it } from 'vitest'
import { pruneOldCheckResults } from '../../src/check-engine/repository.js'
import { testDb } from '../setup.js'

// Unique per run: the test DB is shared and never truncated between runs (ADR-005), this row is
// never deleted, and monitors.name has a unique constraint.
async function insertMonitor(): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({
      name: `retention test monitor ${Date.now()}-${Math.random()}`,
      type: 'tcp',
      interval_seconds: 10,
      host: '127.0.0.1',
      port: 1,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

describe('pruneOldCheckResults', () => {
  it('deletes only results older than the retention window', async () => {
    const monitorId = await insertMonitor()

    await testDb
      .insertInto('check_results')
      .values([
        { monitor_id: monitorId, status: 'up', response_time_ms: 5, checked_at: daysAgo(40) },
        { monitor_id: monitorId, status: 'up', response_time_ms: 5, checked_at: daysAgo(20) },
        { monitor_id: monitorId, status: 'up', response_time_ms: 5, checked_at: daysAgo(1) },
      ])
      .execute()

    const deletedCount = await pruneOldCheckResults(testDb, 30)
    expect(deletedCount).toBe(1)

    const remaining = await testDb
      .selectFrom('check_results')
      .select('checked_at')
      .where('monitor_id', '=', monitorId)
      .execute()
    expect(remaining).toHaveLength(2)
  })
})
