import { describe, expect, it } from 'vitest'
import { diffByName } from '../src/diff.js'

interface DesiredEntry {
  name: string
  intervalSeconds?: number
  enabled?: boolean
}

interface ActualEntry {
  id: number
  name: string
  intervalSeconds: number
  enabled: boolean
}

describe('diffByName', () => {
  it('creates entries with no matching actual resource', () => {
    const result = diffByName<DesiredEntry, ActualEntry>([{ name: 'api', intervalSeconds: 30 }], [])
    expect(result.create).toEqual([{ name: 'api', intervalSeconds: 30 }])
    expect(result.update).toEqual([])
    expect(result.delete).toEqual([])
    expect(result.unchanged).toEqual([])
  })

  it('deletes actual resources with no matching desired entry', () => {
    const result = diffByName<DesiredEntry, ActualEntry>(
      [],
      [{ id: 1, name: 'stale', intervalSeconds: 30, enabled: true }],
    )
    expect(result.delete).toEqual([{ id: 1, name: 'stale' }])
    expect(result.create).toEqual([])
  })

  it('reports unchanged when all desired fields already match', () => {
    const result = diffByName<DesiredEntry, ActualEntry>(
      [{ name: 'api', intervalSeconds: 30 }],
      [{ id: 1, name: 'api', intervalSeconds: 30, enabled: true }],
    )
    expect(result.unchanged).toEqual(['api'])
    expect(result.update).toEqual([])
  })

  it('updates only the fields that differ', () => {
    const result = diffByName<DesiredEntry, ActualEntry>(
      [{ name: 'api', intervalSeconds: 60, enabled: true }],
      [{ id: 1, name: 'api', intervalSeconds: 30, enabled: true }],
    )
    expect(result.update).toEqual([{ id: 1, name: 'api', changes: { intervalSeconds: 60 } }])
  })

  it('ignores fields the desired entry omits, even if they differ from actual', () => {
    const result = diffByName<DesiredEntry, ActualEntry>(
      [{ name: 'api', intervalSeconds: 30 }],
      [{ id: 1, name: 'api', intervalSeconds: 30, enabled: false }],
    )
    expect(result.update).toEqual([])
    expect(result.unchanged).toEqual(['api'])
  })

  it('diffs nested objects (e.g. alert channel config) by deep equality', () => {
    interface Desired {
      name: string
      config?: Record<string, unknown>
    }
    interface Actual {
      id: number
      name: string
      config: Record<string, unknown>
    }
    const same = diffByName<Desired, Actual>(
      [{ name: 'slack', config: { webhookUrl: 'https://x' } }],
      [{ id: 1, name: 'slack', config: { webhookUrl: 'https://x' } }],
    )
    expect(same.unchanged).toEqual(['slack'])

    const changed = diffByName<Desired, Actual>(
      [{ name: 'slack', config: { webhookUrl: 'https://y' } }],
      [{ id: 1, name: 'slack', config: { webhookUrl: 'https://x' } }],
    )
    expect(changed.update).toEqual([
      { id: 1, name: 'slack', changes: { config: { webhookUrl: 'https://y' } } },
    ])
  })

  it('handles create, update, delete, and unchanged together', () => {
    const result = diffByName<DesiredEntry, ActualEntry>(
      [
        { name: 'new', intervalSeconds: 10 },
        { name: 'changed', intervalSeconds: 60 },
        { name: 'same', intervalSeconds: 30 },
      ],
      [
        { id: 1, name: 'changed', intervalSeconds: 30, enabled: true },
        { id: 2, name: 'same', intervalSeconds: 30, enabled: true },
        { id: 3, name: 'gone', intervalSeconds: 30, enabled: true },
      ],
    )
    expect(result.create).toEqual([{ name: 'new', intervalSeconds: 10 }])
    expect(result.update).toEqual([{ id: 1, name: 'changed', changes: { intervalSeconds: 60 } }])
    expect(result.delete).toEqual([{ id: 3, name: 'gone' }])
    expect(result.unchanged).toEqual(['same'])
  })
})
