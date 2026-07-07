import { describe, expect, it, vi } from 'vitest'
import { runWithRetries } from '../../src/check-engine/status.js'
import type { Executor } from '../../src/check-engine/types.js'
import { makeHttpMonitor } from './fixtures.js'

describe('runWithRetries', () => {
  it('returns up on a fast successful attempt with no retries', async () => {
    const monitor = makeHttpMonitor({ retries: 3, degradedAfterMs: 1000 })
    const executor: Executor = vi.fn().mockResolvedValue({ ok: true, responseTimeMs: 10 })

    const outcome = await runWithRetries(monitor, executor)

    expect(outcome).toEqual({ status: 'up', responseTimeMs: 10, errorMessage: null })
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('returns degraded when a successful attempt is slower than degradedAfterMs', async () => {
    const monitor = makeHttpMonitor({ retries: 3, degradedAfterMs: 100 })
    const executor: Executor = vi.fn().mockResolvedValue({ ok: true, responseTimeMs: 150 })

    const outcome = await runWithRetries(monitor, executor)

    expect(outcome.status).toBe('degraded')
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('does not retry after a success, even if slower attempts could still fit in the retry budget', async () => {
    const monitor = makeHttpMonitor({ retries: 5, degradedAfterMs: 1000 })
    const executor: Executor = vi.fn().mockResolvedValue({ ok: true, responseTimeMs: 5 })

    await runWithRetries(monitor, executor)

    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('retries on a hard failure and returns up if a later attempt succeeds', async () => {
    const monitor = makeHttpMonitor({ retries: 2 })
    const executor: Executor = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, responseTimeMs: 5, error: 'connection refused' })
      .mockResolvedValueOnce({ ok: true, responseTimeMs: 8 })

    const outcome = await runWithRetries(monitor, executor)

    expect(outcome).toEqual({ status: 'up', responseTimeMs: 8, errorMessage: null })
    expect(executor).toHaveBeenCalledTimes(2)
  })

  it('exhausts all retries and returns down with the last error when every attempt fails', async () => {
    const monitor = makeHttpMonitor({ retries: 2 })
    const executor: Executor = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, responseTimeMs: 1, error: 'first failure' })
      .mockResolvedValueOnce({ ok: false, responseTimeMs: 2, error: 'second failure' })
      .mockResolvedValueOnce({ ok: false, responseTimeMs: 3, error: 'third failure' })

    const outcome = await runWithRetries(monitor, executor)

    expect(outcome.status).toBe('down')
    expect(outcome.errorMessage).toBe('third failure')
    expect(outcome.responseTimeMs).toBe(3)
    expect(executor).toHaveBeenCalledTimes(3)
  })

  it('makes exactly one attempt when retries is 0', async () => {
    const monitor = makeHttpMonitor({ retries: 0 })
    const executor: Executor = vi
      .fn()
      .mockResolvedValue({ ok: false, responseTimeMs: 1, error: 'refused' })

    const outcome = await runWithRetries(monitor, executor)

    expect(outcome.status).toBe('down')
    expect(executor).toHaveBeenCalledTimes(1)
  })
})
