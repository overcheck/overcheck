import type { Kysely } from 'kysely'
import type { Monitor, StateTransition } from '../check-engine/types.js'
import type { Database } from '../db/client.js'
import { sendEmailAlert } from './senders/email.js'
import { sendSlackAlert } from './senders/slack.js'
import { sendWebhookAlert } from './senders/webhook.js'
import type { AlertChannelRow, AlertMessage, SmtpConfig } from './types.js'

export async function sendToChannel(
  channel: AlertChannelRow,
  message: AlertMessage,
  smtp: SmtpConfig | undefined,
  timeoutMs: number,
): Promise<void> {
  const config = (channel.config ?? {}) as Record<string, unknown>
  switch (channel.type) {
    case 'slack':
      return sendSlackAlert(config, message, timeoutMs)
    case 'webhook':
      return sendWebhookAlert(config, message, timeoutMs)
    case 'email':
      return sendEmailAlert(smtp, config, message, timeoutMs)
  }
}

export function createAlertDispatcher(
  db: Kysely<Database>,
  smtp: SmtpConfig | undefined,
  timeoutMs: number,
): (monitor: Monitor, transition: StateTransition) => Promise<void> {
  return async (monitor, transition) => {
    const channels = await db
      .selectFrom('monitor_alert_channels')
      .innerJoin('alert_channels', 'alert_channels.id', 'monitor_alert_channels.alert_channel_id')
      .select(['alert_channels.id', 'alert_channels.type', 'alert_channels.config'])
      .where('monitor_alert_channels.monitor_id', '=', monitor.id)
      .where('alert_channels.enabled', '=', true)
      .execute()

    const message: AlertMessage = {
      monitorName: monitor.name,
      previousStatus: transition.previousStatus,
      newStatus: transition.newStatus,
      errorMessage: transition.errorMessage,
      downtimeDurationMs: transition.downtimeDurationMs,
    }

    await Promise.allSettled(
      channels.map((channel) =>
        sendToChannel(channel, message, smtp, timeoutMs).catch((err: unknown) => {
          console.error(
            `[alerting] failed to send ${channel.type} alert (channel ${channel.id}) for monitor ${monitor.id}:`,
            err,
          )
        }),
      ),
    )
  }
}
