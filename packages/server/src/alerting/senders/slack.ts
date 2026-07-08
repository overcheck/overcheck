import { buildAlertText } from '../format.js'
import type { AlertMessage, SlackChannelConfig } from '../types.js'

export async function sendSlackAlert(
  config: Record<string, unknown>,
  message: AlertMessage,
  timeoutMs: number,
): Promise<void> {
  const { webhookUrl } = config as Partial<SlackChannelConfig>
  if (typeof webhookUrl !== 'string' || !webhookUrl) {
    throw new Error('slack channel config is missing "webhookUrl"')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: buildAlertText(message) }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`slack webhook responded with status ${response.status}`)
    }
  } finally {
    clearTimeout(timer)
  }
}
