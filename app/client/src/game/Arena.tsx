import { RigidBody } from '@react-three/rapier'

/**
 * Test arena with a painted concrete floor and raised platforms.
 * Dynamic hazards (cranes, falling scrap) arrive in Sprint 7-8 "Junkyard" arena.
 */
export function Arena() {
  return (
    <>
      {/* ── Main floor ─────────────────────────────────────────────────── */}
      <RigidBody type="fixed" name="ground" friction={1} restitution={0}>
        <mesh receiveShadow position={[0, -0.5, 0]}>
          <boxGeometry args={[24, 1, 4]} />
          <meshStandardMaterial color="#5c5248" metalness={0.2} roughness={0.85} />
        </mesh>
      </RigidBody>

      {/* ── Floor paint markings (non-physics, just visual) ─────────────── */}
      {/* Center dividing line */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.12, 0.01, 4]} />
        <meshStandardMaterial color="#f0a020" roughness={0.6} />
      </mesh>
      {/* Left zone boundary */}
      <mesh position={[-5, 0.01, 0]}>
        <boxGeometry args={[0.08, 0.01, 4]} />
        <meshStandardMaterial color="#e0d040" roughness={0.6} />
      </mesh>
      {/* Right zone boundary */}
      <mesh position={[5, 0.01, 0]}>
        <boxGeometry args={[0.08, 0.01, 4]} />
        <meshStandardMaterial color="#e0d040" roughness={0.6} />
      </mesh>
      {/* Left outer edge stripe */}
      <mesh position={[-11, 0.01, 0]}>
        <boxGeometry args={[0.2, 0.01, 4]} />
        <meshStandardMaterial color="#c03030" roughness={0.6} />
      </mesh>
      {/* Right outer edge stripe */}
      <mesh position={[11, 0.01, 0]}>
        <boxGeometry args={[0.2, 0.01, 4]} />
        <meshStandardMaterial color="#c03030" roughness={0.6} />
      </mesh>

      {/* ── Left platform ──────────────────────────────────────────────── */}
      <RigidBody type="fixed" name="platform-left" friction={1} restitution={0}>
        <mesh receiveShadow position={[-5, 2, 0]}>
          <boxGeometry args={[4, 0.3, 4]} />
          <meshStandardMaterial color="#4a5060" metalness={0.4} roughness={0.7} />
        </mesh>
      </RigidBody>
      {/* Platform left surface stripe */}
      <mesh position={[-5, 2.16, 0]}>
        <boxGeometry args={[3.8, 0.01, 0.12]} />
        <meshStandardMaterial color="#f0a020" roughness={0.5} />
      </mesh>

      {/* ── Right platform (higher) ─────────────────────────────────────── */}
      <RigidBody type="fixed" name="platform-right" friction={1} restitution={0}>
        <mesh receiveShadow position={[5, 3.5, 0]}>
          <boxGeometry args={[4, 0.3, 4]} />
          <meshStandardMaterial color="#4a5060" metalness={0.4} roughness={0.7} />
        </mesh>
      </RigidBody>
      {/* Platform right surface stripe */}
      <mesh position={[5, 3.66, 0]}>
        <boxGeometry args={[3.8, 0.01, 0.12]} />
        <meshStandardMaterial color="#f0a020" roughness={0.5} />
      </mesh>

      {/* ── Arena boundary walls (invisible) ─────────────────────────────── */}
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

      {/* ── Background wall ──────────────────────────────────────────────── */}
      <mesh position={[0, 5, -3]} receiveShadow>
        <planeGeometry args={[32, 18]} />
        <meshStandardMaterial color="#2e3a4e" roughness={1} />
      </mesh>
      {/* Background accent panels */}
      <mesh position={[-8, 5, -2.9]}>
        <planeGeometry args={[6, 12]} />
        <meshStandardMaterial color="#263040" roughness={1} />
      </mesh>
      <mesh position={[8, 5, -2.9]}>
        <planeGeometry args={[6, 12]} />
        <meshStandardMaterial color="#263040" roughness={1} />
      </mesh>
    </>
  )
}
