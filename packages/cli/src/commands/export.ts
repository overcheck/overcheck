import { writeFile } from 'node:fs/promises'
import { dump } from 'js-yaml'
import type { AlertChannelResource, MonitorResource, OvercheckClient } from '../client.js'

export interface ExportOptions {
  output?: string
}

function monitorToYaml(
  monitor: MonitorResource,
  alertChannelNames: string[],
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: monitor.name,
    type: monitor.type,
    enabled: monitor.enabled,
    intervalSeconds: monitor.intervalSeconds,
    timeoutMs: monitor.timeoutMs,
    retries: monitor.retries,
    degradedAfterMs: monitor.degradedAfterMs,
  }
  if (monitor.httpUrl !== null) entry.httpUrl = monitor.httpUrl
  if (monitor.type === 'http' || monitor.type === 'keyword') {
    entry.httpMethod = monitor.httpMethod
    entry.httpExpectedStatus = monitor.httpExpectedStatus
  }
  if (monitor.httpBodyContains !== null) entry.httpBodyContains = monitor.httpBodyContains
  if (monitor.host !== null) entry.host = monitor.host
  if (monitor.port !== null) entry.port = monitor.port
  if (alertChannelNames.length > 0) entry.alertChannels = alertChannelNames
  return entry
}

function alertChannelToYaml(channel: AlertChannelResource): Record<string, unknown> {
  return {
    name: channel.name,
    type: channel.type,
    config: channel.config,
    enabled: channel.enabled,
  }
}

export async function runExport(client: OvercheckClient, options: ExportOptions): Promise<void> {
  const [monitors, alertChannels] = await Promise.all([
    client.listMonitors(),
    client.listAlertChannels(),
  ])
  const channelNameById = new Map(alertChannels.map((c) => [c.id, c.name]))

  // One assignment lookup per monitor — export runs at CLI-invocation cadence for modest monitor
  // counts, so the N+1 calls aren't worth batching against yet.
  const monitorEntries = await Promise.all(
    monitors.map(async (monitor) => {
      const { alertChannelIds } = await client.getMonitorAlertChannels(monitor.id)
      const alertChannelNames = alertChannelIds
        .map((id) => channelNameById.get(id))
        .filter((name): name is string => name !== undefined)
      return monitorToYaml(monitor, alertChannelNames)
    }),
  )

  const doc = {
    monitors: monitorEntries,
    alertChannels: alertChannels.map(alertChannelToYaml),
  }
  const yaml = dump(doc, { sortKeys: false })

  if (options.output) {
    await writeFile(options.output, yaml, 'utf8')
    console.log(
      `Wrote ${monitors.length} monitor(s) and ${alertChannels.length} alert channel(s) to ${options.output}`,
    )
  } else {
    process.stdout.write(yaml)
  }
}
