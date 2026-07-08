import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runExport } from '../../src/commands/export.js'
import type { AlertChannelResource, MonitorResource, OvercheckClient } from '../../src/client.js'

function makeFakeClient(
  monitors: MonitorResource[],
  alertChannels: AlertChannelResource[],
  assignmentsByMonitorId: Record<number, number[]>,
): OvercheckClient {
  const fake = {
    listMonitors: async () => monitors,
    listAlertChannels: async () => alertChannels,
    getMonitorAlertChannels: async (monitorId: number) => ({
      alertChannelIds: assignmentsByMonitorId[monitorId] ?? [],
    }),
  }
  return fake as unknown as OvercheckClient
}

const baseMonitor: MonitorResource = {
  id: 1,
  name: 'api',
  type: 'tcp',
  enabled: true,
  intervalSeconds: 30,
  timeoutMs: 5000,
  retries: 0,
  degradedAfterMs: 2000,
  httpUrl: null,
  httpMethod: 'GET',
  httpExpectedStatus: 200,
  httpBodyContains: null,
  host: '1.2.3.4',
  port: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const baseChannel: AlertChannelResource = {
  id: 5,
  name: 'ops-slack',
  type: 'slack',
  config: { webhookUrl: 'https://hooks.slack.example/abc' },
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('runExport — alert channel assignment round-trip', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'overcheck-cli-export-test-'))
    file = join(dir, 'export.yaml')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('includes alertChannels (names) for a monitor with assignments', async () => {
    const client = makeFakeClient([baseMonitor], [baseChannel], { 1: [5] })
    await runExport(client, { output: file })

    const doc = load(await readFile(file, 'utf8')) as { monitors: { alertChannels?: string[] }[] }
    expect(doc.monitors[0]?.alertChannels).toEqual(['ops-slack'])
  })

  it('omits alertChannels entirely for a monitor with no assignments', async () => {
    const client = makeFakeClient([baseMonitor], [baseChannel], {})
    await runExport(client, { output: file })

    const doc = load(await readFile(file, 'utf8')) as { monitors: { alertChannels?: string[] }[] }
    expect(doc.monitors[0]?.alertChannels).toBeUndefined()
  })
})
