import { useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  RigidBody,
  CuboidCollider,
  useFixedJoint,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useControls } from '../useControls'

// ── Movement constants (same as the placeholder Robot.tsx) ────────────────────
const WALK_SPEED = 6
const JUMP_IMPULSE = 10

// ── Break-force thresholds (Newtons) ─────────────────────────────────────────
// Calibrated so normal landing impacts don't snap parts, but a hard hit does.
// Head is the most fragile; arms are tougher.
const BREAK_FORCE = {
  head: 500,
  'arm-left': 750,
  'arm-right': 750,
} as const

type AttachedPartId = keyof typeof BREAK_FORCE

// ── PartWithJoint ─────────────────────────────────────────────────────────────
// Renders one physics body and wires it to the chassis via a FixedJoint.
// When contact force exceeds breakForce the joint is removed from the world
// and the part becomes a free-flying physics object.

interface PartWithJointProps {
  chassisRef: RefObject<RapierRigidBody | null>
  /** Anchor point on the chassis body in chassis local space. */
  anchorOnChassis: [number, number, number]
  /** Anchor point on this part's body in part local space. */
  anchorOnPart: [number, number, number]
  /** World-space spawn position — must match chassis pos + offset at start. */
  spawnPosition: [number, number, number]
  breakForce: number
  colliderHalfExtents: [number, number, number]
  children: React.ReactNode
}

function PartWithJoint({
  chassisRef,
  anchorOnChassis,
  anchorOnPart,
  spawnPosition,
  breakForce,
  colliderHalfExtents,
  children,
}: PartWithJointProps) {
  const partRef = useRef<RapierRigidBody>(null)
  const { world } = useRapier()
  const [isDetached, setIsDetached] = useState(false)

  // Fixed joint keeps the part rigidly attached to the chassis.
  // Identity quaternions [0,0,0,1] mean no relative rotation between frames.
  const joint = useFixedJoint(chassisRef, partRef, [
    anchorOnChassis,
    [0, 0, 0, 1],
    anchorOnPart,
    [0, 0, 0, 1],
  ])

  return (
    <RigidBody
      ref={partRef}
      position={spawnPosition}
      gravityScale={2.5}
      restitution={0.2}
      linearDamping={0}
      angularDamping={isDetached ? 1 : 999}
      onContactForce={({ totalForceMagnitude }) => {
        // Only attempt to break the joint once; joint.current is undefined
        // after the first removal so this guard also prevents double-calls.
        if (isDetached || !joint.current) return
        if (totalForceMagnitude > breakForce) {
          world.removeImpulseJoint(joint.current, true)
          setIsDetached(true)
        }
      }}
    >
      {children}
      <CuboidCollider args={colliderHalfExtents} />
    </RigidBody>
  )
}

// ── RobotEntity ───────────────────────────────────────────────────────────────

interface RobotEntityProps {
  color?: string
  startPosition?: [number, number, number]
}

/**
 * Modular robot assembled from independent physics bodies joined at runtime.
 *
 * Hierarchy:
 *   Chassis  ← player controlled, drives movement
 *     ├─ Head      (FixedJoint, breaks at ~500 N)
 *     ├─ Arm-Left  (FixedJoint, breaks at ~750 N)
 *     └─ Arm-Right (FixedJoint, breaks at ~750 N)
 *
 * Part detachment: the joint is severed via world.removeImpulseJoint() when
 * onContactForce fires above a threshold. The detached body then falls freely
 * under gravity with a bit of angular damping so it tumbles naturally.
 *
 * Sprint 5-6 will add a second robot, input relay, and hit registration
 * over WebRTC. Sprint 7-8 adds the Garage so players can configure these parts.
 */
export function RobotEntity({
  color = '#4a8aaa',
  startPosition = [0, 2, 0],
}: RobotEntityProps) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const controls = useControls()

  const groundContacts = useRef(0)
  const jumpConsumed = useRef(false)

  const [sx, sy, sz] = startPosition

  useFrame(() => {
    const rb = chassisRef.current
    if (!rb) return

    const vel = rb.linvel()
    const pos = rb.translation()

    // ── 2D plane enforcement (chassis only; detached parts drift freely) ──
    if (Math.abs(pos.z) > 0.01) {
      rb.setTranslation({ x: pos.x, y: pos.y, z: 0 }, true)
      rb.setLinvel({ x: vel.x, y: vel.y, z: 0 }, true)
    }

    // ── Horizontal movement ───────────────────────────────────────────────
    let targetVelX = 0
    if (controls.current.left) targetVelX -= WALK_SPEED
    if (controls.current.right) targetVelX += WALK_SPEED
    rb.setLinvel({ x: targetVelX, y: vel.y, z: 0 }, true)

    // ── Jumping ───────────────────────────────────────────────────────────
    if (controls.current.jump && groundContacts.current > 0 && !jumpConsumed.current) {
      rb.applyImpulse({ x: 0, y: JUMP_IMPULSE, z: 0 }, true)
      jumpConsumed.current = true
    }
    if (!controls.current.jump) jumpConsumed.current = false
  })

  return (
    <>
      {/* ── Chassis ─────────────────────────────────────────────────────── */}
      <RigidBody
        ref={chassisRef}
        position={startPosition}
        gravityScale={2.5}
        friction={0}
        restitution={0}
        linearDamping={0}
        angularDamping={999}
        onCollisionEnter={() => { groundContacts.current++ }}
        onCollisionExit={() => { groundContacts.current = Math.max(0, groundContacts.current - 1) }}
      >
        <mesh castShadow>
          <boxGeometry args={[0.7, 1.0, 0.5]} />
          <meshStandardMaterial color={color} metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Leg stumps — visual only, part of chassis collider */}
        <mesh castShadow position={[-0.18, -0.65, 0]}>
          <boxGeometry args={[0.18, 0.3, 0.4]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0.18, -0.65, 0]}>
          <boxGeometry args={[0.18, 0.3, 0.4]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
        </mesh>
        <CuboidCollider args={[0.36, 0.65, 0.26]} />
      </RigidBody>

      {/* ── Head ────────────────────────────────────────────────────────── */}
      {/* anchorOnChassis: top-center of chassis local space               */}
      {/* anchorOnPart:    bottom-center of head local space               */}
      <PartWithJoint
        chassisRef={chassisRef}
        anchorOnChassis={[0, 0.52, 0]}
        anchorOnPart={[0, -0.22, 0]}
        spawnPosition={[sx, sy + 0.74, sz]}
        breakForce={BREAK_FORCE.head}
        colliderHalfExtents={[0.28, 0.2, 0.24]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.55, 0.38, 0.45]} />
          <meshStandardMaterial color={color} metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Visor */}
        <mesh position={[0, 0.02, 0.23]}>
          <boxGeometry args={[0.3, 0.1, 0.01]} />
          <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={3} />
        </mesh>
      </PartWithJoint>

      {/* ── Left arm ────────────────────────────────────────────────────── */}
      {/* anchorOnChassis: left shoulder of chassis                        */}
      {/* anchorOnPart:    right side (inner) of arm                       */}
      <PartWithJoint
        chassisRef={chassisRef}
        anchorOnChassis={[-0.38, 0.28, 0]}
        anchorOnPart={[0.16, 0, 0]}
        spawnPosition={[sx - 0.54, sy + 0.28, sz]}
        breakForce={BREAK_FORCE['arm-left']}
        colliderHalfExtents={[0.14, 0.3, 0.22]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.58, 0.42]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Fist */}
        <mesh castShadow position={[0, -0.38, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.36]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.4} />
        </mesh>
      </PartWithJoint>

      {/* ── Right arm ───────────────────────────────────────────────────── */}
      <PartWithJoint
        chassisRef={chassisRef}
        anchorOnChassis={[0.38, 0.28, 0]}
        anchorOnPart={[-0.16, 0, 0]}
        spawnPosition={[sx + 0.54, sy + 0.28, sz]}
        breakForce={BREAK_FORCE['arm-right']}
        colliderHalfExtents={[0.14, 0.3, 0.22]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.58, 0.42]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Fist */}
        <mesh castShadow position={[0, -0.38, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.36]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.4} />
        </mesh>
      </PartWithJoint>
    </>
  )
}
