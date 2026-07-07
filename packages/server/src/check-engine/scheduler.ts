import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import { httpExecutor } from './executors/http.js'
import { createPingExecutor } from './executors/ping.js'
import { tcpExecutor } from './executors/tcp.js'
import { insertCheckResult } from './repository.js'
import { runWithRetries } from './status.js'
import type { Executor, Monitor } from './types.js'

function defaultExecutorFor(monitor: Monitor): Executor {
  switch (monitor.type) {
    case 'http':
    case 'keyword':
      return httpExecutor as Executor
    case 'tcp':
      return tcpExecutor as Executor
    case 'ping':
      return createPingExecutor()
  }
}

export class CheckScheduler {
  private timers = new Map<number, NodeJS.Timeout>()
  private inFlight = new Set<Promise<void>>()
  private stopped = false

  constructor(
    private readonly db: Kysely<Database>,
    private readonly executorFor: (monitor: Monitor) => Executor = defaultExecutorFor,
  ) {}

  start(monitors: Monitor[]): void {
    this.stopped = false
    for (const monitor of monitors) {
      this.scheduleNext(monitor, 0)
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    await Promise.allSettled([...this.inFlight])
  }

  private scheduleNext(monitor: Monitor, delayMs: number): void {
    const timer = setTimeout(() => {
      if (this.stopped) return

      const cycle = this.runCheckCycle(monitor).finally(() => {
        this.inFlight.delete(cycle)
      })
      this.inFlight.add(cycle)

      void cycle.then(() => {
        if (!this.stopped) {
          this.scheduleNext(monitor, monitor.intervalSeconds * 1000)
        }
      })
    }, delayMs)

    this.timers.set(monitor.id, timer)
  }

  private async runCheckCycle(monitor: Monitor): Promise<void> {
    const outcome = await runWithRetries(monitor, this.executorFor(monitor))
    await insertCheckResult(this.db, monitor.id, outcome)
  }
}
