import { describe, expect, it } from 'vitest'
import { testApp } from './setup.js'

describe('GET /health', () => {
  it('reports ok status with a healthy database', async () => {
    const response = await testApp.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.status).toBe('ok')
    expect(body.checks.database).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
  })
})
