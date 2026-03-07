import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier'
import { useControls } from './useControls'

// ── Movement constants ────────────────────────────────────────────────────────
const WALK_SPEED = 6      // horizontal velocity in m/s
const JUMP_IMPULSE = 10   // vertical impulse applied on jump

interface RobotProps {
  color?: string
  startPosition?: [number, number, number]
}

/**
 * The player-controlled robot.
 *
 * Physics design:
 *  - Constrained to the 2D fighting plane by locking Z translation and all
 *    rotations. This is enforced by resetting Z every frame rather than via
 *    Rapier's enabledTranslations flag, which can be tricky with compound
 *    colliders in @react-three/rapier v1.x.
 *  - Horizontal movement is applied as a direct velocity override rather than
 *    forces/impulses so the robot feels tight and responsive, not floaty.
 *  - Jumping uses an impulse so it interacts naturally with gravity.
 *  - Ground detection counts active collision contacts. A robot can only jump
 *    when groundContacts > 0, preventing double-jumps.
 */
export function Robot({ color = '#5a8a9a', startPosition = [0, 2, 0] }: RobotProps) {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const controls = useControls()

  // Count active ground contacts to gate jumping (handles multi-contact edges)
  const groundContacts = useRef(0)
  // Prevent holding Space from firing multiple jumps
  const jumpConsumed = useRef(false)

  useFrame(() => {
    const rb = rigidBodyRef.current
    if (!rb) return

    const vel = rb.linvel()
    const pos = rb.translation()

    // ── 2D plane enforcement ────────────────────────────────────────────────
    // Keep the robot on Z = 0 every frame. Doing it here rather than via
    // Rapier's axis locks because compound collider bodies can drift slightly.
    if (Math.abs(pos.z) > 0.01) {
      rb.setTranslation({ x: pos.x, y: pos.y, z: 0 }, true)
      rb.setLinvel({ x: vel.x, y: vel.y, z: 0 }, true)
    }

    // ── Horizontal movement ─────────────────────────────────────────────────
    let targetVelX = 0
    if (controls.current.left) targetVelX -= WALK_SPEED
    if (controls.current.right) targetVelX += WALK_SPEED

    // Override X velocity directly — gives arcade-style instant response
    rb.setLinvel({ x: targetVelX, y: vel.y, z: 0 }, true)

    // ── Jumping ─────────────────────────────────────────────────────────────
    const isGrounded = groundContacts.current > 0

    if (controls.current.jump && isGrounded && !jumpConsumed.current) {
      rb.applyImpulse({ x: 0, y: JUMP_IMPULSE, z: 0 }, true)
      jumpConsumed.current = true
    }

    // Reset the latch when the player releases the jump key
    if (!controls.current.jump) {
      jumpConsumed.current = false
    }
  })

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={startPosition}
      gravityScale={2.5}   // heavier-feeling gravity for snappy platformer feel
      friction={0}         // friction is handled by velocity overrides, not physics friction
      restitution={0}      // robots don't bounce
      linearDamping={0}
      angularDamping={999} // prevent any angular drift; robot stays upright
      onCollisionEnter={() => {
        groundContacts.current++
      }}
      onCollisionExit={() => {
        groundContacts.current = Math.max(0, groundContacts.current - 1)
      }}
    >
      {/* ── Chassis ──────────────────────────────────────────────────────── */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.7, 1.0, 0.5]} />
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.25} />
      </mesh>

      {/* ── Head ─────────────────────────────────────────────────────────── */}
      <mesh castShadow position={[0, 0.8, 0]}>
        <boxGeometry args={[0.55, 0.38, 0.45]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.2} />
      </mesh>

      {/* ── Visor (emissive glow) ─────────────────────────────────────────── */}
      <mesh position={[0, 0.82, 0.23]}>
        <boxGeometry args={[0.32, 0.1, 0.01]} />
        <meshStandardMaterial
          color="#00ffff"
          emissive="#00ffff"
          emissiveIntensity={3}
        />
      </mesh>

      {/* ── Shoulder pads ────────────────────────────────────────────────── */}
      <mesh castShadow position={[-0.47, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.18, 0.45]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0.47, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.18, 0.45]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
      </mesh>

      {/* ── Single compound collider for the full robot body ─────────────── */}
      <CuboidCollider args={[0.37, 0.7, 0.27]} position={[0, 0, 0]} />
    </RigidBody>
  )
}
