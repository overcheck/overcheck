import { buildApp } from './app.js'
import { CheckScheduler } from './check-engine/scheduler.js'
import { fetchEnabledMonitors } from './check-engine/repository.js'
import { startRetentionLoop } from './check-engine/retention.js'
import { loadConfig } from './config.js'
import { createDbClient } from './db/client.js'
import { runMigrations } from './db/migrate.js'

async function main(): Promise<void> {
  const config = loadConfig()

  await runMigrations(config.databaseUrl)

  const db = createDbClient(config.databaseUrl)

  const monitors = await fetchEnabledMonitors(db)
  const scheduler = new CheckScheduler(db)
  scheduler.start(monitors)

  const app = await buildApp(db, scheduler, config.apiKey)

  const retention = startRetentionLoop(db, config.checkRetentionDays)

  const shutdown = async (): Promise<void> => {
    await scheduler.stop()
    retention.stop()
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())

  await app.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
