import type { SmtpConfig } from './alerting/types.js'

export interface Config {
  databaseUrl: string
  port: number
  nodeEnv: string
  checkRetentionDays: number
  sessionTtlHours: number
  smtp: SmtpConfig | undefined
  alertTimeoutMs: number
}

function loadSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig | undefined {
  if (!env.SMTP_HOST) return undefined
  if (!env.SMTP_FROM) {
    throw new Error('SMTP_FROM is required when SMTP_HOST is set')
  }
  return {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
    secure: env.SMTP_SECURE === 'true',
  }
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
    checkRetentionDays: Number(env.CHECK_RETENTION_DAYS ?? 30),
    sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 168),
    smtp: loadSmtpConfig(env),
    alertTimeoutMs: Number(env.ALERT_TIMEOUT_MS ?? 5000),
  }
}
