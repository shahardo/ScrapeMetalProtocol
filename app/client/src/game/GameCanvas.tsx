import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Arena } from './Arena'
import { RobotEntity } from './robot/RobotEntity'
import { RemoteRobotEntity } from './RemoteRobotEntity'
import { useNetworking } from '../network/useNetworking'
import { useGameStore, GUN_MAX_AMMO, LASER_MAX_CHARGES, ROCKET_MAX_AMMO, CHASSIS_MAX_HEALTH } from '../store/gameStore'
import { useBotWorker } from './bot/useBotWorker'
import { BotScriptModal } from './ui/BotScriptModal'
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

function WeaponHUD() {
  const { gunAmmo, laserCharges, rocketAmmo, gunCooldownKey, laserCooldownKey } = useGameStore()

  return (
    <div className="weapon-hud">
      {/* Gun ammo pips + cooldown bar */}
      <div className="weapon-row">
        <span className="weapon-label">GUN</span>
        <div className="weapon-pips">
          {Array.from({ length: GUN_MAX_AMMO }, (_, i) => (
            <div
              key={i}
              className={`weapon-pip weapon-pip--gun${i < gunAmmo ? ' filled' : ''}`}
            />
          ))}
        </div>
      </div>
      <div className="weapon-cooldown-track weapon-cooldown-track--gun">
        {/* key change restarts the CSS fill animation without any per-frame state */}
        {gunCooldownKey > 0 && (
          <div
            key={gunCooldownKey}
            className="weapon-cooldown-fill weapon-cooldown-fill--gun"
            style={{ animationDuration: `${GUN_COOLDOWN_S}s` }}
          />
        )}
        {gunCooldownKey === 0 && (
          <div className="weapon-cooldown-fill weapon-cooldown-fill--gun weapon-cooldown-fill--ready" />
        )}
      </div>

      {/* Laser charge pips + cooldown bar */}
      <div className="weapon-row">
        <span className="weapon-label">LASER</span>
        <div className="weapon-pips">
          {Array.from({ length: LASER_MAX_CHARGES }, (_, i) => (
            <div
              key={i}
              className={`weapon-pip weapon-pip--laser${i < laserCharges ? ' filled' : ''}`}
            />
          ))}
        </div>
      </div>
      <div className="weapon-cooldown-track weapon-cooldown-track--laser">
        {laserCooldownKey > 0 && (
          <div
            key={laserCooldownKey}
            className="weapon-cooldown-fill weapon-cooldown-fill--laser"
            style={{ animationDuration: `${LASER_COOLDOWN_S}s` }}
          />
        )}
        {laserCooldownKey === 0 && (
          <div className="weapon-cooldown-fill weapon-cooldown-fill--laser weapon-cooldown-fill--ready" />
        )}
      </div>

      {/* Rocket ammo pips (no cooldown bar — reload is per-ammo) */}
      <div className="weapon-row">
        <span className="weapon-label">RCKT</span>
        <div className="weapon-pips">
          {Array.from({ length: ROCKET_MAX_AMMO }, (_, i) => (
            <div
              key={i}
              className={`weapon-pip weapon-pip--rocket${i < rocketAmmo ? ' filled' : ''}`}
            />
          ))}
        </div>
      </div>
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
  isBotActive: boolean
  sendTick: (state: BotState) => void
  remoteSnapshotRef: React.RefObject<RobotSnapshot | null>
}

function BotTickSender({ isBotActive, sendTick, remoteSnapshotRef }: BotTickSenderProps) {
  const tickTimer = useRef(0)
  useFrame((_, delta) => {
    if (!isBotActive) return
    tickTimer.current += delta
    if (tickTimer.current < 0.05) return  // ~20 Hz
    tickTimer.current = 0

    const s    = useGameStore.getState()
    const snap = remoteSnapshotRef.current
    sendTick({
      x: 0, y: 0,
      enemyX: snap?.pos[0] ?? 0,
      enemyY: snap?.pos[1] ?? 0,
      health: s.chassisHealth,
      enemyHealth: 100,
      gunAmmo: s.gunAmmo,
      laserCharges: s.laserCharges,
      isGrounded: true,
    })
  })
  return null
}

interface GameCanvasProps {
  authToken?: string
  userId?:    string
}

export function GameCanvas({ authToken }: GameCanvasProps) {
  const {
    status, lobby, countdown, joinQueue, leaveQueue,
    sendSnapshot, reportScore, latestRemoteSnapshot,
    pendingRemoteWeaponEvent, pendingRemoteWeaponHit,
    micStatus, toggleMic,
  } = useNetworking(authToken)

  const { isActive: isBotActive, workerError, installScript, sendTick, latestInputRef } = useBotWorker()
  const [botModalOpen, setBotModalOpen] = useState(false)

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

      {/* ── Weapon HUD (bottom-right) ────────────────────────────────────────── */}
      <WeaponHUD />

      {/* ── Bot button + modal ───────────────────────────────────────────── */}
      <button
        className={`bot-btn${isBotActive ? ' bot-btn--active' : ''}`}
        onClick={() => setBotModalOpen(true)}
        title="Open bot script editor"
      >
        {isBotActive ? 'BOT ON' : 'BOT'}
      </button>
      {botModalOpen && (
        <BotScriptModal
          onClose={() => setBotModalOpen(false)}
          onInstall={installScript}
          isActive={isBotActive}
          workerError={workerError}
        />
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
                <button className="matchmaking-btn" onClick={joinQueue}>FIND MATCH</button>
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
                <button className="matchmaking-btn matchmaking-btn--cancel" onClick={leaveQueue}>CANCEL</button>
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
