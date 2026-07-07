import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { tcpExecutor } from '../../src/check-engine/executors/tcp.js'
import { makeTcpMonitor } from './fixtures.js'

function startServer(onConnection?: (socket: import('node:net').Socket) => void) {
  const server = createServer((socket) => {
    onConnection?.(socket)
  })
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ port, close: () => new Promise((res) => server.close(() => res())) })
    })
  })
}

describe('tcpExecutor', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('reports up when the connection succeeds', async () => {
    const server = await startServer()
    close = server.close

    const result = await tcpExecutor(
      makeTcpMonitor({ host: '127.0.0.1', port: server.port, timeoutMs: 1000 }),
    )

    expect(result.ok).toBe(true)
  })

  it('reports down when the connection is refused', async () => {
    const server = await startServer()
    const refusedPort = server.port
    await server.close()

    const result = await tcpExecutor(
      makeTcpMonitor({ host: '127.0.0.1', port: refusedPort, timeoutMs: 1000 }),
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('reports down on socket timeout when the target silently drops packets', async () => {
    // 192.0.2.1 is TEST-NET-1 (RFC 5737) — reserved, non-routable, and reliably black-holed
    // rather than actively refused, so the connection attempt times out instead of erroring fast.
    const result = await tcpExecutor(
      makeTcpMonitor({ host: '192.0.2.1', port: 81, timeoutMs: 300 }),
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('timeout')
  }, 2000)
})
