import type { CheckStatus } from '../check-engine/types.js'

export interface SmtpConfig {
  host: string
  port: number
  user: string | undefined
  pass: string | undefined
  from: string
  secure: boolean
}

export interface AlertMessage {
  monitorName: string
  previousStatus: CheckStatus | null
  newStatus: CheckStatus
  errorMessage: string | null
  downtimeDurationMs: number | null
}

export interface SlackChannelConfig {
  webhookUrl: string
}

export interface WebhookChannelConfig {
  url: string
  headers?: Record<string, string>
}

export interface EmailChannelConfig {
  to: string | string[]
}

export interface AlertChannelRow {
  id: number
  type: 'slack' | 'webhook' | 'email'
  config: unknown
}
