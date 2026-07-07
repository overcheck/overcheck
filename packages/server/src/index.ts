import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { createDbClient } from './db/client.js'
import { runMigrations } from './db/migrate.js'

async function main(): Promise<void> {
  const config = loadConfig()

  await runMigrations(config.databaseUrl)

  const db = createDbClient(config.databaseUrl)
  const app = buildApp(db)

  await app.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
