import { RigidBody } from '@react-three/rapier'

/**
 * Sprint 1-2 test arena: a flat gray-box environment with a main floor and
 * two raised platforms. No dynamic hazards yet (those land in Sprint 7-8
 * as "The Junkyard" arena).
 */
export function Arena() {
  return (
    <>
      {/* ── Main floor ─────────────────────────────────────────────────── */}
      <RigidBody type="fixed" name="ground" friction={1} restitution={0}>
        <mesh receiveShadow position={[0, -0.5, 0]}>
          <boxGeometry args={[24, 1, 4]} />
          <meshStandardMaterial color="#1e1e22" metalness={0.6} roughness={0.6} />
        </mesh>
      </RigidBody>

      {/* ── Left platform ──────────────────────────────────────────────── */}
      <RigidBody type="fixed" name="platform-left" friction={1} restitution={0}>
        <mesh receiveShadow position={[-5, 2, 0]}>
          <boxGeometry args={[4, 0.3, 4]} />
          <meshStandardMaterial color="#2a2a30" metalness={0.5} roughness={0.5} />
        </mesh>
      </RigidBody>

      {/* ── Right platform (higher) ─────────────────────────────────────── */}
      <RigidBody type="fixed" name="platform-right" friction={1} restitution={0}>
        <mesh receiveShadow position={[5, 3.5, 0]}>
          <boxGeometry args={[4, 0.3, 4]} />
          <meshStandardMaterial color="#2a2a30" metalness={0.5} roughness={0.5} />
        </mesh>
      </RigidBody>

      {/* ── Arena boundary walls (invisible, prevent falling off screen) ── */}
      <RigidBody type="fixed" name="wall-left">
        <mesh position={[-12, 4, 0]} visible={false}>
          <boxGeometry args={[0.5, 16, 4]} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" name="wall-right">
        <mesh position={[12, 4, 0]} visible={false}>
          <boxGeometry args={[0.5, 16, 4]} />
        </mesh>
      </RigidBody>

      {/* ── Background atmosphere ───────────────────────────────────────── */}
      {/* Far-plane decorative panel — not a physics body */}
      <mesh position={[0, 4, -3]} receiveShadow>
        <planeGeometry args={[30, 16]} />
        <meshStandardMaterial color="#0d0d12" roughness={1} />
      </mesh>
    </>
  )
}
