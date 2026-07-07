import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { httpExecutor } from '../../src/check-engine/executors/http.js'
import { makeHttpMonitor } from './fixtures.js'

type Handler = Parameters<typeof createServer>[0]

function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((res) => server.close(() => res())),
      })
    })
  })
}

describe('httpExecutor', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('reports up for a fast 200 response', async () => {
    const server = await startServer((_req, res) => res.writeHead(200).end('ok'))
    close = server.close

    const result = await httpExecutor(makeHttpMonitor({ httpUrl: server.url, timeoutMs: 1000 }))

    expect(result.ok).toBe(true)
  })

  it('reports down when the status does not match httpExpectedStatus', async () => {
    const server = await startServer((_req, res) => res.writeHead(500).end('boom'))
    close = server.close

    const result = await httpExecutor(
      makeHttpMonitor({ httpUrl: server.url, timeoutMs: 1000, httpExpectedStatus: 200 }),
    )

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/expected status 200, got 500/)
  })

  it('reports down on timeout when the server never responds', async () => {
    const server = await startServer(() => {
      /* never respond */
    })
    close = server.close

    const result = await httpExecutor(makeHttpMonitor({ httpUrl: server.url, timeoutMs: 50 }))

    expect(result.ok).toBe(false)
    expect(result.error).toBe('timeout')
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(40)
  })

  it('reports up for a keyword monitor whose body contains the expected text', async () => {
    const server = await startServer((_req, res) => res.writeHead(200).end('all systems go'))
    close = server.close

    const result = await httpExecutor(
      makeHttpMonitor({
        type: 'keyword',
        httpUrl: server.url,
        timeoutMs: 1000,
        httpBodyContains: 'systems go',
      }),
    )

    expect(result.ok).toBe(true)
  })

  it('reports down for a keyword monitor whose body is missing the expected text', async () => {
    const server = await startServer((_req, res) => res.writeHead(200).end('nothing to see'))
    close = server.close

    const result = await httpExecutor(
      makeHttpMonitor({
        type: 'keyword',
        httpUrl: server.url,
        timeoutMs: 1000,
        httpBodyContains: 'systems go',
      }),
    )

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/did not contain/)
  })
})
