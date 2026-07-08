import { describe, expect, it } from 'vitest'
import { buildAlertSubject, buildAlertText, formatDuration } from '../../src/alerting/format.js'
import type { AlertMessage } from '../../src/alerting/types.js'

describe('formatDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatDuration(45_000)).toBe('45s')
  })

  it('formats zero as 0s', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1m 30s')
  })

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3 * 3600_000 + 5 * 60_000 + 10_000)).toBe('3h 5m 10s')
  })

  it('formats days', () => {
    expect(formatDuration(2 * 86_400_000 + 3600_000)).toBe('2d 1h')
  })
})

describe('buildAlertSubject / buildAlertText', () => {
  const base: AlertMessage = {
    monitorName: 'api',
    previousStatus: 'up',
    newStatus: 'down',
    errorMessage: 'connection refused',
    downtimeDurationMs: null,
  }

  it('includes monitor name and new state in the subject', () => {
    expect(buildAlertSubject(base)).toBe('[Overcheck] api is DOWN')
  })

  it('includes error details in the body', () => {
    expect(buildAlertText(base)).toContain('connection refused')
    expect(buildAlertText(base)).toContain('api')
    expect(buildAlertText(base)).toContain('DOWN')
  })

  it('includes downtime duration on recovery', () => {
    const recovery: AlertMessage = {
      ...base,
      newStatus: 'up',
      errorMessage: null,
      downtimeDurationMs: 90_000,
    }
    expect(buildAlertText(recovery)).toContain('recovered after 1m 30s')
  })

  it('omits downtime duration when not recovering', () => {
    expect(buildAlertText(base)).not.toContain('recovered')
  })
})
