import { describe, expect, it } from 'vitest'
import { createTestUser, testApp, testDb, TEST_USER_PASSWORD } from '../setup.js'

describe('auth API', () => {
  it('rejects registration once a user already exists', async () => {
    // setup.ts always seeds an admin before any test runs, so the table is guaranteed
    // non-empty here.
    const response = await testApp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'someone@example.com', password: 'irrelevant-password' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('creates the first admin and returns a session when no users exist', async () => {
    await testDb.deleteFrom('sessions').execute()
    await testDb.deleteFrom('users').execute()

    const response = await testApp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bootstrap@example.com', password: 'bootstrap-password' },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.user).toMatchObject({ email: 'bootstrap@example.com', role: 'admin' })
    expect(typeof body.token).toBe('string')

    // Confirm the token actually authenticates.
    const me = await testApp.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${body.token}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ email: 'bootstrap@example.com', role: 'admin' })

    // Now closed again.
    const secondRegister = await testApp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'someone-else@example.com', password: 'irrelevant-password' },
    })
    expect(secondRegister.statusCode).toBe(403)
  })

  it('logs in with correct credentials and rejects incorrect ones', async () => {
    const user = await createTestUser('viewer')

    const wrongPassword = await testApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'not-the-password' },
    })
    expect(wrongPassword.statusCode).toBe(401)

    const unknownEmail = await testApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: TEST_USER_PASSWORD },
    })
    expect(unknownEmail.statusCode).toBe(401)

    const success = await testApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: TEST_USER_PASSWORD },
    })
    expect(success.statusCode).toBe(200)
    expect(success.json().user).toMatchObject({ email: user.email, role: 'viewer' })
    expect(typeof success.json().token).toBe('string')
  })

  it('logout invalidates the session token', async () => {
    const user = await createTestUser('editor')
    const authHeader = { authorization: `Bearer ${user.token}` }

    const meBefore = await testApp.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader,
    })
    expect(meBefore.statusCode).toBe(200)

    const logout = await testApp.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: authHeader,
    })
    expect(logout.statusCode).toBe(204)

    const meAfter = await testApp.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader,
    })
    expect(meAfter.statusCode).toBe(401)
  })

  it('/auth/me returns the caller identity', async () => {
    const user = await createTestUser('viewer')
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${user.token}` },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id: user.id, email: user.email, role: 'viewer' })
  })
})
