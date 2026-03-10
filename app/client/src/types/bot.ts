// Bot sandbox types for Scrap Metal Protocol.
// User scripts receive a BotState snapshot and must return a BotInput object.

/** Read-only snapshot of the match state delivered to the bot each tick. */
export interface BotState {
  /** Bot robot's world-space X position. */
  x: number
  /** Bot robot's world-space Y position. */
  y: number
  /** Enemy robot's world-space X position. */
  enemyX: number
  /** Enemy robot's world-space Y position. */
  enemyY: number
  /** Bot's chassis HP (0–100). */
  health: number
  /** Enemy's chassis HP (0–100). */
  enemyHealth: number
  /** Current gun ammo count. */
  gunAmmo: number
  /** Current laser charge count. */
  laserCharges: number
  /** Whether the bot is touching the ground. */
  isGrounded: boolean
}

/** Control output the bot returns each tick. */
export interface BotInput {
  /** Walk forward (W key equivalent). */
  forward?: boolean
  /** Walk backward (S key equivalent). */
  backward?: boolean
  /** Rotate left (A key equivalent). */
  left?: boolean
  /** Rotate right (D key equivalent). */
  right?: boolean
  jump?: boolean
  /** Fire right arm weapon (F key equivalent). */
  fireGun?: boolean
  /** Fire left arm weapon (L key equivalent). */
  fireLaser?: boolean
}

// ── Worker message protocol ───────────────────────────────────────────────────

/** Host → Worker: run one tick of the bot script. */
export interface BotTickRequest {
  type: 'tick'
  tickId: number
  state: BotState
}

/** Host → Worker: install new user script source. */
export interface BotInstallRequest {
  type: 'install'
  script: string
}

export type BotWorkerRequest = BotTickRequest | BotInstallRequest

/** Worker → Host: result of a bot tick. */
export interface BotTickResult {
  type: 'tick'
  tickId: number
  input: BotInput
}

/** Worker → Host: compile or runtime error. */
export interface BotErrorResult {
  type: 'error'
  message: string
}

export type BotWorkerResult = BotTickResult | BotErrorResult
