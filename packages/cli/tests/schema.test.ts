import { describe, expect, it } from 'vitest'
import { ConfigValidationError, parseConfigDocument } from '../src/schema.js'

describe('parseConfigDocument', () => {
  it('accepts a minimal valid document', () => {
    const doc = parseConfigDocument(
      {
        monitors: [
          { name: 'api', type: 'http', httpUrl: 'https://example.com', intervalSeconds: 30 },
        ],
        alertChannels: [{ name: 'slack', type: 'slack', config: { webhookUrl: 'https://x' } }],
      },
      'test.yaml',
    )
    expect(doc.monitors).toHaveLength(1)
    expect(doc.alertChannels).toHaveLength(1)
  })

  it('accepts an empty document', () => {
    const doc = parseConfigDocument({}, 'test.yaml')
    expect(doc.monitors).toBeUndefined()
    expect(doc.alertChannels).toBeUndefined()
  })

  it('rejects a monitor missing required fields', () => {
    expect(() =>
      parseConfigDocument({ monitors: [{ name: 'api', type: 'http' }] }, 'test.yaml'),
    ).toThrow(ConfigValidationError)
  })

  it('rejects an unknown monitor type', () => {
    expect(() =>
      parseConfigDocument(
        { monitors: [{ name: 'api', type: 'carrier-pigeon', intervalSeconds: 30 }] },
        'test.yaml',
      ),
    ).toThrow(ConfigValidationError)
  })

  it('rejects a tcp monitor missing host', () => {
    expect(() =>
      parseConfigDocument(
        { monitors: [{ name: 'db', type: 'tcp', port: 5432, intervalSeconds: 30 }] },
        'test.yaml',
      ),
    ).toThrow(/host is required/)
  })

  it('rejects a keyword monitor missing httpBodyContains', () => {
    expect(() =>
      parseConfigDocument(
        {
          monitors: [{ name: 'kw', type: 'keyword', httpUrl: 'https://x', intervalSeconds: 30 }],
        },
        'test.yaml',
      ),
    ).toThrow(/httpBodyContains is required/)
  })

  it('rejects duplicate monitor names', () => {
    expect(() =>
      parseConfigDocument(
        {
          monitors: [
            { name: 'dup', type: 'tcp', host: 'a', port: 1, intervalSeconds: 30 },
            { name: 'dup', type: 'tcp', host: 'b', port: 2, intervalSeconds: 30 },
          ],
        },
        'test.yaml',
      ),
    ).toThrow(/duplicate monitor name/)
  })

  it('accepts a monitor with an alertChannels list', () => {
    const doc = parseConfigDocument(
      {
        monitors: [
          {
            name: 'api',
            type: 'http',
            httpUrl: 'https://example.com',
            intervalSeconds: 30,
            alertChannels: ['ops-slack'],
          },
        ],
      },
      'test.yaml',
    )
    expect(doc.monitors?.[0]?.alertChannels).toEqual(['ops-slack'])
  })

  it('rejects duplicate alert channel names', () => {
    expect(() =>
      parseConfigDocument(
        {
          alertChannels: [
            { name: 'dup', type: 'webhook', config: {} },
            { name: 'dup', type: 'webhook', config: {} },
          ],
        },
        'test.yaml',
      ),
    ).toThrow(/duplicate alert channel name/)
  })
})
