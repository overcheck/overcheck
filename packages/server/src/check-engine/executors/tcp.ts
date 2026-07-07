import { Socket } from 'node:net'
import type { ExecutorResult, TcpMonitor } from '../types.js'

export async function tcpExecutor(monitor: TcpMonitor): Promise<ExecutorResult> {
  const start = performance.now()

  return new Promise<ExecutorResult>((resolve) => {
    const socket = new Socket()

    const finish = (result: ExecutorResult) => {
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(monitor.timeoutMs)

    socket.once('connect', () => {
      finish({ ok: true, responseTimeMs: performance.now() - start })
    })

    socket.once('timeout', () => {
      finish({ ok: false, responseTimeMs: performance.now() - start, error: 'timeout' })
    })

    socket.once('error', (err) => {
      finish({ ok: false, responseTimeMs: performance.now() - start, error: err.message })
    })

    socket.connect({ host: monitor.host, port: monitor.port })
  })
}
