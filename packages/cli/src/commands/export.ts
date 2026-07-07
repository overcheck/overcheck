import { writeFile } from 'node:fs/promises'
import { dump } from 'js-yaml'
import type { AlertChannelResource, MonitorResource, OvercheckClient } from '../client.js'

export interface ExportOptions {
  output?: string
}

function monitorToYaml(monitor: MonitorResource): Record<string, unknown> {
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

  const doc = {
    monitors: monitors.map(monitorToYaml),
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
