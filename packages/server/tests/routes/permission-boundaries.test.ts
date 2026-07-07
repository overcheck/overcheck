import { describe, expect, it } from 'vitest'
import { createTestUser, testApp } from '../setup.js'

interface Resource {
  name: string
  listPath: string
  createPayload: Record<string, unknown>
}

const resources: Resource[] = [
  {
    name: 'monitors',
    listPath: '/api/monitors',
    createPayload: {
      name: `perm-monitor-${Date.now()}`,
      type: 'tcp',
      intervalSeconds: 10,
      host: '127.0.0.1',
      port: 1,
    },
  },
  {
    name: 'alert-channels',
    listPath: '/api/alert-channels',
    createPayload: {
      name: `perm-channel-${Date.now()}`,
      type: 'webhook',
      config: { url: 'https://example.com/hook' },
    },
  },
  {
    name: 'status-pages',
    listPath: '/api/status-pages',
    createPayload: { name: 'perm status page', slug: `perm-status-page-${Date.now()}` },
  },
]

describe('permission boundaries', () => {
  it('rejects every /api route without a session token', async () => {
    for (const resource of resources) {
      const response = await testApp.inject({ method: 'GET', url: resource.listPath })
      expect(response.statusCode).toBe(401)
    }
    const users = await testApp.inject({ method: 'GET', url: '/api/users' })
    expect(users.statusCode).toBe(401)
  })

  it.each(resources)('viewer can GET but not POST $name', async (resource) => {
    const viewer = await createTestUser('viewer')
    const header = { authorization: `Bearer ${viewer.token}` }

    const list = await testApp.inject({ method: 'GET', url: resource.listPath, headers: header })
    expect(list.statusCode).toBe(200)

    const create = await testApp.inject({
      method: 'POST',
      url: resource.listPath,
      headers: header,
      payload: resource.createPayload,
    })
    expect(create.statusCode).toBe(403)
  })

  it.each(resources)('editor can POST $name', async (resource) => {
    const editor = await createTestUser('editor')
    const header = { authorization: `Bearer ${editor.token}` }

    const create = await testApp.inject({
      method: 'POST',
      url: resource.listPath,
      headers: header,
      payload: { ...resource.createPayload, name: `${resource.createPayload.name}-editor` },
    })
    expect(create.statusCode).toBe(201)
  })

  it('editor is blocked from user management', async () => {
    const editor = await createTestUser('editor')
    const header = { authorization: `Bearer ${editor.token}` }

    const list = await testApp.inject({ method: 'GET', url: '/api/users', headers: header })
    expect(list.statusCode).toBe(403)

    const create = await testApp.inject({
      method: 'POST',
      url: '/api/users',
      headers: header,
      payload: { email: 'blocked@example.com', password: 'irrelevant1', role: 'viewer' },
    })
    expect(create.statusCode).toBe(403)
  })
})
