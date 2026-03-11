import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Arena } from './Arena'
import { RobotEntity } from './robot/RobotEntity'
import { RemoteRobotEntity } from './RemoteRobotEntity'
import { useNetworking } from '../network/useNetworking'
import { useGameStore, ROCKET_MAX_AMMO, CHASSIS_MAX_HEALTH } from '../store/gameStore'
import { WEAPON_COLOR, WEAPON_LABEL, WEAPON_POOL, WEAPON_STATS } from './weapons/weaponRegistry'
import type { WeaponType } from '../types/game'
import { useBotWorker } from './bot/useBotWorker'
import { GarageModal } from './ui/GarageModal'
import { BotDebugPanel } from './ui/BotDebugPanel'
import type { BotState } from '../types/bot'
import type { RobotSnapshot } from '../types/game'

// ── React Error Boundary ──────────────────────────────────────────────────────

interface BoundaryState {
  hasError: boolean
  errorMessage: string
}

class GameErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SMP] GameErrorBoundary caught a render fault:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-modal">
          <div className="error-boundary-content">
            <h2>⚠ SYSTEM REBOOT REQUIRED</h2>
            <p>The render engine encountered an unexpected fault. GPU memory has been freed.</p>
            <code>{this.state.errorMessage}</code>
            <button onClick={() => this.setState({ hasError: false, errorMessage: '' })}>
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── CameraController ──────────────────────────────────────────────────────────
// Orbits the camera around [0, 2, 0] using arrow keys.
// Stored as refs so we don't trigger re-renders on every keypress.

const ORBIT_SPEED = 1.2   // radians per second
const ORBIT_RADIUS = 14
const ORBIT_TARGET = [0, 2, 0] as const

const ELEVATION_MIN = 0.05            // just above the horizon
const ELEVATION_MAX = Math.PI / 2 - 0.05  // just below straight-up

function CameraController() {
  const { camera } = useThree()

  const angle = useRef({ azimuth: 0, elevation: 0.22 })
  const keys = useRef({ left: false, right: false, up: false, down: false })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':  keys.current.left  = true; break
        case 'ArrowRight': keys.current.right = true; break
        case 'ArrowUp':    keys.current.up    = true; break
        case 'ArrowDown':  keys.current.down  = true; break
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':  keys.current.left  = false; break
        case 'ArrowRight': keys.current.right = false; break
        case 'ArrowUp':    keys.current.up    = false; break
        case 'ArrowDown':  keys.current.down  = false; break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useFrame((_, delta) => {
    const k = keys.current
    const a = angle.current

    if (k.left)  a.azimuth  -= ORBIT_SPEED * delta
    if (k.right) a.azimuth  += ORBIT_SPEED * delta
    if (k.up)    a.elevation = Math.min(ELEVATION_MAX, a.elevation + ORBIT_SPEED * delta)
    if (k.down)  a.elevation = Math.max(ELEVATION_MIN, a.elevation - ORBIT_SPEED * delta)

    // Spherical → cartesian
    const x = Math.sin(a.azimuth) * Math.cos(a.elevation) * ORBIT_RADIUS
    const y = Math.sin(a.elevation) * ORBIT_RADIUS + ORBIT_TARGET[1]
    const z = Math.cos(a.azimuth) * Math.cos(a.elevation) * ORBIT_RADIUS

    camera.position.set(x, y, z)
    camera.lookAt(...ORBIT_TARGET)
  })

  return null
}

// ── HealthBar ─────────────────────────────────────────────────────────────────

function HealthBar() {
  const chassisHealth = useGameStore((s) => s.chassisHealth)
  const pct = (chassisHealth / CHASSIS_MAX_HEALTH) * 100

  // Colour shifts: green → yellow → red as health drops
  const color =
    pct > 60 ? '#00ff88'
    : pct > 30 ? '#ffcc00'
    : '#ff3344'

  return (
    <div className="health-bar-container">
      <span className="health-bar-label">HEALTH</span>
      <div className="health-bar-track">
        <div
          className="health-bar-fill"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <span className="health-bar-value">{chassisHealth}</span>
    </div>
  )
}

// ── HitPopups ─────────────────────────────────────────────────────────────────
// Renders floating damage numbers in 3D space via drei's Html component so
// they appear at the exact world position of each hit, on both players' screens.
// Must be placed INSIDE the Canvas.

const POPUP_TTL_MS = 900

function HitPopups() {
  const { damagePopups, clearDamagePopup } = useGameStore()

  useEffect(() => {
    if (damagePopups.length === 0) return
    const oldest = damagePopups[0]
    if (!oldest) return
    const remaining = POPUP_TTL_MS - (Date.now() - oldest.createdAt)
    const timer = setTimeout(() => clearDamagePopup(oldest.id), Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [damagePopups, clearDamagePopup])

  return (
    <>
      {damagePopups.map((p) => (
        <Html
          key={p.id}
          // Anchor slightly above the hit point so the number floats upward visibly
          position={[p.hitPos[0], p.hitPos[1] + 0.5, p.hitPos[2]]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="damage-popup">-{p.amount}</div>
        </Html>
      ))}
    </>
  )
}

// ── WeaponHUD ─────────────────────────────────────────────────────────────────

function ScoreHUD() {
  const { score, damageDealt } = useGameStore()
  return (
    <div className="score-hud">
      <div className="score-counter">SCORE {score}</div>
      {damageDealt > 0 && <div className="damage-counter">DMG {damageDealt}</div>}
    </div>
  )
}

// GUN_COOLDOWN and LASER_COOLDOWN durations must match WeaponSystem constants.
// They drive the CSS animation-duration so the bar fills in sync with the timer.
const GUN_COOLDOWN_S   = 0.7
const LASER_COOLDOWN_S = 1.5

// ── WeaponIcon ────────────────────────────────────────────────────────────────
// Minimal 24×14 inline SVG silhouette for each weapon type.

function WeaponIcon({ type, color }: { type: WeaponType; color: string }) {
  const s = color
  switch (type) {
    case 'gun':
      return (
        <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
          <rect x="0" y="4" width="14" height="6" rx="1" fill={s} />
          <rect x="14" y="5" width="9" height="3" rx="0.5" fill={s} />
          <rect x="3" y="10" width="5" height="4" rx="1" fill={s} />
        </svg>
      )
    case 'shotgun':
      return (
        <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
          <rect x="0" y="3" width="12" height="8" rx="1.5" fill={s} />
          <rect x="12" y="5" width="10" height="4" rx="0.5" fill={s} />
          <rect x="12" y="4" width="10" height="1" rx="0.5" fill={s} opacity="0.6" />
          <rect x="12" y="9" width="10" height="1" rx="0.5" fill={s} opacity="0.6" />
          <rect x="3" y="11" width="5" height="3" rx="1" fill={s} />
        </svg>
      )
    case 'rocket':
      return (
        <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
          <rect x="3" y="4" width="12" height="6" rx="1" fill={s} />
          <polygon points="15,4 15,10 22,7" fill={s} />
          <polygon points="3,4 0,2 0,12 3,10" fill={s} opacity="0.7" />
        </svg>
      )
    case 'laser':
      return (
        <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
          <rect x="0" y="5" width="10" height="4" rx="1" fill={s} />
          <rect x="10" y="6" width="14" height="2" rx="0.5" fill={s} />
          <rect x="3" y="9" width="5" height="3" rx="1" fill={s} opacity="0.7" />
          <circle cx="23" cy="7" r="1.5" fill={s} opacity="0.9" />
        </svg>
      )
    case 'sniper':
      return (
        <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
          <rect x="0" y="5" width="8" height="4" rx="1" fill={s} />
          <rect x="8" y="6" width="16" height="2" rx="0.5" fill={s} />
          <rect x="3" y="9" width="4" height="4" rx="1" fill={s} />
          <rect x="5" y="2" width="3" height="4" rx="0.5" fill={s} opacity="0.8" />
        </svg>
      )
  }
}

// ── WeaponSlotRow — one arm's weapon info ─────────────────────────────────────

interface WeaponSlotRowProps {
  keyLabel:    'Q' | 'E'
  weapon:      WeaponType
  ammo:        number
  maxAmmo:     number
  cooldownKey: number
  cooldownS:   number
  pool:        'gun' | 'laser' | 'rocket'
}

function WeaponSlotRow({ keyLabel, weapon, ammo, maxAmmo, cooldownKey, cooldownS, pool }: WeaponSlotRowProps) {
  const color = WEAPON_COLOR[weapon]
  return (
    <div className="weapon-slot">
      <div className="weapon-slot-header">
        <span className="weapon-slot-key" style={{ color }}>{keyLabel}</span>
        <WeaponIcon type={weapon} color={color} />
        <span className="weapon-slot-name" style={{ color }}>{WEAPON_LABEL[weapon]}</span>
      </div>
      <div className="weapon-pips">
        {Array.from({ length: maxAmmo }, (_, i) => (
          <div
            key={i}
            className={`weapon-pip weapon-pip--${pool}${i < ammo ? ' filled' : ''}`}
            style={i < ammo ? { background: color, boxShadow: `0 0 3px ${color}` } : undefined}
          />
        ))}
      </div>
      {cooldownS > 0 && (
        <div className={`weapon-cooldown-track weapon-cooldown-track--${pool}`}>
          {cooldownKey > 0 && (
            <div
              key={cooldownKey}
              className={`weapon-cooldown-fill weapon-cooldown-fill--${pool}`}
              style={{ animationDuration: `${cooldownS}s` }}
            />
          )}
          {cooldownKey === 0 && (
            <div className={`weapon-cooldown-fill weapon-cooldown-fill--${pool} weapon-cooldown-fill--ready`} />
          )}
        </div>
      )}
    </div>
  )
}

function WeaponHUD() {
  const {
    gunAmmo, laserCharges, rocketAmmo,
    gunCooldownKey, laserCooldownKey,
    leftArmWeapon, rightArmWeapon,
  } = useGameStore()

  // Resolve ammo count and max pips for a given weapon slot.
  const slotAmmo = (w: WeaponType) => {
    const pool = WEAPON_POOL[w]
    if (pool === 'gun')    return { ammo: gunAmmo,      max: WEAPON_STATS[w].ammo }
    if (pool === 'laser')  return { ammo: laserCharges, max: WEAPON_STATS[w].ammo }
    return                        { ammo: rocketAmmo,   max: ROCKET_MAX_AMMO       }
  }
  const slotCooldown = (w: WeaponType) => {
    const pool = WEAPON_POOL[w]
    if (pool === 'gun')   return { key: gunCooldownKey,   s: GUN_COOLDOWN_S   }
    if (pool === 'laser') return { key: laserCooldownKey, s: LASER_COOLDOWN_S }
    return                       { key: 0,                s: 0                }
  }

  const left  = slotAmmo(leftArmWeapon)
  const right = slotAmmo(rightArmWeapon)
  const leftCd  = slotCooldown(leftArmWeapon)
  const rightCd = slotCooldown(rightArmWeapon)

  return (
    <div className="weapon-hud">
      <WeaponSlotRow
        keyLabel="Q"
        weapon={leftArmWeapon}
        ammo={left.ammo}
        maxAmmo={left.max}
        cooldownKey={leftCd.key}
        cooldownS={leftCd.s}
        pool={WEAPON_POOL[leftArmWeapon]}
      />
      <WeaponSlotRow
        keyLabel="E"
        weapon={rightArmWeapon}
        ammo={right.ammo}
        maxAmmo={right.max}
        cooldownKey={rightCd.key}
        cooldownS={rightCd.s}
        pool={WEAPON_POOL[rightArmWeapon]}
      />
    </div>
  )
}

// ── RadarHUD ──────────────────────────────────────────────────────────────────
// Renders a top-down 2D radar showing local (green) and remote (red) positions.
// Arena is treated as a ±12 × ±6 bounding box. Sweep line completes every 2 s.
// Draws at 10 Hz via setInterval to stay off the React render path.

const RADAR_SIZE   = 120           // px — canvas width & height
const ARENA_HALF_X = 12            // world units from center to side wall
const ARENA_HALF_Z = 6             // world units from center to front/back wall
const SWEEP_PERIOD = 2000          // ms per full rotation

interface RadarHUDProps {
  localPosRef:       React.RefObject<[number, number, number]>
  localAzimuthRef:   React.RefObject<number>
  remoteSnapshotRef: React.RefObject<{ pos: [number, number, number] } | null>
}

function RadarHUD({ localPosRef, localAzimuthRef, remoteSnapshotRef }: RadarHUDProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const R = RADAR_SIZE / 2

    const draw = () => {
      ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE)

      // Background
      ctx.fillStyle = 'rgba(5, 12, 20, 0.88)'
      ctx.beginPath()
      ctx.arc(R, R, R, 0, Math.PI * 2)
      ctx.fill()

      // Clip all subsequent drawing to the circle
      ctx.save()
      ctx.beginPath()
      ctx.arc(R, R, R, 0, Math.PI * 2)
      ctx.clip()

      // Concentric range rings — brighter so they're legible
      ctx.lineWidth = 0.8
      for (const [frac, alpha] of [[0.33, 0.28], [0.66, 0.28], [1, 0.18]] as const) {
        ctx.strokeStyle = `rgba(0, 255, 180, ${alpha})`
        ctx.beginPath()
        ctx.arc(R, R, R * frac, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 8-sector tick marks at the outer ring — evenly spaced cardinal/intercardinal
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.45)'
      ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const inner = R * 0.86
        ctx.beginPath()
        ctx.moveTo(R + Math.cos(a) * inner, R + Math.sin(a) * inner)
        ctx.lineTo(R + Math.cos(a) * (R - 1), R + Math.sin(a) * (R - 1))
        ctx.stroke()
      }

      // Cardinal cross-hair lines
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.22)'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(R, 0); ctx.lineTo(R, RADAR_SIZE); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, R); ctx.lineTo(RADAR_SIZE, R); ctx.stroke()

      // Sweep line
      const sweepAngle = ((Date.now() % SWEEP_PERIOD) / SWEEP_PERIOD) * Math.PI * 2 - Math.PI / 2
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.65)'
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      ctx.moveTo(R, R)
      ctx.lineTo(R + Math.cos(sweepAngle) * (R - 2), R + Math.sin(sweepAngle) * (R - 2))
      ctx.stroke()

      // Local robot is at center; all other positions are rotated by -facingAngle
      // so the robot's forward direction always points up (north) on the radar.
      const [lx, , lz] = localPosRef.current ?? [0, 0, 0]
      const azimuth     = localAzimuthRef.current ?? 0

      const toRelPixel = (wx: number, wz: number): [number, number] => {
        // World-space offset from local robot
        const dx = (wx - lx) / ARENA_HALF_X * R
        const dz = (wz - lz) / ARENA_HALF_Z * R
        // Robot forward is +Z at azimuth=0.  We want +Z → screen up (-Y).
        // The required rotation is (azimuth - π), which simplifies to negating
        // both cos and sin of azimuth in the standard 2-D rotation formula.
        const cos = -Math.cos(azimuth)
        const sin = -Math.sin(azimuth)
        const rdx = dx * cos - dz * sin
        const rdz = dx * sin + dz * cos
        // Clamp so the dot stays inside the circle
        const len = Math.sqrt(rdx * rdx + rdz * rdz)
        const scale = len > R - 4 ? (R - 4) / len : 1
        return [R + rdx * scale, R + rdz * scale]
      }

      // Remote robot (red dot)
      const snap = remoteSnapshotRef.current
      if (snap) {
        const [ex, ey] = toRelPixel(snap.pos[0], snap.pos[2])
        ctx.fillStyle = '#ff4444'
        ctx.shadowColor = '#ff4444'
        ctx.shadowBlur  = 4
        ctx.beginPath()
        ctx.arc(ex, ey, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // Local robot (green dot) — always at center with a forward indicator triangle
      ctx.fillStyle = '#44ffaa'
      ctx.shadowColor = '#44ffaa'
      ctx.shadowBlur  = 6
      ctx.beginPath()
      ctx.arc(R, R, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // Forward arrow — short line pointing straight up (robot forward = up)
      ctx.strokeStyle = '#44ffaa'
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      ctx.moveTo(R, R - 3.5)
      ctx.lineTo(R, R - 9)
      ctx.stroke()

      ctx.restore()

      // Outer ring border
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(R, R, R - 0.5, 0, Math.PI * 2)
      ctx.stroke()
    }

    const id = setInterval(draw, 100)  // 10 Hz
    draw()
    return () => clearInterval(id)
  }, [localPosRef, localAzimuthRef, remoteSnapshotRef])

  return (
    <div className="radar-hud">
      <canvas ref={canvasRef} width={RADAR_SIZE} height={RADAR_SIZE} />
      <span className="radar-label">RADAR</span>
    </div>
  )
}

// ── Canvas ────────────────────────────────────────────────────────────────────

// Mic status label map
const MIC_LABEL: Record<string, string> = {
  muted: '🎤 MIC OFF',
  active: '🎤 LIVE',
  unavailable: '🎤 UNAVAILABLE',
}

// ── BotTickSender ─────────────────────────────────────────────────────────────
// Lives inside the Canvas so it can use useFrame without extra overhead.
// Sends a BotState snapshot to the bot worker at ~20 Hz.

interface BotTickSenderProps {
  isBotActive:       boolean
  sendTick:          (state: BotState) => void
  localPosRef:       React.RefObject<[number, number, number]>
  remoteSnapshotRef: React.RefObject<RobotSnapshot | null>
}

function BotTickSender({ isBotActive, sendTick, localPosRef, remoteSnapshotRef }: BotTickSenderProps) {
  const tickTimer = useRef(0)
  useFrame((_, delta) => {
    if (!isBotActive) return
    tickTimer.current += delta
    if (tickTimer.current < 0.05) return  // ~20 Hz
    tickTimer.current = 0

    const s    = useGameStore.getState()
    const snap = remoteSnapshotRef.current
    const [lx, ly] = localPosRef.current ?? [0, 0, 0]
    sendTick({
      x:            lx,
      y:            ly,
      enemyX:       snap?.pos[0] ?? 0,
      enemyY:       snap?.pos[1] ?? 0,
      health:       s.chassisHealth,
      enemyHealth:  100,
      gunAmmo:      s.gunAmmo,
      laserCharges: s.laserCharges,
      isGrounded:   true,
    })
  })
  return null
}

interface GameCanvasProps {
  authToken?:     string
  userId?:        string
  garageOpen?:    boolean
  onGarageClose?: () => void
  /**
   * Fired whenever bot installed/active state or the start/stop callbacks change.
   * App.tsx uses this to render the BOT RUN/STOP button in the top HUD row.
   */
  onBotStateChange?: (isInstalled: boolean, isActive: boolean, startBot: () => void, stopBot: () => void) => void
}

export function GameCanvas({ authToken, userId, garageOpen, onGarageClose, onBotStateChange }: GameCanvasProps) {
  const {
    status, lobby, countdown, matchResult, joinQueue, leaveQueue, skipCountdown,
    sendSnapshot, reportScore, sendMatchEnd, latestRemoteSnapshot,
    pendingRemoteWeaponEvent, pendingRemoteWeaponHit,
    micStatus, toggleMic,
  } = useNetworking(authToken)

  const { isInstalled: isBotInstalled, isActive: isBotActive, workerError, installScript, startBot, stopBot, sendTick, latestInputRef, debugRef } = useBotWorker()

  // Notify parent whenever bot state changes so App.tsx can render the HUD button.
  const onBotStateChangeRef = useRef(onBotStateChange)
  onBotStateChangeRef.current = onBotStateChange
  useEffect(() => {
    onBotStateChangeRef.current?.(isBotInstalled, isBotActive, startBot, stopBot)
  }, [isBotInstalled, isBotActive, startBot, stopBot])

  // Tracks local chassis world position — updated by RobotEntity each frame via ref.
  // Shared with RadarHUD (for relative positioning) and BotTickSender (for BotState.x/y).
  const localPosRef     = useRef<[number, number, number]>([0, 0, 0])
  // Tracks the robot's Y-axis facing angle; RadarHUD rotates the view to match.
  const localAzimuthRef = useRef<number>(0)

  // Mirror networking status into the store so App.tsx can gate the Garage button.
  const setMatchStatus   = useGameStore((s) => s.setMatchStatus)
  const chassisHealth    = useGameStore((s) => s.chassisHealth)
  const setChassisHealth = useGameStore((s) => s.setChassisHealth)
  useEffect(() => { setMatchStatus(status) }, [status, setMatchStatus])

  // Send matchEnd when our health reaches zero; reset health when match ends.
  const matchEndSentRef = useRef(false)
  useEffect(() => {
    if (status !== 'matched') {
      matchEndSentRef.current = false
      return
    }
    if (chassisHealth === 0 && !matchEndSentRef.current) {
      matchEndSentRef.current = true
      sendMatchEnd()
    }
  }, [chassisHealth, status, sendMatchEnd])

  // Reset health when returning to lobby so the next match starts fresh.
  useEffect(() => {
    if (status === 'disconnected') setChassisHealth(100)
  }, [status, setChassisHealth])

  // Report score to server whenever it changes so the live scoreboard updates.
  const score = useGameStore((s) => s.score)
  useEffect(() => {
    if (status === 'matched') reportScore(score)
  }, [score, status, reportScore])

  return (
    <>
      {/* ── Score HUD (bottom-left) ──────────────────────────────────────────── */}
      <ScoreHUD />

      {/* ── Hull health bar (above score) ───────────────────────────────────── */}
      <HealthBar />

      {/* ── Bot debug panel (above weapon HUD, visible when bot is active) ───── */}
      <BotDebugPanel isBotActive={isBotActive} workerError={workerError} debugRef={debugRef} />

      {/* ── Weapon HUD (bottom-right) ────────────────────────────────────────── */}
      <WeaponHUD />

      {/* ── Radar (top-right, visible during matched play) ───────────────────── */}
      {status === 'matched' && (
        <RadarHUD localPosRef={localPosRef} localAzimuthRef={localAzimuthRef} remoteSnapshotRef={latestRemoteSnapshot} />
      )}

      {/* ── Garage modal (pre-match only; hosts weapon config + bot editor) ── */}
      {garageOpen && userId && (
        <GarageModal
          onClose={onGarageClose ?? (() => {})}
          userId={userId}
          isBotInstalled={isBotInstalled}
          isBotActive={isBotActive}
          workerError={workerError}
          onInstallBot={installScript}
          onStartBot={startBot}
          onStopBot={stopBot}
        />
      )}

      {/* ── Match result overlay (5 s after match ends) ─────────────────── */}
      {matchResult !== 'none' && (
        <div className={`match-result-overlay match-result-overlay--${matchResult}`}>
          <div className="match-result-panel">
            <span className="match-result-title">
              {matchResult === 'victory' ? 'VICTORY' : 'DEFEATED'}
            </span>
            <span className="match-result-sub">Returning to hangar...</span>
          </div>
        </div>
      )}

      {/* ── Mic indicator (only during a live match) ──────────────────────── */}
      {status === 'matched' && micStatus !== 'idle' && (
        <button
          className={`mic-btn mic-btn--${micStatus}`}
          onClick={() => void toggleMic()}
          title={micStatus === 'unavailable' ? 'Mic access denied' : 'Toggle microphone'}
        >
          {MIC_LABEL[micStatus] ?? '🎤'}
        </button>
      )}

      {/* ── Matchmaking overlay (visible until P2P channel is open) ───────── */}
      {status !== 'matched' && (
        <div className="matchmaking-overlay">
          <div className="matchmaking-panel">
            {status === 'disconnected' && (
              <>
                <p className="matchmaking-tagline">PILOT READY</p>
                <p className="matchmaking-hint">Configure your loadout in the GARAGE, then enter the arena.</p>
                <button className="matchmaking-btn matchmaking-btn--start" onClick={joinQueue}>START MATCH</button>
              </>
            )}
            {status === 'queued' && (
              <>
                {countdown !== null
                  ? <p className="matchmaking-tagline">MATCH STARTING IN {countdown}<span className="matchmaking-dots">...</span></p>
                  : <p className="matchmaking-tagline">SEARCHING FOR OPPONENT<span className="matchmaking-dots">...</span></p>
                }
                {lobby.length > 0 && (
                  <ul className="lobby-list">
                    {lobby.map((e) => (
                      <li key={e.socketId} className="lobby-entry">{e.username}</li>
                    ))}
                  </ul>
                )}
                <div className="matchmaking-btn-row">
                  {countdown !== null && (
                    <button className="matchmaking-btn matchmaking-btn--start" onClick={skipCountdown}>
                      START NOW
                    </button>
                  )}
                  <button className="matchmaking-btn matchmaking-btn--cancel" onClick={leaveQueue}>CANCEL</button>
                </div>
              </>
            )}
            {status === 'connecting' && (
              <p className="matchmaking-tagline">ESTABLISHING P2P LINK<span className="matchmaking-dots">...</span></p>
            )}
          </div>
        </div>
      )}

      <GameErrorBoundary>
        <Canvas
          shadows
          camera={{
            position: [0, 5.5, 14],
            fov: 45,
            near: 0.1,
            far: 200,
          }}
          style={{ background: '#2a3348', width: '100%', height: '100%' }}
        >
          <CameraController />

          {/* ── Lighting ─────────────────────────────────────────────────── */}
          <ambientLight intensity={1.2} />

          <directionalLight
            position={[4, 12, 6]}
            intensity={2.8}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={12}
            shadow-camera-bottom={-4}
          />

          {/* Fill from opposite side — reduces harsh shadows */}
          <pointLight position={[-8, 8, 4]} intensity={1.6} color="#5070a8" />

          {/* Warm under-light for the floor surface */}
          <pointLight position={[0, 1, 3]} intensity={0.9} color="#a07850" />

          {/* ── Floating damage numbers anchored to 3D hit positions ────── */}
          <HitPopups />

          {/* ── Bot tick sender (feeds bot input to RobotEntity each frame) ─ */}
          <BotTickSender
            isBotActive={isBotActive}
            sendTick={sendTick}
            localPosRef={localPosRef}
            remoteSnapshotRef={latestRemoteSnapshot}
          />

          {/* ── Physics world ────────────────────────────────────────────── */}
          <Suspense fallback={null}>
            <Physics gravity={[0, -30, 0]}>
              <Arena />
              <RobotEntity
                color="#4a8aaa"
                startPosition={[-3, 3, 0]}
                onSnapshot={sendSnapshot}
                botInputRef={latestInputRef}
                isBotActive={isBotActive}
                localPosRef={localPosRef}
                localAzimuthRef={localAzimuthRef}
              />
              {status === 'matched' && (
                <RemoteRobotEntity
                  color="#aa4a4a"
                  latestSnapshot={latestRemoteSnapshot}
                  pendingWeaponEvent={pendingRemoteWeaponEvent}
                  pendingWeaponHit={pendingRemoteWeaponHit}
                />
              )}
            </Physics>
          </Suspense>
        </Canvas>
      </GameErrorBoundary>
    </>
  )
}
