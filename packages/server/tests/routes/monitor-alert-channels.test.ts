import { describe, expect, it } from 'vitest'
import { TEST_ADMIN_TOKEN, createTestUser, testApp } from '../setup.js'

const authHeader = {
  get authorization() {
    return `Bearer ${TEST_ADMIN_TOKEN}`
  },
}

async function createMonitor(overrides: Record<string, unknown> = {}) {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/monitors',
    headers: authHeader,
    payload: {
      name: `alert-channel-assignment monitor ${Date.now()}-${Math.random()}`,
      type: 'tcp',
      intervalSeconds: 10,
      host: '127.0.0.1',
      port: 1,
      enabled: false,
      ...overrides,
    },
  })
  return response.json()
}

async function createChannel(overrides: Record<string, unknown> = {}) {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/alert-channels',
    headers: authHeader,
    payload: {
      name: `assignment channel ${Date.now()}-${Math.random()}`,
      type: 'webhook',
      config: { url: 'https://example.com/hook' },
      ...overrides,
    },
  })
  return response.json()
}

describe('monitor alert-channel assignment API', () => {
  it('returns an empty list for a monitor with no assigned channels', async () => {
    const monitor = await createMonitor()
    const response = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: authHeader,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ alertChannelIds: [] })
  })

  it('returns 404 for an unknown monitor', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/monitors/999999/alert-channels',
      headers: authHeader,
    })
    expect(response.statusCode).toBe(404)
  })

  it('assigns channels via PUT with full-replace semantics', async () => {
    const monitor = await createMonitor()
    const channelA = await createChannel()
    const channelB = await createChannel()

    const assigned = await testApp.inject({
      method: 'PUT',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: authHeader,
      payload: { alertChannelIds: [channelA.id, channelB.id] },
    })
    expect(assigned.statusCode).toBe(200)
    expect(new Set(assigned.json().alertChannelIds)).toEqual(new Set([channelA.id, channelB.id]))

    const fetched = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: authHeader,
    })
    expect(new Set(fetched.json().alertChannelIds)).toEqual(new Set([channelA.id, channelB.id]))

    // Replacing with a subset drops the channel that isn't included.
    const replaced = await testApp.inject({
      method: 'PUT',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: authHeader,
      payload: { alertChannelIds: [channelB.id] },
    })
    expect(replaced.statusCode).toBe(200)
    expect(replaced.json()).toEqual({ alertChannelIds: [channelB.id] })

    // Replacing with an empty list clears all assignments.
    const cleared = await testApp.inject({
      method: 'PUT',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: authHeader,
      payload: { alertChannelIds: [] },
    })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toEqual({ alertChannelIds: [] })
  })

  it('returns 404 when assigning channels to an unknown monitor', async () => {
    const channel = await createChannel()
    const response = await testApp.inject({
      method: 'PUT',
      url: '/api/monitors/999999/alert-channels',
      headers: authHeader,
      payload: { alertChannelIds: [channel.id] },
    })
    expect(response.statusCode).toBe(404)
  })

  it('returns 400 when assigning a nonexistent channel id', async () => {
    const monitor = await createMonitor()
    const response = await testApp.inject({
      method: 'PUT',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: authHeader,
      payload: { alertChannelIds: [999999] },
    })
    expect(response.statusCode).toBe(400)
  })

  it('allows viewer to GET but not PUT', async () => {
    const monitor = await createMonitor()
    const channel = await createChannel()
    const viewer = await createTestUser('viewer')
    const header = { authorization: `Bearer ${viewer.token}` }

    const get = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: header,
    })
    expect(get.statusCode).toBe(200)

    const put = await testApp.inject({
      method: 'PUT',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: header,
      payload: { alertChannelIds: [channel.id] },
    })
    expect(put.statusCode).toBe(403)
  })

  it('allows editor to PUT', async () => {
    const monitor = await createMonitor()
    const channel = await createChannel()
    const editor = await createTestUser('editor')
    const header = { authorization: `Bearer ${editor.token}` }

    const put = await testApp.inject({
      method: 'PUT',
      url: `/api/monitors/${monitor.id}/alert-channels`,
      headers: header,
      payload: { alertChannelIds: [channel.id] },
    })
    expect(put.statusCode).toBe(200)
  })
})
