import { describe, expect, it } from 'vitest'
import { canWrite } from '../../src/dashboard/role-helpers.js'

describe('canWrite', () => {
  it('is true for admin', () => {
    expect(canWrite('admin')).toBe(true)
  })

  it('is true for editor', () => {
    expect(canWrite('editor')).toBe(true)
  })

  it('is false for viewer', () => {
    expect(canWrite('viewer')).toBe(false)
  })
})
