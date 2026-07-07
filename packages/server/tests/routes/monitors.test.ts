import { createServer } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { TEST_API_KEY, testApp, testDb } from '../setup.js'

const authHeader = { authorization: `Bearer ${TEST_API_KEY}` }

async function createMonitor(overrides: Record<string, unknown> = {}) {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/monitors',
    headers: authHeader,
    payload: {
      name: 'test monitor',
      type: 'tcp',
      intervalSeconds: 10,
      host: '127.0.0.1',
      port: 1,
      enabled: false,
      ...overrides,
    },
  })
  return response
}

describe('monitors API', () => {
  it('rejects requests without an API key', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/api/monitors' })
    expect(response.statusCode).toBe(401)
  })

  it('rejects requests with the wrong API key', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/monitors',
      headers: { authorization: 'Bearer wrong-key' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('creates, fetches, lists, updates, and deletes a monitor', async () => {
    const created = await createMonitor({ name: 'crud monitor' })
    expect(created.statusCode).toBe(201)
    const monitor = created.json()
    expect(monitor).toMatchObject({
      name: 'crud monitor',
      type: 'tcp',
      host: '127.0.0.1',
      port: 1,
      enabled: false,
    })

    const fetched = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
    })
    expect(fetched.statusCode).toBe(200)
    expect(fetched.json().name).toBe('crud monitor')

    const list = await testApp.inject({
      method: 'GET',
      url: '/api/monitors',
      headers: authHeader,
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().some((m: { id: number }) => m.id === monitor.id)).toBe(true)

    const updated = await testApp.inject({
      method: 'PATCH',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
      payload: { name: 'renamed monitor', intervalSeconds: 20 },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({ name: 'renamed monitor', intervalSeconds: 20 })

    const deleted = await testApp.inject({
      method: 'DELETE',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
    })
    expect(deleted.statusCode).toBe(204)

    const afterDelete = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
    })
    expect(afterDelete.statusCode).toBe(404)
  })

  it('returns 404 for an unknown monitor id', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/monitors/999999',
      headers: authHeader,
    })
    expect(response.statusCode).toBe(404)
  })

  it('rejects a tcp monitor missing host/port with 400', async () => {
    const response = await testApp.inject({
      method: 'POST',
      url: '/api/monitors',
      headers: authHeader,
      payload: { name: 'bad tcp', type: 'tcp', intervalSeconds: 10 },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/host is required/)
  })

  it('rejects a keyword monitor missing httpBodyContains with 400', async () => {
    const response = await testApp.inject({
      method: 'POST',
      url: '/api/monitors',
      headers: authHeader,
      payload: {
        name: 'bad keyword',
        type: 'keyword',
        intervalSeconds: 10,
        httpUrl: 'http://127.0.0.1/',
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/httpBodyContains is required/)
  })

  it('rejects an interval below the 10s minimum with 400', async () => {
    const response = await createMonitor({ intervalSeconds: 5 })
    expect(response.statusCode).toBe(400)
  })

  it('returns 409 when creating a monitor with a name already in use', async () => {
    // Unique per run: the test DB is shared and never truncated between runs (ADR-005), so a
    // fixed name would collide with a leftover row from a previous run instead of exercising
    // the conflict this test creates itself.
    const name = `duplicate-monitor-${Date.now()}`
    const first = await createMonitor({ name })
    expect(first.statusCode).toBe(201)

    const second = await createMonitor({ name })
    expect(second.statusCode).toBe(409)
  })

  it('returns 409 when renaming a monitor to a name already in use', async () => {
    const nameA = `rename-target-${Date.now()}`
    const nameB = `rename-source-${Date.now()}`
    const a = await createMonitor({ name: nameA })
    expect(a.statusCode).toBe(201)
    const b = await createMonitor({ name: nameB })
    expect(b.statusCode).toBe(201)

    const renamed = await testApp.inject({
      method: 'PATCH',
      url: `/api/monitors/${b.json().id}`,
      headers: authHeader,
      payload: { name: nameA },
    })
    expect(renamed.statusCode).toBe(409)
  })

  describe('scheduler integration', () => {
    let server: Server | undefined

    afterEach(async () => {
      if (server?.listening) await new Promise((res) => server?.close(() => res(undefined)))
      server = undefined
    })

    it('starts checking a monitor created via the API, and stops once disabled', async () => {
      server = createServer()
      await new Promise<void>((res) => server?.listen(0, '127.0.0.1', res))
      const port = (server.address() as AddressInfo).port

      const created = await createMonitor({
        // Unique per run: this monitor is disabled rather than deleted below, so it persists in
        // the shared, never-truncated test DB (ADR-005) and would collide with a leftover row
        // from a previous run under the name-uniqueness constraint.
        name: `live scheduler monitor ${Date.now()}`,
        intervalSeconds: 10,
        host: '127.0.0.1',
        port,
        enabled: true,
      })
      expect(created.statusCode).toBe(201)
      const monitorId = created.json().id

      const countFor = async () => {
        const row = await testDb
          .selectFrom('check_results')
          .select(testDb.fn.countAll().as('count'))
          .where('monitor_id', '=', monitorId)
          .executeTakeFirstOrThrow()
        return Number(row.count)
      }

      await new Promise<void>((resolve, reject) => {
        const start = Date.now()
        const poll = async () => {
          if ((await countFor()) > 0) return resolve()
          if (Date.now() - start > 2000) return reject(new Error('no check_results recorded'))
          setTimeout(() => void poll(), 20)
        }
        void poll()
      })

      // Disabling (rather than deleting) lets us compare check_results counts before/after
      // without a delete's ON DELETE CASCADE also wiping the very rows we're counting.
      const disabled = await testApp.inject({
        method: 'PATCH',
        url: `/api/monitors/${monitorId}`,
        headers: authHeader,
        payload: { enabled: false },
      })
      expect(disabled.statusCode).toBe(200)

      const countAfterDisable = await countFor()
      await new Promise((r) => setTimeout(r, 300))
      expect(await countFor()).toBe(countAfterDisable)
    }, 5000)
  })
})
