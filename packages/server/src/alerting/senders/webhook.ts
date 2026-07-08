import { buildAlertText } from '../format.js'
import type { AlertMessage, WebhookChannelConfig } from '../types.js'

function isHeaderRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'string')
  )
}

export async function sendWebhookAlert(
  config: Record<string, unknown>,
  message: AlertMessage,
  timeoutMs: number,
): Promise<void> {
  const { url, headers } = config as Partial<WebhookChannelConfig>
  if (typeof url !== 'string' || !url) {
    throw new Error('webhook channel config is missing "url"')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(isHeaderRecord(headers) ? headers : {}),
      },
      body: JSON.stringify({
        monitor: message.monitorName,
        previousStatus: message.previousStatus,
        newStatus: message.newStatus,
        errorMessage: message.errorMessage,
        downtimeDurationMs: message.downtimeDurationMs,
        message: buildAlertText(message),
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`webhook responded with status ${response.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}
