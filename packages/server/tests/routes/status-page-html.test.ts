import { describe, expect, it } from 'vitest'
import { TEST_ADMIN_TOKEN, testApp, testDb } from '../setup.js'

const authHeader = {
  get authorization() {
    return `Bearer ${TEST_ADMIN_TOKEN}`
  },
}

async function insertMonitor(name: string): Promise<number> {
  const row = await testDb
    .insertInto('monitors')
    .values({
      name,
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

describe('status page HTML route', () => {
  it('returns a plain-HTML 404 page for an unknown slug', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/status/does-not-exist' })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('Status page not found')
  })

  it('renders 200 HTML with escaped monitor names and no auth required', async () => {
    const xssName = `<script>alert(1)</script> ${Date.now()}`
    const monitorId = await insertMonitor(xssName)
    const slug = `html-xss-${Date.now()}`

    await testApp.inject({
      method: 'POST',
      url: '/api/status-pages',
      headers: authHeader,
      payload: { name: 'HTML Route Test', slug, monitors: [{ monitorId }] },
    })

    const response = await testApp.inject({ method: 'GET', url: `/status/${slug}` })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).not.toContain('<script>alert(1)</script>')
    expect(response.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(response.body).toContain('Powered by Overcheck')
  })

  it('supports the window query param and keeps the 400 fallback to the default window', async () => {
    const monitorId = await insertMonitor(`window param ${Date.now()}`)
    const slug = `html-window-${Date.now()}`
    await testApp.inject({
      method: 'POST',
      url: '/api/status-pages',
      headers: authHeader,
      payload: { name: 'Window Test', slug, monitors: [{ monitorId }] },
    })

    const validWindow = await testApp.inject({ method: 'GET', url: `/status/${slug}?window=30d` })
    expect(validWindow.statusCode).toBe(200)
    expect(validWindow.body).toContain('Uptime (30d)')

    const invalidWindow = await testApp.inject({ method: 'GET', url: `/status/${slug}?window=bogus` })
    expect(invalidWindow.statusCode).toBe(200)
    expect(invalidWindow.body).toContain('Uptime (7d)')
  })
})
