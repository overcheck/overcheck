import { describe, expect, it } from 'vitest'
import { createTestUser, testApp, testDb, TEST_USER_PASSWORD } from '../setup.js'

function getSetCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie']
  return Array.isArray(raw) ? raw[0] : (raw as string)
}

describe('login/logout HTML routes', () => {
  it('GET /login renders a form without requiring auth', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/login' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('<form method="POST" action="/login">')
  })

  it('POST /login with valid credentials sets an HttpOnly/SameSite=Lax cookie and redirects', async () => {
    const user = await createTestUser('admin')
    const response = await testApp.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(TEST_USER_PASSWORD)}`,
    })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('/dashboard')
    const cookie = getSetCookie(response)
    expect(cookie).toContain('session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('POST /login with wrong credentials re-renders the form with an error and sets no cookie', async () => {
    const user = await createTestUser('admin')
    const response = await testApp.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `email=${encodeURIComponent(user.email)}&password=wrong-password`,
    })
    expect(response.statusCode).toBe(401)
    expect(response.body).toContain('Invalid email or password')
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('a cookie from a successful login authenticates subsequent dashboard requests', async () => {
    const user = await createTestUser('admin')
    const loginResponse = await testApp.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(TEST_USER_PASSWORD)}`,
    })
    const cookie = getSetCookie(loginResponse).split(';')[0]

    const dashboardResponse = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors',
      headers: { cookie },
    })
    expect(dashboardResponse.statusCode).toBe(200)
    expect(dashboardResponse.headers['content-type']).toContain('text/html')
  })

  it('an unauthenticated dashboard request redirects to /login', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/dashboard/monitors' })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toContain('/login')
  })

  it('POST /logout clears the cookie and invalidates the session server-side', async () => {
    const user = await createTestUser('admin')
    const loginResponse = await testApp.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(TEST_USER_PASSWORD)}`,
    })
    const cookie = getSetCookie(loginResponse).split(';')[0]

    const sessionsBefore = await testDb
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', user.id)
      .execute()
    expect(sessionsBefore.length).toBeGreaterThan(0)

    const logoutResponse = await testApp.inject({
      method: 'POST',
      url: '/logout',
      headers: { cookie },
    })
    expect(logoutResponse.statusCode).toBe(302)
    expect(logoutResponse.headers.location).toBe('/login')
    expect(getSetCookie(logoutResponse)).toContain('Max-Age=0')

    // createTestUser already seeded one session (its own token) before /login created a
    // second — logout only deletes the session matching the cookie's token, so exactly one
    // of the two should be gone, not all of them.
    const sessionsAfter = await testDb
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', user.id)
      .execute()
    expect(sessionsAfter.length).toBe(sessionsBefore.length - 1)

    const afterLogout = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors',
      headers: { cookie },
    })
    expect(afterLogout.statusCode).toBe(302)
    expect(afterLogout.headers.location).toContain('/login')
  })

  it('does not affect bearer-token auth for the JSON API', async () => {
    const user = await createTestUser('admin')
    const apiLogin = await testApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: TEST_USER_PASSWORD },
    })
    expect(apiLogin.statusCode).toBe(200)
    const { token } = JSON.parse(apiLogin.body) as { token: string }

    const response = await testApp.inject({
      method: 'GET',
      url: '/api/monitors',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(200)
  })
})
