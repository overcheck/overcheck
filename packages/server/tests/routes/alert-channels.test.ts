import { describe, expect, it } from 'vitest'
import { TEST_API_KEY, testApp } from '../setup.js'

const authHeader = { authorization: `Bearer ${TEST_API_KEY}` }

describe('alert-channels API', () => {
  it('rejects requests without an API key', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/api/alert-channels' })
    expect(response.statusCode).toBe(401)
  })

  it('creates, fetches, lists, updates, and deletes an alert channel', async () => {
    const created = await testApp.inject({
      method: 'POST',
      url: '/api/alert-channels',
      headers: authHeader,
      payload: {
        name: 'ops slack',
        type: 'slack',
        config: { webhookUrl: 'https://hooks.slack.example/abc' },
      },
    })
    expect(created.statusCode).toBe(201)
    const channel = created.json()
    expect(channel).toMatchObject({
      name: 'ops slack',
      type: 'slack',
      config: { webhookUrl: 'https://hooks.slack.example/abc' },
      enabled: true,
    })

    const fetched = await testApp.inject({
      method: 'GET',
      url: `/api/alert-channels/${channel.id}`,
      headers: authHeader,
    })
    expect(fetched.statusCode).toBe(200)

    const list = await testApp.inject({
      method: 'GET',
      url: '/api/alert-channels',
      headers: authHeader,
    })
    expect(list.json().some((c: { id: number }) => c.id === channel.id)).toBe(true)

    const updated = await testApp.inject({
      method: 'PATCH',
      url: `/api/alert-channels/${channel.id}`,
      headers: authHeader,
      payload: { enabled: false, config: { webhookUrl: 'https://hooks.slack.example/xyz' } },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({
      enabled: false,
      config: { webhookUrl: 'https://hooks.slack.example/xyz' },
    })

    const deleted = await testApp.inject({
      method: 'DELETE',
      url: `/api/alert-channels/${channel.id}`,
      headers: authHeader,
    })
    expect(deleted.statusCode).toBe(204)

    const afterDelete = await testApp.inject({
      method: 'GET',
      url: `/api/alert-channels/${channel.id}`,
      headers: authHeader,
    })
    expect(afterDelete.statusCode).toBe(404)
  })

  it('returns 404 for an unknown alert channel id', async () => {
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/alert-channels/999999',
      headers: authHeader,
    })
    expect(response.statusCode).toBe(404)
  })

  it('rejects an invalid channel type with 400', async () => {
    const response = await testApp.inject({
      method: 'POST',
      url: '/api/alert-channels',
      headers: authHeader,
      payload: { name: 'bad', type: 'carrier-pigeon', config: {} },
    })
    expect(response.statusCode).toBe(400)
  })
})
