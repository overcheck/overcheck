import type { Kysely } from 'kysely'
import type { Database } from '../db/client.js'
import { pruneOldCheckResults } from './repository.js'

const PRUNE_INTERVAL_MS = 60 * 60 * 1000

export function startRetentionLoop(
  db: Kysely<Database>,
  retentionDays: number,
): { stop: () => void } {
  const run = () => {
    pruneOldCheckResults(db, retentionDays).catch((err: unknown) => {
      console.error('retention prune failed', err)
    })
  }

  run()
  const timer = setInterval(run, PRUNE_INTERVAL_MS)

  return {
    stop: () => clearInterval(timer),
  }
}
