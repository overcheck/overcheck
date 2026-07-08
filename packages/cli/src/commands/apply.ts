import { readFile } from 'node:fs/promises'
import { load } from 'js-yaml'
import type { AlertChannelResource, MonitorResource, OvercheckClient } from '../client.js'
import { diffByName, type DiffResult } from '../diff.js'
import { parseConfigDocument, type AlertChannelEntryT, type MonitorEntryT } from '../schema.js'

export interface ApplyOptions {
  file: string
  dryRun?: boolean
}

function printPlan(resource: string, result: DiffResult<{ name: string }>): void {
  for (const entry of result.create) console.log(`  + create ${resource} "${entry.name}"`)
  for (const entry of result.update) {
    const fields = Object.keys(entry.changes).join(', ')
    console.log(`  ~ update ${resource} "${entry.name}" (${fields})`)
  }
  for (const entry of result.delete) console.log(`  - delete ${resource} "${entry.name}"`)
}

function summarize(result: DiffResult<{ name: string }>): string {
  return `${result.create.length} to create, ${result.update.length} to update, ${result.delete.length} to delete, ${result.unchanged.length} unchanged`
}

// alertChannels (channel names to assign) isn't a field the server's monitor resource has —
// it's reconciled separately, after both monitors and alertChannels exist, via
// resolveAlertChannelAssignments. Diffing/creating/updating monitors with it still attached
// would make every monitor that declares it look permanently "changed" (actual never has the
// key) and would leak an unrecognized field into the POST/PATCH body.
function withoutAlertChannels(entry: MonitorEntryT): Omit<MonitorEntryT, 'alertChannels'> {
  const rest = { ...entry }
  delete rest.alertChannels
  return rest
}

// Only called after the monitor/alertChannels create-update-delete loops below have run, so a
// monitor or channel created earlier in the same apply is already resolvable by name here.
async function resolveAlertChannelAssignments(
  client: OvercheckClient,
  monitors: MonitorEntryT[],
): Promise<void> {
  const entriesWithAssignments = monitors.filter((entry) => entry.alertChannels !== undefined)
  if (entriesWithAssignments.length === 0) return

  const [currentMonitors, currentAlertChannels] = await Promise.all([
    client.listMonitors(),
    client.listAlertChannels(),
  ])
  const monitorIdByName = new Map(currentMonitors.map((m) => [m.name, m.id]))
  const channelIdByName = new Map(currentAlertChannels.map((c) => [c.name, c.id]))

  for (const entry of entriesWithAssignments) {
    const monitorId = monitorIdByName.get(entry.name)
    if (monitorId === undefined) {
      throw new Error(`cannot assign alert channels to monitor "${entry.name}": not found`)
    }
    const alertChannelNames = entry.alertChannels ?? []
    const alertChannelIds = alertChannelNames.map((channelName) => {
      const id = channelIdByName.get(channelName)
      if (id === undefined) {
        throw new Error(`monitor "${entry.name}" references unknown alert channel "${channelName}"`)
      }
      return id
    })

    console.log(
      `assigning alert channels to monitor "${entry.name}": [${alertChannelNames.join(', ')}]`,
    )
    await client.putMonitorAlertChannels(monitorId, alertChannelIds)
  }
}

export async function runApply(client: OvercheckClient, options: ApplyOptions): Promise<void> {
  const raw = load(await readFile(options.file, 'utf8'))
  const doc = parseConfigDocument(raw, options.file)
  const desiredMonitors = doc.monitors ?? []

  const [actualMonitors, actualAlertChannels] = await Promise.all([
    client.listMonitors(),
    client.listAlertChannels(),
  ])

  const monitorDiff = diffByName<Omit<MonitorEntryT, 'alertChannels'>, MonitorResource>(
    desiredMonitors.map(withoutAlertChannels),
    actualMonitors,
  )
  const alertChannelDiff = diffByName<AlertChannelEntryT, AlertChannelResource>(
    doc.alertChannels ?? [],
    actualAlertChannels,
  )

  console.log('Plan:')
  console.log(`monitors: ${summarize(monitorDiff)}`)
  printPlan('monitor', monitorDiff)
  console.log(`alert channels: ${summarize(alertChannelDiff)}`)
  printPlan('alert channel', alertChannelDiff)
  for (const entry of desiredMonitors) {
    if (entry.alertChannels === undefined) continue
    console.log(
      `  = assign alert channels to monitor "${entry.name}": [${entry.alertChannels.join(', ')}]`,
    )
  }

  if (options.dryRun) {
    console.log('\nDry run: no changes applied.')
    return
  }

  for (const entry of monitorDiff.create) {
    console.log(`creating monitor "${entry.name}"...`)
    await client.createMonitor(entry)
  }
  for (const entry of monitorDiff.update) {
    console.log(`updating monitor "${entry.name}"...`)
    await client.updateMonitor(entry.id, entry.changes)
  }
  for (const entry of monitorDiff.delete) {
    console.log(`deleting monitor "${entry.name}"...`)
    await client.deleteMonitor(entry.id)
  }

  for (const entry of alertChannelDiff.create) {
    console.log(`creating alert channel "${entry.name}"...`)
    await client.createAlertChannel(entry)
  }
  for (const entry of alertChannelDiff.update) {
    console.log(`updating alert channel "${entry.name}"...`)
    await client.updateAlertChannel(entry.id, entry.changes)
  }
  for (const entry of alertChannelDiff.delete) {
    console.log(`deleting alert channel "${entry.name}"...`)
    await client.deleteAlertChannel(entry.id)
  }

  await resolveAlertChannelAssignments(client, desiredMonitors)

  console.log('\nApply complete.')
}
