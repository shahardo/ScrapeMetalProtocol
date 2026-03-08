import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Arena } from './Arena'
import { RobotEntity } from './robot/RobotEntity'
import { RemoteRobotEntity } from './RemoteRobotEntity'
import { useNetworking } from '../network/useNetworking'
import { useGameStore, GUN_MAX_AMMO, LASER_MAX_CHARGES } from '../store/gameStore'

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

function WeaponHUD() {
  const { gunAmmo, laserCharges } = useGameStore()

  return (
    <div className="weapon-hud">
      {/* Gun ammo pips */}
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

      {/* Laser charge pips */}
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

export function GameCanvas() {
  const {
    status, joinQueue, leaveQueue, sendSnapshot, latestRemoteSnapshot,
    pendingRemoteWeaponEvent,
    micStatus, toggleMic,
  } = useNetworking()

  return (
    <>
      {/* ── Score HUD (bottom-left) ──────────────────────────────────────────── */}
      <ScoreHUD />

      {/* ── Weapon HUD (bottom-right) ────────────────────────────────────────── */}
      <WeaponHUD />

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
                <p className="matchmaking-tagline">SEARCHING FOR OPPONENT<span className="matchmaking-dots">...</span></p>
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

          {/* ── Physics world ────────────────────────────────────────────── */}
          <Suspense fallback={null}>
            <Physics gravity={[0, -30, 0]}>
              <Arena />
              <RobotEntity
                color="#4a8aaa"
                startPosition={[-3, 3, 0]}
                onSnapshot={sendSnapshot}
              />
              {status === 'matched' && (
                <RemoteRobotEntity
                  color="#aa4a4a"
                  latestSnapshot={latestRemoteSnapshot}
                  pendingWeaponEvent={pendingRemoteWeaponEvent}
                />
              )}
            </Physics>
          </Suspense>
        </Canvas>
      </GameErrorBoundary>
    </>
  )
}
