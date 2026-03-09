import { useRef, useState, useCallback, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import {
  RigidBody,
  CuboidCollider,
  interactionGroups,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { rotateByQuat } from '../robot/RobotEntity'
import { useGameStore, GUN_MAX_AMMO, LASER_MAX_CHARGES } from '../../store/gameStore'
import { playGunShot, playLaserShot, playHitConfirm } from './sounds'
import type { Controls } from '../useControls'
import type { WeaponType } from '../../types/game'

// ── Spark particle constants ──────────────────────────────────────────────────

const SPARK_COUNT = 10
const SPARK_TTL   = 0.45   // seconds
// Each spark gets a random launch speed in this range (m/s)
const SPARK_SPEED_MIN = 2.5
const SPARK_SPEED_MAX = 6.0

// ── Weapon constants ──────────────────────────────────────────────────────────

const GUN_COOLDOWN       = 0.7    // seconds between shots
const LASER_COOLDOWN     = 1.5    // seconds between laser pulses
const BULLET_SPEED       = 18     // m/s
const BULLET_TTL         = 3.5    // seconds before auto-despawn
const GUN_DAMAGE         = 25     // damage per bullet hit
const LASER_DAMAGE       = 40     // damage per laser hit
const LASER_RANGE        = 15     // maximum raycast distance (metres)
const LASER_DISPLAY      = 0.22   // seconds the beam stays visible

// Ammo recharge rates
const GUN_RELOAD_RATE    = 2.5    // seconds per bullet reloaded
const LASER_RECHARGE_RATE = 3.0  // seconds per charge regenerated

// Local-space emitter offsets from chassis center
const GUN_BARREL:    [number, number, number] = [ 0.6, 0.15, 0]  // right arm
const LASER_EMITTER: [number, number, number] = [-0.6, 0.15, 0]  // left arm

// Bullets use player's own group (0) so they don't hit the firing robot's parts.
// Arena bodies (default all-groups) and enemy group-1 bodies are still hit.
const BULLET_GROUPS = interactionGroups(
  0,
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
)

// ── Internal types ────────────────────────────────────────────────────────────

interface BulletData {
  id: string
  spawnPos: [number, number, number]
  velocity: [number, number, number]
}

interface LaserBeamState {
  midPos: [number, number, number]
  length: number
  angleY: number
  expiresAt: number   // performance.now() timestamp
  hitEnemy: boolean
}

interface MuzzleFlash {
  pos: [number, number, number]
  expiresAt: number
  type: WeaponType
}

export interface SparkBurstData {
  id: string
  position: [number, number, number]
  /** Pre-computed per-spark velocities [vx, vy, vz] in world space. */
  velocities: [number, number, number][]
}

/** Pure factory: builds a SparkBurstData with randomised per-spark velocities. */
export function makeSparkBurst(pos: [number, number, number]): SparkBurstData {
  return {
    id: crypto.randomUUID(),
    position: pos,
    velocities: Array.from({ length: SPARK_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = SPARK_SPEED_MIN + Math.random() * (SPARK_SPEED_MAX - SPARK_SPEED_MIN)
      return [
        Math.cos(angle) * speed,
        0.8 + Math.random() * 2.5,
        Math.sin(angle) * speed * 0.15,  // keep sparks roughly on the 2D combat plane
      ] as [number, number, number]
    }),
  }
}

// ── SparkBurst sub-component ──────────────────────────────────────────────────
// Renders SPARK_COUNT small emissive quads that fly outward from a hit point,
// arc under gravity, and shrink away over SPARK_TTL seconds.
// No Rapier bodies — pure visual transform via useFrame.
// Exported so RemoteRobotEntity can render hit effects from incoming snapshots.

interface SparkBurstProps {
  data: SparkBurstData
  onExpired: (id: string) => void
}

export function SparkBurst({ data, onExpired }: SparkBurstProps) {
  const ageRef     = useRef(0)
  const expiredRef = useRef(false)
  // One ref per spark mesh, indexed to data.velocities
  const meshRefs   = useRef<(THREE.Mesh | null)[]>(Array(SPARK_COUNT).fill(null))

  useFrame((_, delta) => {
    if (expiredRef.current) return
    ageRef.current += delta

    if (ageRef.current >= SPARK_TTL) {
      expiredRef.current = true
      onExpired(data.id)
      return
    }

    const t = ageRef.current / SPARK_TTL  // 0 → 1
    const scale = (1 - t) * 0.08

    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const [vx, vy, vz] = data.velocities[i]
      // Kinematic position: x(t) = x0 + vx*t,  y(t) = y0 + vy*t - 0.5*g*t²
      const age = ageRef.current
      mesh.position.set(
        data.position[0] + vx * age,
        data.position[1] + vy * age - 4.9 * age * age,
        data.position[2] + vz * age,
      )
      mesh.scale.setScalar(Math.max(0, scale))
    })
  })

  return (
    <>
      {data.velocities.map((_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color="#ffaa00"
            emissive="#ff6600"
            emissiveIntensity={8}
          />
        </mesh>
      ))}
    </>
  )
}

// ── Bullet sub-component ──────────────────────────────────────────────────────

interface BulletProps {
  id: string
  spawnPos: [number, number, number]
  velocity: [number, number, number]
  onExpire: (id: string, wasHit: boolean, pos?: [number, number, number]) => void
}

function Bullet({ id, spawnPos, velocity, onExpire }: BulletProps) {
  const rbRef          = useRef<RapierRigidBody>(null)
  const ageRef         = useRef(0)
  const liveRef        = useRef(false)   // grace period: ignore collisions for 80 ms
  const initializedRef = useRef(false)
  const expiredRef     = useRef(false)

  const safeExpire = useCallback((wasHit: boolean) => {
    if (expiredRef.current) return
    expiredRef.current = true
    // Pass the current world position so callers can spawn hit effects at the impact site
    const t = rbRef.current?.translation()
    const pos: [number, number, number] | undefined = t ? [t.x, t.y, t.z] : undefined
    onExpire(id, wasHit, pos)
  }, [id, onExpire])

  useFrame((_, delta) => {
    if (expiredRef.current) return

    if (!initializedRef.current && rbRef.current) {
      initializedRef.current = true
      rbRef.current.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true)
    }

    ageRef.current += delta
    if (!liveRef.current && ageRef.current > 0.08) liveRef.current = true
    if (ageRef.current > BULLET_TTL) safeExpire(false)
  })

  return (
    <RigidBody
      ref={rbRef}
      position={spawnPos}
      collisionGroups={BULLET_GROUPS}
      gravityScale={0.3}
      ccd={true}
      restitution={0.1}
      linearDamping={0}
      onCollisionEnter={({ other }) => {
        if (!liveRef.current) return
        // Name "enemy" is set on RemoteRobotEntity's RigidBody
        const isEnemy = other.rigidBodyObject?.name === 'enemy'
        safeExpire(isEnemy)
      }}
    >
      <mesh>
        <boxGeometry args={[0.14, 0.14, 0.26]} />
        <meshStandardMaterial
          color="#ffaa00"
          emissive="#ff6600"
          emissiveIntensity={4}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      <CuboidCollider args={[0.07, 0.07, 0.13]} />
    </RigidBody>
  )
}

// ── WeaponSystem ──────────────────────────────────────────────────────────────

export interface WeaponEvent {
  type: WeaponType
  origin: [number, number, number]
  dir:    [number, number, number]
  dist?:  number   // laser only: actual raycast distance
}

interface WeaponSystemProps {
  chassisRef:     RefObject<RapierRigidBody | null>
  facingAngleRef: RefObject<number>
  controls:       RefObject<Controls>
  /** Called when a weapon fires so RobotEntity can include it in the next snapshot. */
  onWeaponFired?: (event: WeaponEvent) => void
  /**
   * Called when a shot confirms a hit, so RobotEntity can include `weaponHit`
   * in the next snapshot and the defender's screen can show the effect too.
   */
  onWeaponHit?: (type: WeaponType, hitPos: [number, number, number], damage: number) => void
}

export function WeaponSystem({
  chassisRef, facingAngleRef, controls, onWeaponFired, onWeaponHit,
}: WeaponSystemProps) {
  const { rapier, world } = useRapier()

  const { gunAmmo, laserCharges, setGunAmmo, setLaserCharges, addDamage, addScore } = useGameStore()

  const [bullets,     setBullets]     = useState<BulletData[]>([])
  const [laserBeam,   setLaserBeam]   = useState<LaserBeamState | null>(null)
  const [muzzleFlash, setMuzzleFlash] = useState<MuzzleFlash | null>(null)
  const [sparkBursts, setSparkBursts] = useState<SparkBurstData[]>([])

  const gunCooldown     = useRef(0)
  const laserCooldown   = useRef(0)
  const gunConsumed     = useRef(false)
  const laserConsumed   = useRef(false)
  const laserExpiresAt  = useRef(0)
  const muzzleExpiresAt = useRef(0)

  // Recharge timers — count up toward reload threshold
  const gunReloadTimer     = useRef(0)
  const laserRechargeTimer = useRef(0)

  const expireBullet = useCallback((bulletId: string, wasHit: boolean, pos?: [number, number, number]) => {
    setBullets((prev) => prev.filter((b) => b.id !== bulletId))
    if (wasHit && pos) {
      addDamage(GUN_DAMAGE)
      addScore(1)
      playHitConfirm()
      useGameStore.getState().addDamagePopup(GUN_DAMAGE, pos)
      setSparkBursts((prev) => [...prev, makeSparkBurst(pos)])
      onWeaponHit?.('gun', pos, GUN_DAMAGE)
    }
  }, [addDamage, addScore, onWeaponHit])

  useFrame((_, delta) => {
    const rb = chassisRef.current
    const c  = controls.current
    if (!rb || !c) return

    const θ  = facingAngleRef.current
    const cp = rb.translation()
    const cr = rb.rotation()

    // Forward direction: (sin θ, 0, cos θ) — derived from walk velocity code
    const dirX = Math.sin(θ)
    const dirZ = Math.cos(θ)

    // ── Cooldown timers ──────────────────────────────────────────────────────
    gunCooldown.current   = Math.max(0, gunCooldown.current   - delta)
    laserCooldown.current = Math.max(0, laserCooldown.current - delta)

    // ── Ammo recharge ────────────────────────────────────────────────────────
    // Use getState() to avoid stale closure on gunAmmo/laserCharges
    const state = useGameStore.getState()

    if (state.gunAmmo < GUN_MAX_AMMO) {
      gunReloadTimer.current += delta
      if (gunReloadTimer.current >= GUN_RELOAD_RATE) {
        gunReloadTimer.current = 0
        state.setGunAmmo(Math.min(state.gunAmmo + 1, GUN_MAX_AMMO))
      }
    } else {
      gunReloadTimer.current = 0
    }

    if (state.laserCharges < LASER_MAX_CHARGES) {
      laserRechargeTimer.current += delta
      if (laserRechargeTimer.current >= LASER_RECHARGE_RATE) {
        laserRechargeTimer.current = 0
        state.setLaserCharges(Math.min(state.laserCharges + 1, LASER_MAX_CHARGES))
      }
    } else {
      laserRechargeTimer.current = 0
    }

    // ── Clear expired visuals ────────────────────────────────────────────────
    const now = performance.now()
    if (laserExpiresAt.current > 0 && now > laserExpiresAt.current) {
      laserExpiresAt.current = 0
      setLaserBeam(null)
    }
    if (muzzleExpiresAt.current > 0 && now > muzzleExpiresAt.current) {
      muzzleExpiresAt.current = 0
      setMuzzleFlash(null)
    }

    // ── Gun (F key) ─────────────────────────────────────────────────────────
    if (c.fireGun) {
      const canFire = !gunConsumed.current && gunCooldown.current === 0
      if (canFire && useGameStore.getState().gunAmmo > 0) {
        gunCooldown.current = GUN_COOLDOWN
        gunConsumed.current = true
        state.setGunAmmo(useGameStore.getState().gunAmmo - 1)
        gunReloadTimer.current = 0   // reset reload timer on fire

        const [bx, by, bz] = rotateByQuat(GUN_BARREL, cr)
        const spawnPos: [number, number, number] = [
          cp.x + bx + dirX * 0.4,
          cp.y + by,
          cp.z + bz + dirZ * 0.4,
        ]

        // Muzzle flash at barrel
        const flashExpiresAt = now + 120
        muzzleExpiresAt.current = flashExpiresAt
        setMuzzleFlash({ pos: spawnPos, expiresAt: flashExpiresAt, type: 'gun' })

        setBullets((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            spawnPos,
            velocity: [dirX * BULLET_SPEED, 0.5, dirZ * BULLET_SPEED],
          },
        ])

        playGunShot()
        onWeaponFired?.({ type: 'gun', origin: spawnPos, dir: [dirX, 0, dirZ] })
      }
    } else {
      gunConsumed.current = false
    }

    // ── Laser (L key) ────────────────────────────────────────────────────────
    if (c.fireLaser) {
      const canFire = !laserConsumed.current && laserCooldown.current === 0
      if (canFire && useGameStore.getState().laserCharges > 0) {
        laserCooldown.current = LASER_COOLDOWN
        laserConsumed.current = true
        state.setLaserCharges(useGameStore.getState().laserCharges - 1)
        laserRechargeTimer.current = 0

        const [ex, ey, ez] = rotateByQuat(LASER_EMITTER, cr)
        const origin = { x: cp.x + ex, y: cp.y + ey, z: cp.z + ez }

        const ray = new rapier.Ray(origin, { x: dirX, y: 0, z: dirZ })
        // Filter: ray acts as group-0 member colliding with groups 1-15.
        // This skips the player's own colliders (also group 0) so the ray
        // doesn't immediately hit the arm the emitter is sitting inside.
        const RAY_FILTER = interactionGroups(0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
        const hit = world.castRay(ray, LASER_RANGE, true, undefined, RAY_FILTER)
        const dist = hit ? hit.timeOfImpact : LASER_RANGE

        // Check if the ray hit the enemy (group 1: membership bit 1 in upper 16 bits)
        const ENEMY_MEMBERSHIP = 1 << (16 + 1)
        const hitEnemy = hit != null &&
          (hit.collider.collisionGroups() & ENEMY_MEMBERSHIP) !== 0

        if (hitEnemy) {
          addDamage(LASER_DAMAGE)
          addScore(2)
          playHitConfirm()
          const hitPos: [number, number, number] = [
            origin.x + dirX * dist,
            origin.y,
            origin.z + dirZ * dist,
          ]
          useGameStore.getState().addDamagePopup(LASER_DAMAGE, hitPos)
          setSparkBursts((prev) => [...prev, makeSparkBurst(hitPos)])
          onWeaponHit?.('laser', hitPos, LASER_DAMAGE)
        }

        const beamExpiresAt = now + LASER_DISPLAY * 1000
        laserExpiresAt.current = beamExpiresAt

        setLaserBeam({
          midPos: [
            origin.x + dirX * dist / 2,
            origin.y,
            origin.z + dirZ * dist / 2,
          ],
          length: dist,
          angleY: θ,
          expiresAt: beamExpiresAt,
          hitEnemy,
        })

        // Muzzle flash at emitter
        const flashPos: [number, number, number] = [origin.x, origin.y, origin.z]
        const flashExpiresAt = now + 200
        muzzleExpiresAt.current = flashExpiresAt
        setMuzzleFlash({ pos: flashPos, expiresAt: flashExpiresAt, type: 'laser' })

        playLaserShot()
        onWeaponFired?.({
          type: 'laser',
          origin: [origin.x, origin.y, origin.z],
          dir: [dirX, 0, dirZ],
          dist,
        })
      }
    } else {
      laserConsumed.current = false
    }
  })

  return (
    <>
      {/* ── Bullets ───────────────────────────────────────────────────────── */}
      {bullets.map((b) => (
        <Bullet key={b.id} {...b} onExpire={expireBullet} />
      ))}

      {/* ── Spark bursts (impact hit effects) ──────────────────────────────── */}
      {sparkBursts.map((burst) => (
        <SparkBurst
          key={burst.id}
          data={burst}
          onExpired={(id) => setSparkBursts((prev) => prev.filter((s) => s.id !== id))}
        />
      ))}

      {/* ── Laser beam ─────────────────────────────────────────────────────── */}
      {laserBeam && (
        <>
          <mesh position={laserBeam.midPos} rotation={[0, laserBeam.angleY, 0]}>
            <boxGeometry args={[0.08, 0.08, laserBeam.length]} />
            <meshStandardMaterial
              color={laserBeam.hitEnemy ? '#ff4400' : '#ff0000'}
              emissive={laserBeam.hitEnemy ? '#ff4400' : '#ff0000'}
              emissiveIntensity={10}
              transparent
              opacity={0.95}
            />
          </mesh>
          {/* Emitter sphere — anchors the beam at the firing point */}
          <mesh position={[
            laserBeam.midPos[0] - Math.sin(laserBeam.angleY) * laserBeam.length / 2,
            laserBeam.midPos[1],
            laserBeam.midPos[2] - Math.cos(laserBeam.angleY) * laserBeam.length / 2,
          ]}>
            <sphereGeometry args={[laserBeam.hitEnemy ? 0.22 : 0.16, 8, 8]} />
            <meshStandardMaterial
              color={laserBeam.hitEnemy ? '#ff4400' : '#ff2200'}
              emissive={laserBeam.hitEnemy ? '#ff4400' : '#ff2200'}
              emissiveIntensity={12}
              transparent
              opacity={0.9}
            />
          </mesh>
          <pointLight
            position={[
              laserBeam.midPos[0] - Math.sin(laserBeam.angleY) * laserBeam.length / 2,
              laserBeam.midPos[1],
              laserBeam.midPos[2] - Math.cos(laserBeam.angleY) * laserBeam.length / 2,
            ]}
            color="#ff2200"
            intensity={6}
            distance={4}
          />
        </>
      )}

      {/* ── Muzzle flash ──────────────────────────────────────────────────── */}
      {muzzleFlash && (
        <>
          <mesh position={muzzleFlash.pos}>
            <sphereGeometry args={[muzzleFlash.type === 'gun' ? 0.12 : 0.18, 6, 6]} />
            <meshStandardMaterial
              color={muzzleFlash.type === 'gun' ? '#ffcc44' : '#ff4400'}
              emissive={muzzleFlash.type === 'gun' ? '#ffaa00' : '#ff2200'}
              emissiveIntensity={12}
              transparent
              opacity={0.9}
            />
          </mesh>
          <pointLight
            position={muzzleFlash.pos}
            color={muzzleFlash.type === 'gun' ? '#ffaa44' : '#ff2200'}
            intensity={8}
            distance={3}
          />
        </>
      )}
    </>
  )
}
