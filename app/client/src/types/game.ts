// Core domain types for Scrap Metal Protocol.
// All game entities must be strongly typed — never use `any`.

export type PartType =
  | 'chassis'
  | 'head'
  | 'arm-left'
  | 'arm-right'
  | 'leg-left'
  | 'leg-right'
  | 'weapon'

/** A single modular component that makes up a robot. */
export interface RobotPart {
  id: string
  type: PartType
  health: number
  maxHealth: number
  /** Affects how hard this robot hits and how fast it moves. */
  weight: number
  /** Reduces incoming damage to this part. */
  armor: number
  isDetached: boolean
}

/** Full robot configuration as stored in the Garage / DB. */
export interface RobotConfig {
  id: string
  name: string
  parts: RobotPart[]
}

/** Live match state kept in sync across peers. */
export interface MatchState {
  id: string
  players: [string, string]
  arena: ArenaId
  tick: number
  isActive: boolean
}

export type ArenaId = 'junkyard' | 'ruined-city' | 'cyber-core' | 'test-arena'

/** Input snapshot sent to the server each tick. */
export interface PlayerInput {
  playerId: string
  tick: number
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
}

/** Physics snapshot broadcast to the opponent over WebRTC DataChannel at ~20 Hz. */
export interface RobotSnapshot {
  tick: number
  pos: [number, number, number]
  /** Quaternion [x, y, z, w] */
  rot: [number, number, number, number]
  vel: [number, number, number]
}

/** Damage event emitted when a joint breaks or a part is struck. */
export interface DamageEvent {
  targetPlayerId: string
  partId: string
  /** Raw kinetic energy of the impact; damage = f(impactForce, armor). */
  impactForce: number
  tick: number
}
