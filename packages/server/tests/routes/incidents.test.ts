import { describe, expect, it } from 'vitest'
import { TEST_ADMIN_TOKEN, createTestUser, testApp, testDb } from '../setup.js'

const authHeader = {
  get authorization() {
    return `Bearer ${TEST_ADMIN_TOKEN}`
  },
}

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

async function createStatusPage(slug: string): Promise<number> {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/status-pages',
    headers: authHeader,
    payload: { name: 'Incidents Test', slug },
  })
  return response.json().id
}

describe('incidents API', () => {
  it('rejects requests without a session token', async () => {
    const statusPageId = await createStatusPage(`incidents-noauth-${Date.now()}`)
    const response = await testApp.inject({
      method: 'GET',
      url: `/api/status-pages/${statusPageId}/incidents`,
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects viewer-role writes with 403 but allows viewer reads', async () => {
    const statusPageId = await createStatusPage(`incidents-role-${Date.now()}`)
    const viewer = await createTestUser('viewer')

    const write = await testApp.inject({
      method: 'POST',
      url: `/api/status-pages/${statusPageId}/incidents`,
      headers: { authorization: `Bearer ${viewer.token}` },
      payload: { title: 'Should be forbidden' },
    })
    expect(write.statusCode).toBe(403)

    const read = await testApp.inject({
      method: 'GET',
      url: `/api/status-pages/${statusPageId}/incidents`,
      headers: { authorization: `Bearer ${viewer.token}` },
    })
    expect(read.statusCode).toBe(200)
  })

  it('creates an incident with affected monitors, appends an update, then updates and deletes it', async () => {
    const statusPageId = await createStatusPage(`incidents-crud-${Date.now()}`)
    const monitorId = await insertMonitor('incident monitor')

    const created = await testApp.inject({
      method: 'POST',
      url: `/api/status-pages/${statusPageId}/incidents`,
      headers: authHeader,
      payload: { title: 'Slow responses', affectedMonitorIds: [monitorId] },
    })
    expect(created.statusCode).toBe(201)
    const incident = created.json()
    expect(incident).toMatchObject({
      title: 'Slow responses',
      status: 'investigating',
      statusPageId,
      affectedMonitorIds: [monitorId],
      updates: [],
    })

    const updateResponse = await testApp.inject({
      method: 'POST',
      url: `/api/status-pages/${statusPageId}/incidents/${incident.id}/updates`,
      headers: authHeader,
      payload: { body: 'Investigating elevated latency.' },
    })
    expect(updateResponse.statusCode).toBe(201)
    const update = updateResponse.json()

    const listed = await testApp.inject({
      method: 'GET',
      url: `/api/status-pages/${statusPageId}/incidents`,
      headers: authHeader,
    })
    expect(listed.json()[0].updates).toHaveLength(1)
    expect(listed.json()[0].updates[0].body).toBe('Investigating elevated latency.')

    const patched = await testApp.inject({
      method: 'PATCH',
      url: `/api/status-pages/${statusPageId}/incidents/${incident.id}`,
      headers: authHeader,
      payload: { status: 'resolved' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().status).toBe('resolved')

    const deletedUpdate = await testApp.inject({
      method: 'DELETE',
      url: `/api/status-pages/${statusPageId}/incidents/${incident.id}/updates/${update.id}`,
      headers: authHeader,
    })
    expect(deletedUpdate.statusCode).toBe(204)

    const deleted = await testApp.inject({
      method: 'DELETE',
      url: `/api/status-pages/${statusPageId}/incidents/${incident.id}`,
      headers: authHeader,
    })
    expect(deleted.statusCode).toBe(204)
  })

  it('returns 404 for an incident id that belongs to a different status page', async () => {
    const pageA = await createStatusPage(`incidents-cross-a-${Date.now()}`)
    const pageB = await createStatusPage(`incidents-cross-b-${Date.now()}`)

    const created = await testApp.inject({
      method: 'POST',
      url: `/api/status-pages/${pageA}/incidents`,
      headers: authHeader,
      payload: { title: 'Belongs to page A' },
    })
    const incidentId = created.json().id

    const response = await testApp.inject({
      method: 'PATCH',
      url: `/api/status-pages/${pageB}/incidents/${incidentId}`,
      headers: authHeader,
      payload: { title: 'Should not apply' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('returns 404 when the status page itself does not exist', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/status-pages/999999/incidents',
      headers: authHeader,
    })
    expect(response.statusCode).toBe(404)
  })
})
