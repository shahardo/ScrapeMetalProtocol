import { Component, type ErrorInfo, type ReactNode, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Arena } from './Arena'
import { Robot } from './Robot'

// ── React Error Boundary ──────────────────────────────────────────────────────
// Wraps the entire Canvas so a renderer or physics crash never produces a
// white screen. Per the PDD: "The game must never white screen or freeze the
// browser. All systems must prioritize graceful exits."

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
    // In production this would ship to a logging service (e.g. Sentry)
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
            <button
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            >
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Canvas ────────────────────────────────────────────────────────────────────

/**
 * The main R3F canvas.
 *
 * Camera is positioned along the Z axis looking back at the 2D fighting plane,
 * mimicking the 2.5D side-scrolling perspective described in the PRD.
 *
 * Physics gravity is set to -30 (higher than real world) for snappy,
 * arcade-style feel. The robot's gravityScale multiplier adds additional
 * control over individual entity feel.
 */
export function GameCanvas() {
  return (
    <GameErrorBoundary>
      <Canvas
        shadows
        camera={{
          position: [0, 3, 14],
          fov: 45,
          near: 0.1,
          far: 200,
        }}
        style={{ background: '#080810', width: '100%', height: '100%' }}
      >
        {/* ── Lighting ───────────────────────────────────────────────────── */}
        <ambientLight intensity={0.3} />

        {/* Key light — main illumination from above-front */}
        <directionalLight
          position={[4, 12, 6]}
          intensity={1.8}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={12}
          shadow-camera-bottom={-4}
        />

        {/* Fill light — cool blue from the opposite side */}
        <pointLight position={[-6, 6, 4]} intensity={0.6} color="#002244" />

        {/* Rim light — gives metallic robots a dramatic edge highlight */}
        <pointLight position={[0, -1, 5]} intensity={0.4} color="#001133" />

        {/* ── Physics world ──────────────────────────────────────────────── */}
        {/* Suspense required by @react-three/rapier while WASM loads */}
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <Arena />
            <Robot color="#4a8aaa" startPosition={[-3, 3, 0]} />
          </Physics>
        </Suspense>
      </Canvas>
    </GameErrorBoundary>
  )
}
