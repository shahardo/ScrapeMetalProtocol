import { describe, it, expect } from 'vitest'
import { formatDollars } from '../src/utils/formatDollars'

describe('formatDollars', () => {
  it('formats zero as $0', () => {
    expect(formatDollars(0)).toBe('$0')
  })

  it('formats a whole number correctly', () => {
    expect(formatDollars(120)).toBe('$120')
  })

  it('formats large values correctly', () => {
    expect(formatDollars(9999)).toBe('$9999')
  })
})
