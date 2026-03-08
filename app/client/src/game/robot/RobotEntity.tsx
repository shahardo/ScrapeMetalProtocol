import { useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  RigidBody,
  CuboidCollider,
  interactionGroups,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useControls } from '../useControls'
import { WeaponSystem, type WeaponEvent } from '../weapons/WeaponSystem'
import type { RobotSnapshot } from '../../types/game'

// ── Movement constants ────────────────────────────────────────────────────────
const WALK_SPEED   = 5    // m/s
const ROT_SPEED    = 2.5  // radians/s
const JUMP_IMPULSE = 10

// ── Break-force thresholds (N) ────────────────────────────────────────────────
const BREAK_FORCE = {
  head:       1800,
  'arm-left':  2500,
  'arm-right': 2500,
} as const

// Arena body names — contacts with these must never trigger a joint break.
const ARENA_NAMES = new Set([
  'ground', 'platform-left', 'platform-right',
  'wall-left', 'wall-right', 'wall-front', 'wall-back',
])

// Collision group for this player's own robot parts.
// Group 0 = player 1 parts; they never collide with each other.
// Enemy robot will use group 1 (Sprint 5-6).
const PLAYER_COLLISION_GROUPS = interactionGroups(
  0,
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
)

// ── Quaternion vector rotation ────────────────────────────────────────────────
// Rotates vector v by quaternion q using the formula:
//   v' = v + 2w(q.xyz × v) + 2(q.xyz × (q.xyz × v))
// Used to transform a local-space offset into world space each frame.
// Exported for unit testing.
export function rotateByQuat(
  v: [number, number, number],
  q: { x: number; y: number; z: number; w: number },
): [number, number, number] {
  const { x: qx, y: qy, z: qz, w: qw } = q
  const [vx, vy, vz] = v
  const cx = qy * vz - qz * vy
  const cy = qz * vx - qx * vz
  const cz = qx * vy - qy * vx
  return [
    vx + 2 * qw * cx + 2 * (qy * cz - qz * cy),
    vy + 2 * qw * cy + 2 * (qz * cx - qx * cz),
    vz + 2 * qw * cz + 2 * (qx * cy - qy * cx),
  ]
}

// ── PartWithJoint ─────────────────────────────────────────────────────────────
// Attachment strategy: instead of using a Rapier impulse joint (which is a soft
// constraint and springs/oscillates), we kinematically drive the part's
// position and rotation each frame to exactly match the chassis transform +
// the local offset. This gives a perfectly rigid attachment with zero wiggle.
// onContactForce is still used for break detection — when struck by an enemy
// robot it will fire, and if the force exceeds the threshold we stop driving
// the part and let physics (gravity, impulse) take over.

interface PartWithJointProps {
  chassisRef: RefObject<RapierRigidBody | null>
  /** Part center offset from chassis center in chassis LOCAL space. */
  localOffset: [number, number, number]
  spawnPosition: [number, number, number]
  breakForce: number
  colliderHalfExtents: [number, number, number]
  children: React.ReactNode
}

function PartWithJoint({
  chassisRef,
  localOffset,
  spawnPosition,
  breakForce,
  colliderHalfExtents,
  children,
}: PartWithJointProps) {
  const partRef = useRef<RapierRigidBody>(null)
  const [isDetached, setIsDetached] = useState(false)

  useFrame(() => {
    if (isDetached) return
    const chassis = chassisRef.current
    const part    = partRef.current
    if (!chassis || !part) return

    const chassisPos = chassis.translation()
    const chassisRot = chassis.rotation()
    const chassisVel = chassis.linvel()

    // Rotate the local offset by the chassis quaternion to get world offset.
    const [ox, oy, oz] = rotateByQuat(localOffset, chassisRot)

    // Stamp part's transform exactly onto the chassis — no solver, no spring.
    part.setTranslation({ x: chassisPos.x + ox, y: chassisPos.y + oy, z: chassisPos.z + oz }, true)
    part.setRotation(chassisRot, true)
    part.setLinvel(chassisVel, true)
    part.setAngvel({ x: 0, y: 0, z: 0 }, true)
  })

  return (
    <RigidBody
      ref={partRef}
      position={spawnPosition}
      // No gravity while attached — we own the transform; letting gravity
      // accumulate would fight our setTranslation calls for no benefit.
      gravityScale={isDetached ? 2.5 : 0}
      collisionGroups={PLAYER_COLLISION_GROUPS}
      restitution={0.2}
      linearDamping={0}
      angularDamping={isDetached ? 1.5 : 999}
      onContactForce={({ other, totalForceMagnitude }) => {
        if (isDetached) return
        const otherName = other.rigidBodyObject?.name ?? ''
        if (ARENA_NAMES.has(otherName)) return
        if (totalForceMagnitude > breakForce) {
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
  /** Called at ~20 Hz with the chassis physics state; used to send snapshots over WebRTC. */
  onSnapshot?: (snap: RobotSnapshot) => void
}

/**
 * Player-controlled modular robot.
 *
 * Controls: W/S = walk  |  A/D = rotate  |  Space = jump
 *
 * Part attachment uses kinematic frame-stamping (see PartWithJoint above)
 * rather than Rapier impulse joints, which oscillate. Parts break when struck
 * by an enemy robot hard enough (onContactForce > threshold).
 */
export function RobotEntity({
  color = '#4a8aaa',
  startPosition = [0, 2, 0],
  onSnapshot,
}: RobotEntityProps) {
  const chassisRef = useRef<RapierRigidBody>(null)
  const controls   = useControls()

  const facingAngle          = useRef(0)
  const groundContacts       = useRef(0)
  const jumpConsumed         = useRef(false)
  const snapshotTimer        = useRef(0)
  // Stores the last weapon fired this snapshot window; cleared after transmission.
  const pendingWeaponEvent   = useRef<WeaponEvent | null>(null)

  const [sx, sy, sz] = startPosition

  useFrame((_, delta) => {
    const rb = chassisRef.current
    if (!rb) return
    const c = controls.current
    if (!c) return

    // ── Rotation ─────────────────────────────────────────────────────────
    if (c.left)  facingAngle.current += ROT_SPEED * delta
    if (c.right) facingAngle.current -= ROT_SPEED * delta

    const half = facingAngle.current / 2
    rb.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true)

    // ── Walk ─────────────────────────────────────────────────────────────
    const fwd = c.backward ? WALK_SPEED : c.forward ? -WALK_SPEED : 0
    const vel = rb.linvel()
    rb.setLinvel({
      x: -Math.sin(facingAngle.current) * fwd,
      y: vel.y,
      z: -Math.cos(facingAngle.current) * fwd,
    }, true)

    // ── Jump ─────────────────────────────────────────────────────────────
    if (c.jump && groundContacts.current > 0 && !jumpConsumed.current) {
      rb.applyImpulse({ x: 0, y: JUMP_IMPULSE, z: 0 }, true)
      jumpConsumed.current = true
    }
    if (!c.jump) jumpConsumed.current = false

    // ── Snapshot broadcast (~20 Hz) ───────────────────────────────────────
    if (onSnapshot) {
      snapshotTimer.current += delta
      if (snapshotTimer.current >= 0.05) {
        snapshotTimer.current = 0
        const t = rb.translation()
        const r = rb.rotation()
        const v = rb.linvel()
        const snap: RobotSnapshot = {
          tick: Date.now(),
          pos: [t.x, t.y, t.z],
          rot: [r.x, r.y, r.z, r.w],
          vel: [v.x, v.y, v.z],
        }
        if (pendingWeaponEvent.current) {
          snap.weaponFired = pendingWeaponEvent.current
          pendingWeaponEvent.current = null
        }
        onSnapshot(snap)
      }
    }
  })

  return (
    <>
      {/* ── Chassis ─────────────────────────────────────────────────────── */}
      <RigidBody
        ref={chassisRef}
        name="player"
        position={startPosition}
        gravityScale={2.5}
        collisionGroups={PLAYER_COLLISION_GROUPS}
        friction={0.8}
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

      {/* ── Head — offset [0, 0.74, 0] from chassis center ──────────────── */}
      <PartWithJoint
        chassisRef={chassisRef}
        localOffset={[0, 0.74, 0]}
        spawnPosition={[sx, sy + 0.74, sz]}
        breakForce={BREAK_FORCE.head}
        colliderHalfExtents={[0.28, 0.2, 0.24]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.55, 0.38, 0.45]} />
          <meshStandardMaterial color={color} metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.02, 0.23]}>
          <boxGeometry args={[0.3, 0.1, 0.01]} />
          <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={3} />
        </mesh>
      </PartWithJoint>

      {/* ── Left arm — offset [-0.54, 0.28, 0] from chassis center ─────── */}
      <PartWithJoint
        chassisRef={chassisRef}
        localOffset={[-0.54, 0.28, 0]}
        spawnPosition={[sx - 0.54, sy + 0.28, sz]}
        breakForce={BREAK_FORCE['arm-left']}
        colliderHalfExtents={[0.14, 0.3, 0.22]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.58, 0.42]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, -0.38, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.36]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.4} />
        </mesh>
      </PartWithJoint>

      {/* ── Right arm — offset [0.54, 0.28, 0] from chassis center ──────── */}
      <PartWithJoint
        chassisRef={chassisRef}
        localOffset={[0.54, 0.28, 0]}
        spawnPosition={[sx + 0.54, sy + 0.28, sz]}
        breakForce={BREAK_FORCE['arm-right']}
        colliderHalfExtents={[0.14, 0.3, 0.22]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.58, 0.42]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, -0.38, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.36]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.4} />
        </mesh>
      </PartWithJoint>

      {/* ── Weapons ──────────────────────────────────────────────────────── */}
      <WeaponSystem
        chassisRef={chassisRef}
        facingAngleRef={facingAngle}
        controls={controls}
        onWeaponFired={(event) => { pendingWeaponEvent.current = event }}
      />
    </>
  )
}
