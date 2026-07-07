import { describe, expect, it } from 'vitest'
import { createTestUser, TEST_ADMIN_TOKEN, testApp, testDb } from '../setup.js'

// A getter, not a plain value: TEST_ADMIN_TOKEN is assigned asynchronously in setup.ts's
// beforeAll, which runs after this module's top-level code, so a plain object here would
// freeze in the pre-beforeAll `undefined`.
const adminHeader = {
  get authorization() {
    return `Bearer ${TEST_ADMIN_TOKEN}`
  },
}

describe('users API', () => {
  it('rejects non-admins from listing or creating users', async () => {
    const viewer = await createTestUser('viewer')
    const viewerHeader = { authorization: `Bearer ${viewer.token}` }

    const list = await testApp.inject({ method: 'GET', url: '/api/users', headers: viewerHeader })
    expect(list.statusCode).toBe(403)

    const create = await testApp.inject({
      method: 'POST',
      url: '/api/users',
      headers: viewerHeader,
      payload: { email: 'nope@example.com', password: 'irrelevant1', role: 'viewer' },
    })
    expect(create.statusCode).toBe(403)
  })

  it('admin creates, lists, fetches, updates, and deletes a user', async () => {
    const email = `crud-user-${Date.now()}@example.com`
    const created = await testApp.inject({
      method: 'POST',
      url: '/api/users',
      headers: adminHeader,
      payload: { email, password: 'initial-password', role: 'editor' },
    })
    expect(created.statusCode).toBe(201)
    const user = created.json()
    expect(user).toMatchObject({ email, role: 'editor' })

    const list = await testApp.inject({ method: 'GET', url: '/api/users', headers: adminHeader })
    expect(list.statusCode).toBe(200)
    expect(list.json().some((u: { id: number }) => u.id === user.id)).toBe(true)

    const fetched = await testApp.inject({
      method: 'GET',
      url: `/api/users/${user.id}`,
      headers: adminHeader,
    })
    expect(fetched.statusCode).toBe(200)

    const updated = await testApp.inject({
      method: 'PATCH',
      url: `/api/users/${user.id}`,
      headers: adminHeader,
      payload: { role: 'viewer' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().role).toBe('viewer')

    const deleted = await testApp.inject({
      method: 'DELETE',
      url: `/api/users/${user.id}`,
      headers: adminHeader,
    })
    expect(deleted.statusCode).toBe(204)

    const afterDelete = await testApp.inject({
      method: 'GET',
      url: `/api/users/${user.id}`,
      headers: adminHeader,
    })
    expect(afterDelete.statusCode).toBe(404)
  })

  it('returns 409 when creating a user with an email already in use', async () => {
    const email = `duplicate-user-${Date.now()}@example.com`
    const first = await testApp.inject({
      method: 'POST',
      url: '/api/users',
      headers: adminHeader,
      payload: { email, password: 'initial-password', role: 'viewer' },
    })
    expect(first.statusCode).toBe(201)

    const second = await testApp.inject({
      method: 'POST',
      url: '/api/users',
      headers: adminHeader,
      payload: { email, password: 'initial-password', role: 'viewer' },
    })
    expect(second.statusCode).toBe(409)
  })

  it('lets a user read and update their own record, but not their own role', async () => {
    const viewer = await createTestUser('viewer')
    const viewerHeader = { authorization: `Bearer ${viewer.token}` }

    const self = await testApp.inject({
      method: 'GET',
      url: `/api/users/${viewer.id}`,
      headers: viewerHeader,
    })
    expect(self.statusCode).toBe(200)

    const emailUpdate = await testApp.inject({
      method: 'PATCH',
      url: `/api/users/${viewer.id}`,
      headers: viewerHeader,
      payload: { email: `self-updated-${Date.now()}@example.com` },
    })
    expect(emailUpdate.statusCode).toBe(200)

    const roleEscalation = await testApp.inject({
      method: 'PATCH',
      url: `/api/users/${viewer.id}`,
      headers: viewerHeader,
      payload: { role: 'admin' },
    })
    expect(roleEscalation.statusCode).toBe(403)
  })

  it('blocks a user from reading or updating another user', async () => {
    const viewerA = await createTestUser('viewer')
    const viewerB = await createTestUser('viewer')

    const read = await testApp.inject({
      method: 'GET',
      url: `/api/users/${viewerB.id}`,
      headers: { authorization: `Bearer ${viewerA.token}` },
    })
    expect(read.statusCode).toBe(403)
  })

  it('refuses to delete or demote the last remaining admin', async () => {
    // The test DB is shared and never truncated between runs (ADR-005), so admin rows from
    // earlier runs/files can accumulate. Force a clean single-admin scenario so the guard is
    // unambiguous. This is the last test in the file, so clearing out TEST_ADMIN_TOKEN's
    // underlying user here is safe.
    await testDb.deleteFrom('users').where('role', '=', 'admin').execute()
    const solo = await createTestUser('admin')
    const soloHeader = { authorization: `Bearer ${solo.token}` }

    const demote = await testApp.inject({
      method: 'PATCH',
      url: `/api/users/${solo.id}`,
      headers: soloHeader,
      payload: { role: 'viewer' },
    })
    expect(demote.statusCode).toBe(400)

    const remove = await testApp.inject({
      method: 'DELETE',
      url: `/api/users/${solo.id}`,
      headers: soloHeader,
    })
    expect(remove.statusCode).toBe(400)
  })
})
