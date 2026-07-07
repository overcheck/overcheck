import type { CheckOutcome, Executor, Monitor } from './types.js'

export async function runWithRetries(monitor: Monitor, executor: Executor): Promise<CheckOutcome> {
  let lastError: string | undefined
  let lastResponseTimeMs = 0

  for (let attempt = 0; attempt <= monitor.retries; attempt++) {
    const result = await executor(monitor)
    lastResponseTimeMs = result.responseTimeMs

    if (result.ok) {
      const status = result.responseTimeMs >= monitor.degradedAfterMs ? 'degraded' : 'up'
      return { status, responseTimeMs: result.responseTimeMs, errorMessage: null }
    }

    lastError = result.error
  }

  return {
    status: 'down',
    responseTimeMs: lastResponseTimeMs,
    errorMessage: lastError ?? 'unknown error',
  }
}
