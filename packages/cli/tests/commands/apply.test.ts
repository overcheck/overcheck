import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runApply } from '../../src/commands/apply.js'
import type { AlertChannelResource, MonitorResource, OvercheckClient } from '../../src/client.js'

// A minimal in-memory stand-in for OvercheckClient's public surface, structurally compatible
// except for the class's private `config` field — hence the cast at the call site. Tracks
// create/put calls so tests can assert on them without a live server.
function makeFakeClient(): {
  client: OvercheckClient
  monitors: MonitorResource[]
  alertChannels: AlertChannelResource[]
  assignments: { monitorId: number; alertChannelIds: number[] }[]
} {
  const monitors: MonitorResource[] = []
  const alertChannels: AlertChannelResource[] = []
  const assignments: { monitorId: number; alertChannelIds: number[] }[] = []
  let nextMonitorId = 1
  let nextChannelId = 1

  const fake = {
    listMonitors: async () => monitors,
    createMonitor: async (body: Record<string, unknown>) => {
      const monitor = {
        id: nextMonitorId++,
        name: body.name,
        type: body.type,
        enabled: body.enabled ?? true,
        intervalSeconds: body.intervalSeconds,
        timeoutMs: body.timeoutMs ?? 5000,
        retries: body.retries ?? 0,
        degradedAfterMs: body.degradedAfterMs ?? 2000,
        httpUrl: body.httpUrl ?? null,
        httpMethod: body.httpMethod ?? 'GET',
        httpExpectedStatus: body.httpExpectedStatus ?? 200,
        httpBodyContains: body.httpBodyContains ?? null,
        host: body.host ?? null,
        port: body.port ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as MonitorResource
      monitors.push(monitor)
      return monitor
    },
    updateMonitor: async () => {
      throw new Error('not used in this test')
    },
    deleteMonitor: async () => {
      throw new Error('not used in this test')
    },
    listAlertChannels: async () => alertChannels,
    createAlertChannel: async (body: Record<string, unknown>) => {
      const channel = {
        id: nextChannelId++,
        name: body.name,
        type: body.type,
        config: body.config ?? {},
        enabled: body.enabled ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as AlertChannelResource
      alertChannels.push(channel)
      return channel
    },
    updateAlertChannel: async () => {
      throw new Error('not used in this test')
    },
    deleteAlertChannel: async () => {
      throw new Error('not used in this test')
    },
    getMonitorAlertChannels: async () => ({ alertChannelIds: [] }),
    putMonitorAlertChannels: async (monitorId: number, alertChannelIds: number[]) => {
      assignments.push({ monitorId, alertChannelIds })
      return { alertChannelIds }
    },
  }

  return { client: fake as unknown as OvercheckClient, monitors, alertChannels, assignments }
}

describe('runApply — alert channel assignment', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'overcheck-cli-test-'))
    file = join(dir, 'monitors.yaml')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a monitor and channel in one file, then resolves the name to an id', async () => {
    await writeFile(
      file,
      `
monitors:
  - name: api
    type: tcp
    host: 1.2.3.4
    port: 1
    intervalSeconds: 30
    alertChannels: [ops-slack]

alertChannels:
  - name: ops-slack
    type: slack
    config:
      webhookUrl: https://hooks.slack.example/abc
`,
    )

    const { client, monitors, alertChannels, assignments } = makeFakeClient()
    await runApply(client, { file })

    expect(monitors).toHaveLength(1)
    expect(alertChannels).toHaveLength(1)
    expect(assignments).toEqual([
      { monitorId: monitors[0]?.id, alertChannelIds: [alertChannels[0]?.id] },
    ])
  })

  it('does not send alertChannels as a monitor field to create/update', async () => {
    await writeFile(
      file,
      `
monitors:
  - name: api
    type: tcp
    host: 1.2.3.4
    port: 1
    intervalSeconds: 30
    alertChannels: []
`,
    )

    const { client, monitors } = makeFakeClient()
    // Wrap createMonitor to inspect the body it actually receives.
    const seenBodies: Record<string, unknown>[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalCreate = (client as any).createMonitor.bind(client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(client as any).createMonitor = async (body: Record<string, unknown>) => {
      seenBodies.push(body)
      return originalCreate(body)
    }

    await runApply(client, { file })

    expect(monitors).toHaveLength(1)
    expect(seenBodies[0]).not.toHaveProperty('alertChannels')
  })

  it('leaves existing assignments untouched when a monitor omits alertChannels', async () => {
    await writeFile(
      file,
      `
monitors:
  - name: api
    type: tcp
    host: 1.2.3.4
    port: 1
    intervalSeconds: 30
`,
    )

    const { client, assignments } = makeFakeClient()
    await runApply(client, { file })

    expect(assignments).toEqual([])
  })

  it('throws a clear error when a monitor references an unknown alert channel', async () => {
    await writeFile(
      file,
      `
monitors:
  - name: api
    type: tcp
    host: 1.2.3.4
    port: 1
    intervalSeconds: 30
    alertChannels: [does-not-exist]
`,
    )

    const { client } = makeFakeClient()
    await expect(runApply(client, { file })).rejects.toThrow(/does-not-exist/)
  })

  it('does not call the assignment endpoint on a dry run', async () => {
    await writeFile(
      file,
      `
monitors:
  - name: api
    type: tcp
    host: 1.2.3.4
    port: 1
    intervalSeconds: 30
    alertChannels: [ops-slack]

alertChannels:
  - name: ops-slack
    type: slack
    config:
      webhookUrl: https://hooks.slack.example/abc
`,
    )

    const { client, assignments } = makeFakeClient()
    await runApply(client, { file, dryRun: true })

    expect(assignments).toEqual([])
  })
})
