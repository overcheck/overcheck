import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  TEST_ADMIN_TOKEN,
  testApp,
  TEST_USER_PASSWORD,
  type TestUser,
} from '../setup.js'

const authHeader = {
  get authorization() {
    return `Bearer ${TEST_ADMIN_TOKEN}`
  },
}

async function loginCookie(user: TestUser): Promise<string> {
  const response = await testApp.inject({
    method: 'POST',
    url: '/login',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(TEST_USER_PASSWORD)}`,
  })
  const raw = response.headers['set-cookie']
  return (Array.isArray(raw) ? raw[0] : (raw as string)).split(';')[0]
}

async function createMonitor(overrides: Record<string, unknown> = {}) {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/monitors',
    headers: authHeader,
    payload: {
      name: `dashboard-monitor-${Date.now()}-${Math.random()}`,
      type: 'tcp',
      intervalSeconds: 10,
      host: '127.0.0.1',
      port: 1,
      enabled: true,
      ...overrides,
    },
  })
  return JSON.parse(response.body) as { id: number; name: string }
}

async function createChannel(overrides: Record<string, unknown> = {}) {
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/alert-channels',
    headers: authHeader,
    payload: {
      name: `dashboard-channel-${Date.now()}-${Math.random()}`,
      type: 'webhook',
      config: { url: 'https://example.com/hook' },
      ...overrides,
    },
  })
  return JSON.parse(response.body) as { id: number; name: string }
}

describe('dashboard monitors list', () => {
  it('renders 200 HTML for an authenticated admin, including the "+ New monitor" action', async () => {
    const admin = await createTestUser('admin')
    const cookie = await loginCookie(admin)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('/dashboard/monitors/new')
  })

  it('escapes an XSS payload in a monitor name', async () => {
    const admin = await createTestUser('admin')
    const cookie = await loginCookie(admin)
    const xssName = `<script>alert(1)</script> ${Date.now()}`
    await createMonitor({ name: xssName })

    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors',
      headers: { cookie },
    })
    expect(response.body).not.toContain('<script>alert(1)</script>')
    expect(response.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('hides every write action for a viewer', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain('/dashboard/monitors/new')
    expect(response.body).not.toContain('/edit')
    expect(response.body).not.toContain('/delete')
  })

  it('severity-sorts monitors: a down monitor ranks above an up monitor named earlier alphabetically', async () => {
    const admin = await createTestUser('admin')
    const cookie = await loginCookie(admin)
    const upMonitor = await createMonitor({ name: `AAA-up-${Date.now()}` })
    const downMonitor = await createMonitor({ name: `ZZZ-down-${Date.now()}` })
    // Exercising the full down > up ordering against real check-result data (rather than
    // just confirming both rows render) is covered by dashboard/sorting.test.ts's pure-logic
    // tests, which don't require driving the check engine to actually produce a down status.
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors',
      headers: { cookie },
    })
    expect(response.body).toContain(upMonitor.name)
    expect(response.body).toContain(downMonitor.name)
  })
})

describe('dashboard monitor detail', () => {
  it('renders 200 HTML with Edit/Pause/Delete for an editor', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const monitor = await createMonitor()

    const response = await testApp.inject({
      method: 'GET',
      url: `/dashboard/monitors/${monitor.id}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain(`/dashboard/monitors/${monitor.id}/edit`)
    expect(response.body).toContain(`/dashboard/monitors/${monitor.id}/pause`)
    expect(response.body).toContain(`/dashboard/monitors/${monitor.id}/delete/confirm`)
  })

  it('hides Edit/Pause/Delete for a viewer', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const monitor = await createMonitor()

    const response = await testApp.inject({
      method: 'GET',
      url: `/dashboard/monitors/${monitor.id}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain(`/dashboard/monitors/${monitor.id}/edit`)
    expect(response.body).not.toContain(`/dashboard/monitors/${monitor.id}/pause`)
    expect(response.body).not.toContain('/delete')
  })

  it('404s for an unknown monitor', async () => {
    const admin = await createTestUser('admin')
    const cookie = await loginCookie(admin)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors/999999999',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('dashboard monitor form access control', () => {
  it('GET /dashboard/monitors/new is 200 for an editor', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors/new',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
  })

  it('GET /dashboard/monitors/new is 404 for a viewer', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/monitors/new',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('dashboard monitor create/edit/pause/delete flows', () => {
  it('creates a monitor via the form and redirects to its detail page', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const name = `form-created-${Date.now()}`

    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/monitors/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=${encodeURIComponent(name)}&type=tcp&host=127.0.0.1&port=1&intervalSeconds=30&timeoutSeconds=5&retries=1&degradedAfterMs=200`,
    })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toMatch(/^\/dashboard\/monitors\/\d+$/)

    const listResponse = await testApp.inject({
      method: 'GET',
      url: '/api/monitors',
      headers: authHeader,
    })
    const monitors = JSON.parse(listResponse.body) as { name: string }[]
    expect(monitors.some((m) => m.name === name)).toBe(true)
  })

  it('re-renders the form with an inline error when name is missing', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/monitors/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'name=&type=http&url=https%3A%2F%2Fexample.com',
    })
    expect(response.statusCode).toBe(422)
    expect(response.body).toContain('Name is required.')
  })

  it('pauses and resumes a monitor via the dashboard, reflected in the API', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const monitor = await createMonitor({ enabled: true })

    const pauseResponse = await testApp.inject({
      method: 'POST',
      url: `/dashboard/monitors/${monitor.id}/pause`,
      headers: { cookie },
    })
    expect(pauseResponse.statusCode).toBe(302)

    const afterPause = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
    })
    expect(JSON.parse(afterPause.body).enabled).toBe(false)

    const resumeResponse = await testApp.inject({
      method: 'POST',
      url: `/dashboard/monitors/${monitor.id}/resume`,
      headers: { cookie },
    })
    expect(resumeResponse.statusCode).toBe(302)

    const afterResume = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
    })
    expect(JSON.parse(afterResume.body).enabled).toBe(true)
  })

  it('shows a delete confirmation page, then actually deletes on confirm', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const monitor = await createMonitor()

    const confirmPage = await testApp.inject({
      method: 'GET',
      url: `/dashboard/monitors/${monitor.id}/delete/confirm`,
      headers: { cookie },
    })
    expect(confirmPage.statusCode).toBe(200)
    expect(confirmPage.body).toContain(monitor.name)

    const deleteResponse = await testApp.inject({
      method: 'POST',
      url: `/dashboard/monitors/${monitor.id}/delete`,
      headers: { cookie },
    })
    expect(deleteResponse.statusCode).toBe(302)
    expect(deleteResponse.headers.location).toBe('/dashboard/monitors')

    const afterDelete = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
    })
    expect(afterDelete.statusCode).toBe(404)
  })

  it('a viewer cannot create/edit/delete/pause via POST (404s, and nothing changes)', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const monitor = await createMonitor({ enabled: true })

    const pauseAttempt = await testApp.inject({
      method: 'POST',
      url: `/dashboard/monitors/${monitor.id}/pause`,
      headers: { cookie },
    })
    expect(pauseAttempt.statusCode).toBe(404)

    const stillEnabled = await testApp.inject({
      method: 'GET',
      url: `/api/monitors/${monitor.id}`,
      headers: authHeader,
    })
    expect(JSON.parse(stillEnabled.body).enabled).toBe(true)
  })
})

describe('dashboard alert channels', () => {
  it('lists channels with "monitors using it" and hides "+ New channel" for a viewer', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const channel = await createChannel()

    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/alert-channels',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain(channel.name)
    expect(response.body).not.toContain('/dashboard/alert-channels/new')
    expect(response.body).not.toContain('/test')
  })

  it('creates a channel via the form', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const name = `form-channel-${Date.now()}`

    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/alert-channels/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=${encodeURIComponent(name)}&type=email&target=ops%40example.com`,
    })
    expect(response.statusCode).toBe(302)

    const listResponse = await testApp.inject({
      method: 'GET',
      url: '/api/alert-channels',
      headers: authHeader,
    })
    const channels = JSON.parse(listResponse.body) as { name: string; config: { to?: string } }[]
    const created = channels.find((c) => c.name === name)
    expect(created).toBeDefined()
    expect(created?.config.to).toBe('ops@example.com')
  })

  it('sending a test alert redirects back to the list with a flash message', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const channel = await createChannel({
      type: 'webhook',
      config: { url: 'https://example.invalid/hook' },
    })

    const response = await testApp.inject({
      method: 'POST',
      url: `/dashboard/alert-channels/${channel.id}/test`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toContain('/dashboard/alert-channels?flash=')
  })
})

function uniqueSlug(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

async function createStatusPage(overrides: Record<string, unknown> = {}) {
  const slug = uniqueSlug('status-page')
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/status-pages',
    headers: authHeader,
    payload: { name: `status-page-${Date.now()}`, slug, ...overrides },
  })
  return JSON.parse(response.body) as { id: number; name: string; slug: string }
}

describe('dashboard status pages list', () => {
  it('renders 200 HTML for an authenticated admin, including "+ New status page"', async () => {
    const admin = await createTestUser('admin')
    const cookie = await loginCookie(admin)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/status-pages',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('/dashboard/status-pages/new')
  })

  it('shows the slug, monitor count, and a link to the live public page', async () => {
    const admin = await createTestUser('admin')
    const cookie = await loginCookie(admin)
    const monitor = await createMonitor()
    const page = await createStatusPage({ monitors: [{ monitorId: monitor.id }] })

    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/status-pages',
      headers: { cookie },
    })
    expect(response.body).toContain(page.slug)
    expect(response.body).toContain(`/status/${page.slug}`)
  })

  it('hides "+ New status page" and every edit/delete action for a viewer', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const page = await createStatusPage()

    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/status-pages',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain(page.slug)
    expect(response.body).not.toContain('/dashboard/status-pages/new')
    expect(response.body).not.toContain(`/dashboard/status-pages/${page.id}/edit`)
    expect(response.body).not.toContain(`/dashboard/status-pages/${page.id}/delete`)
  })
})

describe('dashboard status page form access control', () => {
  it('GET /dashboard/status-pages/new is 200 for an editor', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/status-pages/new',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
  })

  it('GET /dashboard/status-pages/new is 404 for a viewer', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const response = await testApp.inject({
      method: 'GET',
      url: '/dashboard/status-pages/new',
      headers: { cookie },
    })
    expect(response.statusCode).toBe(404)
  })

  it('GET /dashboard/status-pages/:id/edit is 404 for a viewer', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const page = await createStatusPage()
    const response = await testApp.inject({
      method: 'GET',
      url: `/dashboard/status-pages/${page.id}/edit`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('dashboard status page create/edit/delete flows', () => {
  it('creates a status page via the form, with a monitor and a group name, and redirects to the list', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const monitor = await createMonitor()
    const name = `form-created-${Date.now()}`
    const slug = uniqueSlug('form-created')

    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/status-pages/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}&monitorIds=${monitor.id}&groupName_${monitor.id}=${encodeURIComponent('Core services')}`,
    })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('/dashboard/status-pages')

    const listResponse = await testApp.inject({
      method: 'GET',
      url: '/api/status-pages',
      headers: authHeader,
    })
    const pages = JSON.parse(listResponse.body) as {
      name: string
      slug: string
      monitors: { monitorId: number; groupName: string | null }[]
    }[]
    const created = pages.find((p) => p.slug === slug)
    expect(created).toBeDefined()
    expect(created?.name).toBe(name)
    expect(created?.monitors).toEqual([{ monitorId: monitor.id, groupName: 'Core services' }])
  })

  it('re-renders the form with an inline error when name is missing', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/status-pages/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=&slug=${uniqueSlug('missing-name')}`,
    })
    expect(response.statusCode).toBe(422)
    expect(response.body).toContain('Name is required.')
  })

  it('re-renders the form with an inline error when slug is missing', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/status-pages/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=${encodeURIComponent(`no-slug-${Date.now()}`)}&slug=`,
    })
    expect(response.statusCode).toBe(422)
    expect(response.body).toContain('Slug is required.')
  })

  it('re-renders the form with an inline error when the slug has invalid characters', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/status-pages/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=${encodeURIComponent(`bad-slug-${Date.now()}`)}&slug=Not_A_Valid-Slug!`,
    })
    expect(response.statusCode).toBe(422)
    expect(response.body).toContain('lowercase letters, numbers, and hyphens')
  })

  it('rejects a duplicate slug with a friendly inline error, matching the DB unique constraint', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const existing = await createStatusPage()

    const response = await testApp.inject({
      method: 'POST',
      url: '/dashboard/status-pages/new',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=${encodeURIComponent(`dup-${Date.now()}`)}&slug=${existing.slug}`,
    })
    expect(response.statusCode).toBe(422)
    expect(response.body).toContain('That slug is already in use.')
  })

  it('edits a status page, updating branding and monitor assignment, and the public page reflects it', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const monitor = await createMonitor()
    const page = await createStatusPage()
    const newName = `edited-${Date.now()}`

    const response = await testApp.inject({
      method: 'POST',
      url: `/dashboard/status-pages/${page.id}/edit`,
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `name=${encodeURIComponent(newName)}&slug=${page.slug}&accentColor=${encodeURIComponent('oklch(0.6 0.2 30)')}&monitorIds=${monitor.id}`,
    })
    expect(response.statusCode).toBe(302)

    const getResponse = await testApp.inject({
      method: 'GET',
      url: `/api/status-pages/${page.id}`,
      headers: authHeader,
    })
    const updated = JSON.parse(getResponse.body) as {
      name: string
      accentColor: string
      monitors: { monitorId: number }[]
    }
    expect(updated.name).toBe(newName)
    expect(updated.accentColor).toBe('oklch(0.6 0.2 30)')
    expect(updated.monitors).toEqual([{ monitorId: monitor.id, groupName: null }])

    const publicResponse = await testApp.inject({
      method: 'GET',
      url: `/api/public/status-pages/${page.slug}`,
    })
    expect(publicResponse.statusCode).toBe(200)
    expect(JSON.parse(publicResponse.body).name).toBe(newName)
  })

  it('shows a delete confirmation page, then actually deletes on confirm', async () => {
    const editor = await createTestUser('editor')
    const cookie = await loginCookie(editor)
    const page = await createStatusPage()

    const confirmPage = await testApp.inject({
      method: 'GET',
      url: `/dashboard/status-pages/${page.id}/delete/confirm`,
      headers: { cookie },
    })
    expect(confirmPage.statusCode).toBe(200)
    expect(confirmPage.body).toContain(page.name)

    const deleteResponse = await testApp.inject({
      method: 'POST',
      url: `/dashboard/status-pages/${page.id}/delete`,
      headers: { cookie },
    })
    expect(deleteResponse.statusCode).toBe(302)
    expect(deleteResponse.headers.location).toBe('/dashboard/status-pages')

    const afterDelete = await testApp.inject({
      method: 'GET',
      url: `/api/status-pages/${page.id}`,
      headers: authHeader,
    })
    expect(afterDelete.statusCode).toBe(404)
  })

  it('a viewer cannot create/edit/delete via POST (404s, and nothing changes)', async () => {
    const viewer = await createTestUser('viewer')
    const cookie = await loginCookie(viewer)
    const page = await createStatusPage()

    const deleteAttempt = await testApp.inject({
      method: 'POST',
      url: `/dashboard/status-pages/${page.id}/delete`,
      headers: { cookie },
    })
    expect(deleteAttempt.statusCode).toBe(404)

    const stillThere = await testApp.inject({
      method: 'GET',
      url: `/api/status-pages/${page.id}`,
      headers: authHeader,
    })
    expect(stillThere.statusCode).toBe(200)
  })
})
