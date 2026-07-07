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

export async function runApply(client: OvercheckClient, options: ApplyOptions): Promise<void> {
  const raw = load(await readFile(options.file, 'utf8'))
  const doc = parseConfigDocument(raw, options.file)

  const [actualMonitors, actualAlertChannels] = await Promise.all([
    client.listMonitors(),
    client.listAlertChannels(),
  ])

  const monitorDiff = diffByName<MonitorEntryT, MonitorResource>(doc.monitors ?? [], actualMonitors)
  const alertChannelDiff = diffByName<AlertChannelEntryT, AlertChannelResource>(
    doc.alertChannels ?? [],
    actualAlertChannels,
  )

  console.log('Plan:')
  console.log(`monitors: ${summarize(monitorDiff)}`)
  printPlan('monitor', monitorDiff)
  console.log(`alert channels: ${summarize(alertChannelDiff)}`)
  printPlan('alert channel', alertChannelDiff)

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

  console.log('\nApply complete.')
}
