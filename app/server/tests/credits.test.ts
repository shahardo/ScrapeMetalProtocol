import { describe, it, expect } from 'vitest'
import { calcMatchCredits, canAfford, MAX_CREDITS_PER_MATCH } from '../src/credits.js'

describe('calcMatchCredits', () => {
  it('returns floor(damageDealt/10) + score*5 for a typical match', () => {
    expect(calcMatchCredits({ damageDealt: 200, score: 3 })).toBe(35)
  })

  it('returns 0 when both inputs are zero', () => {
    expect(calcMatchCredits({ damageDealt: 0, score: 0 })).toBe(0)
  })

  it('clamps to MAX_CREDITS_PER_MATCH for extreme inputs', () => {
    expect(calcMatchCredits({ damageDealt: 100_000, score: 9999 })).toBe(MAX_CREDITS_PER_MATCH)
  })

  it('floors fractional damage correctly', () => {
    // 15 damage → floor(15/10) = 1, score 0 → 1 total
    expect(calcMatchCredits({ damageDealt: 15, score: 0 })).toBe(1)
  })
})

describe('canAfford', () => {
  it('returns true when balance equals price', () => {
    expect(canAfford(200, 200)).toBe(true)
  })

  it('returns true when balance exceeds price', () => {
    expect(canAfford(500, 200)).toBe(true)
  })

  it('returns false when balance is below price', () => {
    expect(canAfford(199, 200)).toBe(false)
  })

  it('returns true for free items (price 0)', () => {
    expect(canAfford(0, 0)).toBe(true)
  })
})
