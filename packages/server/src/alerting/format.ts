import type { AlertMessage } from './types.js'

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

export function buildAlertSubject(message: AlertMessage): string {
  return `[Overcheck] ${message.monitorName} is ${message.newStatus.toUpperCase()}`
}

export function buildAlertText(message: AlertMessage): string {
  let text = `Monitor "${message.monitorName}" is now ${message.newStatus.toUpperCase()}`
  if (message.newStatus === 'up' && message.downtimeDurationMs !== null) {
    text += ` (recovered after ${formatDuration(message.downtimeDurationMs)})`
  }
  if (message.errorMessage) {
    text += `\nDetails: ${message.errorMessage}`
  }
  return text
}
