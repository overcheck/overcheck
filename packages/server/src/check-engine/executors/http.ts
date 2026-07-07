import type { ExecutorResult, HttpMonitor } from '../types.js'

export async function httpExecutor(monitor: HttpMonitor): Promise<ExecutorResult> {
  const start = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), monitor.timeoutMs)

  try {
    const response = await fetch(monitor.httpUrl, {
      method: monitor.httpMethod,
      signal: controller.signal,
    })
    const body = monitor.type === 'keyword' ? await response.text() : null
    const responseTimeMs = performance.now() - start

    if (response.status !== monitor.httpExpectedStatus) {
      return {
        ok: false,
        responseTimeMs,
        error: `expected status ${monitor.httpExpectedStatus}, got ${response.status}`,
      }
    }

    if (monitor.type === 'keyword' && monitor.httpBodyContains) {
      if (!body?.includes(monitor.httpBodyContains)) {
        return {
          ok: false,
          responseTimeMs,
          error: `response body did not contain "${monitor.httpBodyContains}"`,
        }
      }
    }

    return { ok: true, responseTimeMs }
  } catch (err) {
    const responseTimeMs = performance.now() - start
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      responseTimeMs,
      error: controller.signal.aborted ? 'timeout' : message,
    }
  } finally {
    clearTimeout(timer)
  }
}
