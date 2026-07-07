import { execFile } from 'node:child_process'
import type { ExecutorResult, Executor, PingMonitor } from '../types.js'

export type PingRunner = (host: string, timeoutMs: number) => Promise<ExecutorResult>

const TIME_PATTERN = /time[=<]([\d.]+)\s*ms/i

export const systemPingRunner: PingRunner = (host, timeoutMs) => {
  const start = performance.now()
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000))

  return new Promise<ExecutorResult>((resolve) => {
    execFile(
      'ping',
      ['-c', '1', '-W', String(timeoutSeconds), host],
      { timeout: timeoutMs },
      (err, stdout) => {
        const responseTimeMs = performance.now() - start
        if (err) {
          resolve({ ok: false, responseTimeMs, error: err.message })
          return
        }

        const match = TIME_PATTERN.exec(stdout)
        resolve({
          ok: true,
          responseTimeMs: match ? Number(match[1]) : responseTimeMs,
        })
      },
    )
  })
}

export function createPingExecutor(runner: PingRunner = systemPingRunner): Executor {
  return (monitor) => runner((monitor as PingMonitor).host, monitor.timeoutMs)
}
