/**
 * Pure credit economy helpers — no side effects, no database calls.
 * All match reward logic lives here so it can be tested independently.
 */

export interface MatchReward {
  damageDealt: number
  score: number
}

/**
 * Calculates credits earned from a completed match.
 * Formula: floor(damageDealt / 10) + score * 5
 * Clamped to [0, MAX_CREDITS_PER_MATCH] to bound runaway values.
 */
export const MAX_CREDITS_PER_MATCH = 500

export function calcMatchCredits(reward: MatchReward): number {
  const raw = Math.floor(reward.damageDealt / 10) + reward.score * 5
  return Math.max(0, Math.min(raw, MAX_CREDITS_PER_MATCH))
}

/** Returns true when a user with `balance` credits can afford `price`. */
export function canAfford(balance: number, price: number): boolean {
  return balance >= price
}
