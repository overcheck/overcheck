export interface Config {
  databaseUrl: string
  port: number
  nodeEnv: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  return {
    databaseUrl,
    port: Number(env.PORT ?? 3000),
    nodeEnv: env.NODE_ENV ?? 'development',
  }
}
