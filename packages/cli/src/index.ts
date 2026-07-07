#!/usr/bin/env node
import { Command } from 'commander'
import { OvercheckClient } from './client.js'
import { runApply } from './commands/apply.js'
import { runExport } from './commands/export.js'
import { resolveConfig } from './config.js'
import { ConfigValidationError } from './schema.js'

const program = new Command()

program
  .name('overcheck')
  .description('Overcheck config-as-code CLI')
  .option(
    '--url <url>',
    'Overcheck API base URL (default: $OVERCHECK_URL or http://localhost:3000)',
  )
  .option('--api-key <key>', 'Overcheck API key (default: $OVERCHECK_API_KEY)')

program
  .command('apply')
  .description('Sync monitors and alert channels from a YAML file to the API')
  .requiredOption('-f, --file <path>', 'path to the YAML config file')
  .option('--dry-run', 'show the plan without applying it', false)
  .action(async (cmdOptions: { file: string; dryRun: boolean }) => {
    const config = resolveConfig(program.opts())
    const client = new OvercheckClient(config)
    await runApply(client, { file: cmdOptions.file, dryRun: cmdOptions.dryRun })
  })

program
  .command('export')
  .description('Export current monitors and alert channels as YAML')
  .option('-o, --output <path>', 'write to a file instead of stdout')
  .action(async (cmdOptions: { output?: string }) => {
    const config = resolveConfig(program.opts())
    const client = new OvercheckClient(config)
    await runExport(client, { output: cmdOptions.output })
  })

program.parseAsync().catch((err: unknown) => {
  if (err instanceof ConfigValidationError) {
    console.error(err.message)
  } else if (err instanceof Error) {
    console.error(`Error: ${err.message}`)
  } else {
    console.error(err)
  }
  process.exitCode = 1
})
