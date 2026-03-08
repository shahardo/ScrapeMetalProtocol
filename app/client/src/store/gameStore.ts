import { create } from 'zustand'
import type { RobotPart, MatchState, ArenaId } from '../types/game'

export const GUN_MAX_AMMO       = 12
export const LASER_MAX_CHARGES  = 5

interface GameStore {
  // ── Match ────────────────────────────────────────────────────────────────
  match: MatchState | null
  setMatch: (match: MatchState | null) => void

  // ── Local player ─────────────────────────────────────────────────────────
  playerId: string | null
  setPlayerId: (id: string) => void

  playerParts: RobotPart[]
  setPlayerParts: (parts: RobotPart[]) => void

  /**
   * Applies damage to a specific part and marks it detached if health
   * reaches zero. Immutable update — produces a new parts array each call.
   */
  damagePlayerPart: (partId: string, damage: number) => void

  // ── Weapons ───────────────────────────────────────────────────────────────
  gunAmmo: number
  laserCharges: number
  damageDealt: number
  score: number
  setGunAmmo: (n: number) => void
  setLaserCharges: (n: number) => void
  addDamage: (n: number) => void
  addScore: (n: number) => void

  // ── Arena ─────────────────────────────────────────────────────────────────
  currentArena: ArenaId
  setCurrentArena: (arena: ArenaId) => void

  // ── UI flags ──────────────────────────────────────────────────────────────
  isConnecting: boolean
  setIsConnecting: (v: boolean) => void

  connectionError: string | null
  setConnectionError: (msg: string | null) => void
}

export const useGameStore = create<GameStore>((set) => ({
  match: null,
  setMatch: (match) => set({ match }),

  playerId: null,
  setPlayerId: (id) => set({ playerId: id }),

  playerParts: [],
  setPlayerParts: (parts) => set({ playerParts: parts }),

  damagePlayerPart: (partId, damage) =>
    set((state) => ({
      playerParts: state.playerParts.map((part) => {
        if (part.id !== partId) return part
        const newHealth = Math.max(0, part.health - damage)
        return { ...part, health: newHealth, isDetached: newHealth === 0 }
      }),
    })),

  gunAmmo: GUN_MAX_AMMO,
  laserCharges: LASER_MAX_CHARGES,
  damageDealt: 0,
  score: 0,
  setGunAmmo: (n) => set({ gunAmmo: n }),
  setLaserCharges: (n) => set({ laserCharges: n }),
  addDamage: (n) => set((s) => ({ damageDealt: s.damageDealt + n })),
  addScore: (n) => set((s) => ({ score: s.score + n })),

  currentArena: 'test-arena',
  setCurrentArena: (arena) => set({ currentArena: arena }),

  isConnecting: false,
  setIsConnecting: (v) => set({ isConnecting: v }),

  connectionError: null,
  setConnectionError: (msg) => set({ connectionError: msg }),
}))
