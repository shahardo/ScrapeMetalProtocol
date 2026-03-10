import { useRef, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  RigidBody,
  CuboidCollider,
  interactionGroups,
  type RapierRigidBody,
} from '@react-three/rapier'
import type { RobotSnapshot } from '../types/game'
import { SparkBurst, makeSparkBurst, type SparkBurstData } from './weapons/WeaponSystem'
import { useGameStore } from '../store/gameStore'
import type React from 'react'

// ── Constants ──────────────────────────────────────────────────────────────────

const LASER_DISPLAY_MS = 0.22 * 1000  // ms
const BULLET_TTL       = 3.5          // seconds — same as local Bullet

// Remote bullets fired FROM the enemy robot should collide with the local player
// (group 0) and arena (groups 2+), but not with the enemy robot itself (group 1).
const REMOTE_BULLET_GROUPS = interactionGroups(1, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

// Group 1 = enemy robot — collides with player group 0 and arena groups 2+.
const ENEMY_COLLISION_GROUPS = interactionGroups(1, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

// ── RemoteBullet ───────────────────────────────────────────────────────────────
// Physics bullet matching the local Bullet component: same collision group,
// same gravity, same CCD. Stops on impact with local robot or arena.

interface RemoteBulletData {
  id: number
  spawnPos: [number, number, number]
  velocity: [number, number, number]
}

interface RemoteBulletProps extends RemoteBulletData {
  onExpire: (id: number) => void
}

function RemoteBullet({ id, spawnPos, velocity, onExpire }: RemoteBulletProps) {
  const rbRef          = useRef<RapierRigidBody>(null)
  const ageRef         = useRef(0)
  const liveRef        = useRef(false)   // grace period: ignore collisions for 80 ms
  const initializedRef = useRef(false)
  const expiredRef     = useRef(false)

  const safeExpire = useCallback(() => {
    if (expiredRef.current) return
    expiredRef.current = true
    onExpire(id)
  }, [id, onExpire])

  useFrame((_, delta) => {
    if (expiredRef.current) return

    if (!initializedRef.current && rbRef.current) {
      initializedRef.current = true
      rbRef.current.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true)
    }

    ageRef.current += delta
    if (!liveRef.current && ageRef.current > 0.08) liveRef.current = true
    if (ageRef.current > BULLET_TTL) safeExpire()
  })

  return (
    <RigidBody
      ref={rbRef}
      position={spawnPos}
      collisionGroups={REMOTE_BULLET_GROUPS}
      gravityScale={0.3}
      ccd={true}
      restitution={0.1}
      linearDamping={0}
      onCollisionEnter={() => {
        if (liveRef.current) safeExpire()
      }}
    >
      <mesh>
        <boxGeometry args={[0.14, 0.14, 0.26]} />
        <meshStandardMaterial color="#ffaa00" emissive="#ff6600" emissiveIntensity={4} metalness={0.9} roughness={0.1} />
      </mesh>
      <CuboidCollider args={[0.07, 0.07, 0.13]} />
    </RigidBody>
  )
}

// ── LaserEffect ────────────────────────────────────────────────────────────────

interface LaserEffectData {
  origin: [number, number, number]
  dir:    [number, number, number]
  dist:   number
  angleY: number
  expiresAt: number
}

// ── RemoteRobotEntity ──────────────────────────────────────────────────────────

interface RemoteRobotEntityProps {
  color?: string
  latestSnapshot: React.RefObject<RobotSnapshot | null>
  /** Dedicated weapon-event ref — set by network layer, cleared here after consumption. */
  pendingWeaponEvent: React.MutableRefObject<NonNullable<RobotSnapshot['weaponFired']> | null>
  /** Hit-confirmation ref — set by network layer when shooter confirms a hit.
   *  Used to render sparks + damage popup on the defender's screen. */
  pendingWeaponHit: React.MutableRefObject<NonNullable<RobotSnapshot['weaponHit']> | null>
}

export function RemoteRobotEntity({
  color = '#aa4a4a',
  latestSnapshot,
  pendingWeaponEvent,
  pendingWeaponHit,
}: RemoteRobotEntityProps) {
  const chassisRef     = useRef<RapierRigidBody>(null)
  const bulletIdRef    = useRef(0)
  const laserExpiresAt = useRef(0)

  const [remoteBullets, setRemoteBullets] = useState<RemoteBulletData[]>([])
  const [laserEffect,   setLaserEffect]   = useState<LaserEffectData | null>(null)
  const [sparkBursts,   setSparkBursts]   = useState<SparkBurstData[]>([])

  const addDamagePopup      = useGameStore((s) => s.addDamagePopup)
  const damagePlayerChassis = useGameStore((s) => s.damagePlayerChassis)

  const expireBullet = useCallback((id: number) => {
    setRemoteBullets((prev) => prev.filter((b) => b.id !== id))
  }, [])

  useFrame(() => {
    const rb   = chassisRef.current
    const snap = latestSnapshot.current
    if (!rb || !snap) return

    rb.setNextKinematicTranslation({ x: snap.pos[0], y: snap.pos[1], z: snap.pos[2] })
    rb.setNextKinematicRotation({ x: snap.rot[0], y: snap.rot[1], z: snap.rot[2], w: snap.rot[3] })

    // Consume hit-confirmation: show sparks + damage popup on this screen too.
    const whit = pendingWeaponHit.current
    if (whit) {
      pendingWeaponHit.current = null
      const burst = makeSparkBurst(whit.hitPos)
      setSparkBursts((prev) => [...prev, burst])
      addDamagePopup(whit.damage, whit.hitPos)
      damagePlayerChassis(whit.damage)
    }

    // Consume weapon event.
    const wev = pendingWeaponEvent.current
    if (wev) {
      pendingWeaponEvent.current = null
      const { type, origin, dir } = wev
      if (type === 'gun') {
        const id = ++bulletIdRef.current
        setRemoteBullets((prev) => [
          ...prev,
          {
            id,
            spawnPos: origin,
            // Same initial velocity as local Bullet
            velocity: [dir[0] * 18, 0.5, dir[2] * 18],
          },
        ])
      } else {
        const dist      = wev.dist ?? 15   // use actual hit distance sent by shooter
        const angleY    = Math.atan2(dir[0], dir[2])
        const expiresAt = performance.now() + LASER_DISPLAY_MS
        laserExpiresAt.current = expiresAt
        setLaserEffect({ origin, dir, dist, angleY, expiresAt })
      }
    }

    // Clear expired laser
    if (laserExpiresAt.current > 0 && performance.now() > laserExpiresAt.current) {
      laserExpiresAt.current = 0
      setLaserEffect(null)
    }
  })

  return (
    <>
    <RigidBody
      ref={chassisRef}
      name="enemy"
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

    {/* ── Remote bullets (physics, stops on impact) ─────────────────────────── */}
    {remoteBullets.map((b) => (
      <RemoteBullet key={b.id} {...b} onExpire={expireBullet} />
    ))}

    {/* ── Spark bursts from confirmed hits (visible on defender's screen) ────── */}
    {sparkBursts.map((burst) => (
      <SparkBurst
        key={burst.id}
        data={burst}
        onExpired={(id) => setSparkBursts((prev) => prev.filter((s) => s.id !== id))}
      />
    ))}

    {/* ── Remote laser beam ─────────────────────────────────────────────────── */}
    {laserEffect && (
      <>
        <mesh
          position={[
            laserEffect.origin[0] + laserEffect.dir[0] * laserEffect.dist / 2,
            laserEffect.origin[1] + laserEffect.dir[1] * laserEffect.dist / 2,
            laserEffect.origin[2] + laserEffect.dir[2] * laserEffect.dist / 2,
          ]}
          rotation={[0, laserEffect.angleY, 0]}
        >
          <boxGeometry args={[0.08, 0.08, laserEffect.dist]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={10} transparent opacity={0.95} />
        </mesh>
        <mesh position={laserEffect.origin}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={12} transparent opacity={0.85} />
        </mesh>
        <pointLight position={laserEffect.origin} color="#ff2200" intensity={6} distance={4} />
      </>
    )}
    </>
  )
}
