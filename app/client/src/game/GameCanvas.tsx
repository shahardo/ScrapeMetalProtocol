import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Arena } from './Arena'
import { RobotEntity } from './robot/RobotEntity'

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

// ── Canvas ────────────────────────────────────────────────────────────────────

export function GameCanvas() {
  return (
    <GameErrorBoundary>
      <Canvas
        shadows
        camera={{
          position: [0, 5.5, 14],
          fov: 45,
          near: 0.1,
          far: 200,
        }}
        style={{ background: '#1a2030', width: '100%', height: '100%' }}
      >
        <CameraController />

        {/* ── Lighting ─────────────────────────────────────────────────── */}
        <ambientLight intensity={0.7} />

        <directionalLight
          position={[4, 12, 6]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={12}
          shadow-camera-bottom={-4}
        />

        {/* Fill from opposite side — reduces harsh shadows */}
        <pointLight position={[-8, 8, 4]} intensity={1.0} color="#3a5080" />

        {/* Warm under-light for the floor surface */}
        <pointLight position={[0, 1, 3]} intensity={0.5} color="#806040" />

        {/* ── Physics world ────────────────────────────────────────────── */}
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <Arena />
            <RobotEntity color="#4a8aaa" startPosition={[-3, 3, 0]} />
          </Physics>
        </Suspense>
      </Canvas>
    </GameErrorBoundary>
  )
}
