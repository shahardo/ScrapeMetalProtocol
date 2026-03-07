import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  RigidBody,
  CuboidCollider,
  interactionGroups,
  type RapierRigidBody,
} from '@react-three/rapier'
import type { RobotSnapshot } from '../types/game'

// Group 1 = enemy robot — collides with player group 0 and arena groups 2+.
// Enemy parts don't collide with each other (same group).
const ENEMY_COLLISION_GROUPS = interactionGroups(
  1,
  [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
)

interface RemoteRobotEntityProps {
  color?: string
  /** Ref updated externally by useNetworking at ~20 Hz. Read each frame to drive position. */
  latestSnapshot: React.RefObject<RobotSnapshot | null>
}

/**
 * Kinematic representation of the opponent's robot.
 *
 * Driven entirely by network snapshots — no player input, no local physics solver.
 * Uses setNextKinematicTranslation/Rotation so Rapier generates correct contact
 * impulses (important for part-break collision detection on the local robot).
 *
 * Visual-only parts (head, arms) are rendered but not individually physics-tracked
 * here; the collision shape is a single chassis cuboid. Full part simulation of the
 * remote robot arrives in Sprint 7-8 when we sync part detachment state.
 */
export function RemoteRobotEntity({
  color = '#aa4a4a',
  latestSnapshot,
}: RemoteRobotEntityProps) {
  const chassisRef = useRef<RapierRigidBody>(null)

  useFrame(() => {
    const rb   = chassisRef.current
    const snap = latestSnapshot.current
    if (!rb || !snap) return

    rb.setNextKinematicTranslation({ x: snap.pos[0], y: snap.pos[1], z: snap.pos[2] })
    rb.setNextKinematicRotation({ x: snap.rot[0], y: snap.rot[1], z: snap.rot[2], w: snap.rot[3] })
  })

  return (
    <RigidBody
      ref={chassisRef}
      type="kinematicPosition"
      collisionGroups={ENEMY_COLLISION_GROUPS}
      restitution={0.2}
    >
      {/* Chassis */}
      <mesh castShadow>
        <boxGeometry args={[0.7, 1.0, 0.5]} />
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Left leg */}
      <mesh castShadow position={[-0.18, -0.65, 0]}>
        <boxGeometry args={[0.18, 0.3, 0.4]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Right leg */}
      <mesh castShadow position={[0.18, -0.65, 0]}>
        <boxGeometry args={[0.18, 0.3, 0.4]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, 0.74, 0]}>
        <boxGeometry args={[0.55, 0.38, 0.45]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Eye visor */}
      <mesh position={[0, 0.76, 0.23]}>
        <boxGeometry args={[0.3, 0.1, 0.01]} />
        <meshStandardMaterial color="#ff4444" emissive="#ff4444" emissiveIntensity={3} />
      </mesh>
      {/* Left arm */}
      <mesh castShadow position={[-0.54, 0.28, 0]}>
        <boxGeometry args={[0.26, 0.58, 0.42]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Right arm */}
      <mesh castShadow position={[0.54, 0.28, 0]}>
        <boxGeometry args={[0.26, 0.58, 0.42]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
      </mesh>
      <CuboidCollider args={[0.36, 0.65, 0.26]} />
    </RigidBody>
  )
}
