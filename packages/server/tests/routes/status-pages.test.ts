import { describe, expect, it } from 'vitest'
import { TEST_API_KEY, testApp, testDb } from '../setup.js'

const authHeader = { authorization: `Bearer ${TEST_API_KEY}` }

// Callers pass a human-readable label; a unique suffix is appended since the test DB is shared
// and never truncated between runs (ADR-005), these rows are never deleted, and monitors.name is
// now unique.
async function insertMonitor(label: string): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({
      name: `${label} ${Date.now()}-${Math.random()}`,
      type: 'tcp',
      enabled: false,
      interval_seconds: 10,
      host: '127.0.0.1',
      port: 1,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

describe('status-pages API', () => {
  it('rejects requests without an API key', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/api/status-pages' })
    expect(response.statusCode).toBe(401)
  })

  it('creates a status page with associated monitors, then updates the association', async () => {
    const monitorA = await insertMonitor('status page monitor a')
    const monitorB = await insertMonitor('status page monitor b')

    const created = await testApp.inject({
      method: 'POST',
      url: '/api/status-pages',
      headers: authHeader,
      payload: { name: 'Public Status', slug: 'public-status', monitorIds: [monitorA, monitorB] },
    })
    expect(created.statusCode).toBe(201)
    const page = created.json()
    expect(page).toMatchObject({ name: 'Public Status', slug: 'public-status' })
    expect(page.monitorIds).toEqual([monitorA, monitorB])

    const fetched = await testApp.inject({
      method: 'GET',
      url: `/api/status-pages/${page.id}`,
      headers: authHeader,
    })
    expect(fetched.json().monitorIds).toEqual([monitorA, monitorB])

    const updated = await testApp.inject({
      method: 'PATCH',
      url: `/api/status-pages/${page.id}`,
      headers: authHeader,
      payload: { monitorIds: [monitorB] },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().monitorIds).toEqual([monitorB])

    const deleted = await testApp.inject({
      method: 'DELETE',
      url: `/api/status-pages/${page.id}`,
      headers: authHeader,
    })
    expect(deleted.statusCode).toBe(204)
  })

  it('returns 409 when creating a status page with a slug already in use', async () => {
    // Unique per run: the test DB is shared and never truncated between runs (ADR-005), so a
    // fixed slug would collide with a leftover row from a previous run instead of exercising
    // the conflict this test creates itself.
    const slug = `duplicate-slug-${Date.now()}`
    const first = await testApp.inject({
      method: 'POST',
      url: '/api/status-pages',
      headers: authHeader,
      payload: { name: 'First', slug },
    })
    expect(first.statusCode).toBe(201)

    const second = await testApp.inject({
      method: 'POST',
      url: '/api/status-pages',
      headers: authHeader,
      payload: { name: 'Second', slug },
    })
    expect(second.statusCode).toBe(409)
  })

  it('returns 404 for an unknown status page id', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/status-pages/999999',
      headers: authHeader,
    })
    expect(response.statusCode).toBe(404)
  })

  it('rejects a slug with invalid characters with 400', async () => {
    const response = await testApp.inject({
      method: 'POST',
      url: '/api/status-pages',
      headers: authHeader,
      payload: { name: 'Bad Slug', slug: 'Not A Valid Slug!' },
    })
    expect(response.statusCode).toBe(400)
  })
})
