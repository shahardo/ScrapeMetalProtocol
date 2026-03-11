import { create } from 'zustand'
import type { RobotPart, MatchState, ArenaId, WeaponType } from '../types/game'
import type { LiveScoreEntry } from '../types/auth'

export const GUN_MAX_AMMO       = 12
export const LASER_MAX_CHARGES  = 5
export const ROCKET_MAX_AMMO    = 2
export const CHASSIS_MAX_HEALTH = 100

/** A transient hit popup rendered in world space by HitPopups inside the Canvas. */
export interface DamagePopup {
  id: string
  amount: number
  createdAt: number
  /** World-space position of the hit, used to anchor the popup in 3D. */
  hitPos: [number, number, number]
}

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

  // ── Chassis health (player's own robot) ───────────────────────────────────
  chassisHealth: number
  /** Subtract damage from chassisHealth, clamped to [0, CHASSIS_MAX_HEALTH]. */
  damagePlayerChassis: (amount: number) => void
  setChassisHealth: (h: number) => void

  // ── Weapons ───────────────────────────────────────────────────────────────
  gunAmmo: number
  laserCharges: number
  rocketAmmo: number
  damageDealt: number
  score: number
  setGunAmmo: (n: number) => void
  setLaserCharges: (n: number) => void
  setRocketAmmo: (n: number) => void
  addDamage: (n: number) => void
  addScore: (n: number) => void

  /**
   * Incremented each time the weapon fires; used as a React key on the
   * cooldown bar div so the CSS animation restarts without per-frame state.
   */
  gunCooldownKey: number
  laserCooldownKey: number
  bumpGunCooldown: () => void
  bumpLaserCooldown: () => void

  // ── Weapon loadout ────────────────────────────────────────────────────────
  /** Weapon equipped on the left arm (L key). Defaults to laser. */
  leftArmWeapon: WeaponType
  /** Weapon equipped on the right arm (F key). Defaults to gun. */
  rightArmWeapon: WeaponType
  setLeftArmWeapon: (w: WeaponType) => void
  setRightArmWeapon: (w: WeaponType) => void

  // ── Damage popups (floating hit numbers shown on successful hits) ──────────
  damagePopups: DamagePopup[]
  addDamagePopup: (amount: number, hitPos: [number, number, number]) => void
  clearDamagePopup: (id: string) => void

  // ── Live scores (in-session, from Socket.io) ──────────────────────────────
  liveScores: LiveScoreEntry[]
  setLiveScores: (scores: LiveScoreEntry[]) => void

  // ── Arena ─────────────────────────────────────────────────────────────────
  currentArena: ArenaId
  setCurrentArena: (arena: ArenaId) => void

  // ── Match status (mirrors useNetworking status for cross-component gating) ─
  matchStatus: 'disconnected' | 'queued' | 'connecting' | 'matched'
  setMatchStatus: (s: 'disconnected' | 'queued' | 'connecting' | 'matched') => void

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

  chassisHealth: CHASSIS_MAX_HEALTH,
  damagePlayerChassis: (amount) =>
    set((s) => ({ chassisHealth: Math.max(0, s.chassisHealth - amount) })),
  setChassisHealth: (h) => set({ chassisHealth: Math.max(0, Math.min(CHASSIS_MAX_HEALTH, h)) }),

  gunAmmo: GUN_MAX_AMMO,
  laserCharges: LASER_MAX_CHARGES,
  rocketAmmo: ROCKET_MAX_AMMO,
  damageDealt: 0,
  score: 0,
  setGunAmmo: (n) => set({ gunAmmo: n }),
  setLaserCharges: (n) => set({ laserCharges: n }),
  setRocketAmmo: (n) => set({ rocketAmmo: n }),
  addDamage: (n) => set((s) => ({ damageDealt: s.damageDealt + n })),
  addScore: (n) => set((s) => ({ score: s.score + n })),

  gunCooldownKey: 0,
  laserCooldownKey: 0,
  bumpGunCooldown: () => set((s) => ({ gunCooldownKey: s.gunCooldownKey + 1 })),
  bumpLaserCooldown: () => set((s) => ({ laserCooldownKey: s.laserCooldownKey + 1 })),

  leftArmWeapon: 'laser',
  rightArmWeapon: 'gun',
  setLeftArmWeapon: (w) => set({ leftArmWeapon: w }),
  setRightArmWeapon: (w) => set({ rightArmWeapon: w }),

  damagePopups: [],
  addDamagePopup: (amount, hitPos) =>
    set((s) => ({
      damagePopups: [
        ...s.damagePopups,
        { id: crypto.randomUUID(), amount, createdAt: Date.now(), hitPos },
      ],
    })),
  clearDamagePopup: (id) =>
    set((s) => ({ damagePopups: s.damagePopups.filter((p) => p.id !== id) })),

  liveScores: [],
  setLiveScores: (scores) => set({ liveScores: scores }),

  currentArena: 'test-arena',
  setCurrentArena: (arena) => set({ currentArena: arena }),

  matchStatus: 'disconnected',
  setMatchStatus: (s) => set({ matchStatus: s }),

  isConnecting: false,
  setIsConnecting: (v) => set({ isConnecting: v }),

  connectionError: null,
  setConnectionError: (msg) => set({ connectionError: msg }),
}))
