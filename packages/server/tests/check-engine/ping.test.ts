import { describe, expect, it, vi } from 'vitest'
import { createPingExecutor } from '../../src/check-engine/executors/ping.js'
import type { PingRunner } from '../../src/check-engine/executors/ping.js'
import { runWithRetries } from '../../src/check-engine/status.js'
import { makePingMonitor } from './fixtures.js'

describe('ping executor', () => {
  it('reports up when the injected runner succeeds', async () => {
    const runner: PingRunner = vi.fn().mockResolvedValue({ ok: true, responseTimeMs: 12 })
    const executor = createPingExecutor(runner)
    const monitor = makePingMonitor({ host: 'example.invalid' })

    const result = await executor(monitor)

    expect(result).toEqual({ ok: true, responseTimeMs: 12 })
    expect(runner).toHaveBeenCalledWith('example.invalid', monitor.timeoutMs)
  })

  it('reports down when the injected runner fails', async () => {
    const runner: PingRunner = vi
      .fn()
      .mockResolvedValue({ ok: false, responseTimeMs: 200, error: 'ping: permission denied' })
    const executor = createPingExecutor(runner)

    const result = await executor(makePingMonitor())

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/permission denied/)
  })

  it('is treated as degraded by the retry/status algorithm when the round trip is slow', async () => {
    const runner: PingRunner = vi.fn().mockResolvedValue({ ok: true, responseTimeMs: 500 })
    const executor = createPingExecutor(runner)
    const monitor = makePingMonitor({ degradedAfterMs: 100 })

    const outcome = await runWithRetries(monitor, executor)

    expect(outcome.status).toBe('degraded')
  })
})
