import { createServer } from 'node:http'
import type { AddressInfo, Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Monitor } from '../../src/check-engine/types.js'
import { createAlertDispatcher, sendToChannel } from '../../src/alerting/dispatch.js'
import { sendSlackAlert } from '../../src/alerting/senders/slack.js'
import { sendWebhookAlert } from '../../src/alerting/senders/webhook.js'
import { sendEmailAlert, type CreateTransport } from '../../src/alerting/senders/email.js'
import type { AlertChannelRow, AlertMessage, SmtpConfig } from '../../src/alerting/types.js'
import { testDb } from '../setup.js'

const message: AlertMessage = {
  monitorName: 'api',
  previousStatus: 'up',
  newStatus: 'down',
  errorMessage: 'connection refused',
  downtimeDurationMs: null,
}

function startCapturingServer(status = 200): {
  server: Server
  urlFor: (path: string) => Promise<string>
  requests: { path: string; body: unknown; headers: Record<string, unknown> }[]
} {
  const requests: { path: string; body: unknown; headers: Record<string, unknown> }[] = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()))
    req.on('end', () => {
      requests.push({
        path: req.url ?? '',
        body: raw ? JSON.parse(raw) : null,
        headers: req.headers,
      })
      res.statusCode = status
      res.end()
    })
  })
  return {
    server,
    requests,
    urlFor: (path: string) =>
      new Promise<string>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const port = (server.address() as AddressInfo).port
          resolve(`http://127.0.0.1:${port}${path}`)
        })
      }),
  }
}

describe('senders', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server?.listening) await new Promise((res) => server?.close(() => res(undefined)))
    server = undefined
  })

  it('sendSlackAlert posts the alert text to the webhook URL', async () => {
    const cap = startCapturingServer(200)
    server = cap.server
    const url = await cap.urlFor('/slack')

    await sendSlackAlert({ webhookUrl: url }, message, 1000)

    expect(cap.requests).toHaveLength(1)
    expect(cap.requests[0]?.body).toMatchObject({ text: expect.stringContaining('api') })
  })

  it('sendSlackAlert throws when the webhook config is missing webhookUrl', async () => {
    await expect(sendSlackAlert({}, message, 1000)).rejects.toThrow(/webhookUrl/)
  })

  it('sendSlackAlert throws when the webhook responds with a non-2xx status', async () => {
    const cap = startCapturingServer(500)
    server = cap.server
    const url = await cap.urlFor('/slack')

    await expect(sendSlackAlert({ webhookUrl: url }, message, 1000)).rejects.toThrow(/500/)
  })

  it('sendWebhookAlert posts monitor/status fields and custom headers', async () => {
    const cap = startCapturingServer(200)
    server = cap.server
    const url = await cap.urlFor('/hook')

    await sendWebhookAlert({ url, headers: { 'x-secret': 'abc' } }, message, 1000)

    expect(cap.requests).toHaveLength(1)
    expect(cap.requests[0]?.body).toMatchObject({ monitor: 'api', newStatus: 'down' })
    expect(cap.requests[0]?.headers['x-secret']).toBe('abc')
  })

  it('sendWebhookAlert throws when the config is missing url', async () => {
    await expect(sendWebhookAlert({}, message, 1000)).rejects.toThrow(/url/)
  })

  describe('sendEmailAlert', () => {
    const smtp: SmtpConfig = {
      host: 'smtp.example.com',
      port: 587,
      user: 'user',
      pass: 'pass',
      from: 'alerts@example.com',
      secure: false,
    }

    it('throws when SMTP is not configured', async () => {
      await expect(
        sendEmailAlert(undefined, { to: 'a@example.com' }, message, 1000),
      ).rejects.toThrow(/SMTP_HOST/)
    })

    it('throws when the channel config is missing "to"', async () => {
      await expect(sendEmailAlert(smtp, {}, message, 1000)).rejects.toThrow(/"to"/)
    })

    it('sends via the injected transport with the server SMTP config and channel recipient', async () => {
      const sendMail = vi.fn().mockResolvedValue(undefined)
      const close = vi.fn()
      const createTransport: CreateTransport = vi.fn(() => ({ sendMail, close }))

      await sendEmailAlert(smtp, { to: 'oncall@example.com' }, message, 1000, createTransport)

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: smtp.host, port: smtp.port }),
      )
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'alerts@example.com', to: 'oncall@example.com' }),
      )
      expect(close).toHaveBeenCalled()
    })

    it('propagates a transport send failure', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('smtp unreachable'))
      const close = vi.fn()
      const createTransport: CreateTransport = vi.fn(() => ({ sendMail, close }))

      await expect(
        sendEmailAlert(smtp, { to: 'oncall@example.com' }, message, 1000, createTransport),
      ).rejects.toThrow(/smtp unreachable/)
    })
  })
})

describe('sendToChannel', () => {
  it('dispatches by channel type', async () => {
    const cap = startCapturingServer(200)
    const url = await cap.urlFor('/hook')
    const channel: AlertChannelRow = { id: 1, type: 'webhook', config: { url } }

    await sendToChannel(channel, message, undefined, 1000)
    expect(cap.requests).toHaveLength(1)
    await new Promise((res) => cap.server.close(() => res(undefined)))
  })
})

describe('createAlertDispatcher', () => {
  async function insertMonitor(): Promise<number> {
    const row = await testDb
      .insertInto('monitors')
      .values({
        name: `dispatch test monitor ${Date.now()}-${Math.random()}`,
        type: 'tcp',
        interval_seconds: 10,
        host: '127.0.0.1',
        port: 1,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  async function insertChannel(type: 'webhook', config: unknown, enabled = true): Promise<number> {
    const row = await testDb
      .insertInto('alert_channels')
      .values({
        name: `dispatch test channel ${Date.now()}-${Math.random()}`,
        type,
        config: JSON.stringify(config),
        enabled,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  it('fans out to all enabled assigned channels and isolates one channel failing', async () => {
    const goodCap = startCapturingServer(200)
    const goodUrl = await goodCap.urlFor('/good')

    const monitorId = await insertMonitor()
    const goodChannelId = await insertChannel('webhook', { url: goodUrl })
    const badChannelId = await insertChannel('webhook', { url: 'http://127.0.0.1:1/unreachable' })
    const disabledChannelId = await insertChannel('webhook', { url: goodUrl }, false)

    await testDb
      .insertInto('monitor_alert_channels')
      .values([
        { monitor_id: monitorId, alert_channel_id: goodChannelId },
        { monitor_id: monitorId, alert_channel_id: badChannelId },
        { monitor_id: monitorId, alert_channel_id: disabledChannelId },
      ])
      .execute()

    const monitor: Monitor = {
      id: monitorId,
      name: 'dispatcher monitor',
      type: 'tcp',
      enabled: true,
      intervalSeconds: 10,
      timeoutMs: 200,
      retries: 0,
      degradedAfterMs: 2000,
      host: '127.0.0.1',
      port: 1,
    }

    const dispatch = createAlertDispatcher(testDb, undefined, 1000)
    await expect(
      dispatch(monitor, {
        previousStatus: 'up',
        newStatus: 'down',
        errorMessage: 'boom',
        downtimeDurationMs: null,
      }),
    ).resolves.toBeUndefined()

    expect(goodCap.requests).toHaveLength(1)
    await new Promise((res) => goodCap.server.close(() => res(undefined)))
  })
})
