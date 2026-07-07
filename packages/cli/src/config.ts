export interface CliConfig {
  url: string
  apiKey: string
}

export interface CliConfigOptions {
  url?: string
  apiKey?: string
}

export function resolveConfig(
  options: CliConfigOptions,
  env: NodeJS.ProcessEnv = process.env,
): CliConfig {
  const url = options.url ?? env.OVERCHECK_URL ?? 'http://localhost:3000'

  const apiKey = options.apiKey ?? env.OVERCHECK_API_KEY
  if (!apiKey) {
    throw new Error('API key required: pass --api-key or set OVERCHECK_API_KEY')
  }

  return { url: url.replace(/\/+$/, ''), apiKey }
}
