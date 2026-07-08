import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import { httpExecutor } from './executors/http.js'
import { createPingExecutor } from './executors/ping.js'
import { tcpExecutor } from './executors/tcp.js'
import { insertCheckResultAndDetectTransition } from './repository.js'
import { runWithRetries } from './status.js'
import type { Executor, Monitor, StateTransition } from './types.js'

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
  private monitors = new Map<number, Monitor>()
  private timers = new Map<number, NodeJS.Timeout>()
  private inFlight = new Set<Promise<void>>()
  private stopped = false

  constructor(
    private readonly db: Kysely<Database>,
    private readonly executorFor: (monitor: Monitor) => Executor = defaultExecutorFor,
    private readonly dispatchAlerts: (
      monitor: Monitor,
      transition: StateTransition,
    ) => Promise<void> = async () => {},
  ) {}

  start(monitors: Monitor[]): void {
    this.stopped = false
    for (const monitor of monitors) {
      this.addMonitor(monitor)
    }
  }

  /** Starts checking a monitor immediately. Used both by start() and by monitor-create API calls. */
  addMonitor(monitor: Monitor): void {
    this.monitors.set(monitor.id, monitor)
    this.scheduleNext(monitor, 0)
  }

  /** Stops checking a monitor (e.g. after a delete). Any in-flight check is left to finish. */
  removeMonitor(monitorId: number): void {
    this.monitors.delete(monitorId)
    const timer = this.timers.get(monitorId)
    if (timer) clearTimeout(timer)
    this.timers.delete(monitorId)
  }

  /** Applies updated monitor config (interval/timeout/etc.) starting from the next check. */
  updateMonitor(monitor: Monitor): void {
    this.removeMonitor(monitor.id)
    this.addMonitor(monitor)
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.monitors.clear()
    await Promise.allSettled([...this.inFlight])
  }

  private scheduleNext(monitor: Monitor, delayMs: number): void {
    const timer = setTimeout(() => {
      if (this.stopped || !this.monitors.has(monitor.id)) return

      const cycle = this.runCheckCycle(monitor).finally(() => {
        this.inFlight.delete(cycle)
      })
      this.inFlight.add(cycle)

      void cycle.then(() => {
        if (!this.stopped && this.monitors.has(monitor.id)) {
          this.scheduleNext(monitor, monitor.intervalSeconds * 1000)
        }
      })
    }, delayMs)

    this.timers.set(monitor.id, timer)
  }

  private async runCheckCycle(monitor: Monitor): Promise<void> {
    const outcome = await runWithRetries(monitor, this.executorFor(monitor))
    // The monitor may have been removed (e.g. deleted via the API) while this check was
    // in flight — skip the write rather than violate check_results' FK to monitors.
    if (!this.monitors.has(monitor.id)) return
    const transition = await insertCheckResultAndDetectTransition(this.db, monitor.id, outcome)
    if (transition.previousStatus !== null && transition.previousStatus !== transition.newStatus) {
      await this.dispatchAlerts(monitor, transition)
    }
  }
}
