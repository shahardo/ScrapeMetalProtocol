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
import { useGameStore, GUN_MAX_AMMO, LASER_MAX_CHARGES, ROCKET_MAX_AMMO } from '../../store/gameStore'
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
const SHOTGUN_COOLDOWN   = 1.1    // seconds — fires 3 pellets in a spread
const ROCKET_COOLDOWN    = 2.2    // seconds — slow heavy projectile
const LASER_COOLDOWN     = 1.5    // seconds between laser pulses
const SNIPER_COOLDOWN    = 3.5    // seconds — long-range precision beam

const BULLET_SPEED       = 18     // m/s
const ROCKET_SPEED       = 9      // m/s — noticeably slower than bullets
const BULLET_TTL         = 3.5    // seconds before auto-despawn
const ROCKET_TTL         = 4.0    // seconds before auto-despawn

const GUN_DAMAGE         = 25     // damage per bullet hit
const SHOTGUN_DAMAGE     = 18     // damage per pellet (×3 pellets = 54 max if all land)
const ROCKET_DAMAGE      = 60     // high single-hit damage
const LASER_DAMAGE       = 40     // damage per laser hit
const SNIPER_DAMAGE      = 80     // long-range precision damage

const LASER_RANGE        = 15     // maximum laser raycast distance (metres)
const SNIPER_RANGE       = 30     // double the laser range
const LASER_DISPLAY      = 0.22   // seconds the beam stays visible
const SNIPER_DISPLAY     = 0.35   // slightly longer beam flash for visual clarity

// Ammo recharge rates
const GUN_RELOAD_RATE      = 2.5  // seconds per bullet reloaded
const LASER_RECHARGE_RATE  = 3.0  // seconds per charge regenerated
const ROCKET_RELOAD_RATE   = 5.0  // seconds per rocket reloaded (slow)

// Shotgun fires 3 pellets at ±SHOTGUN_SPREAD radians from aim direction
const SHOTGUN_SPREAD   = 0.18   // radians

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
  /** Time-to-live in seconds. Defaults to BULLET_TTL if omitted. */
  ttl?: number
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
  ttl?: number
  onExpire: (id: string, wasHit: boolean, pos?: [number, number, number]) => void
}

function Bullet({ id, spawnPos, velocity, ttl = BULLET_TTL, onExpire }: BulletProps) {
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
    if (ageRef.current > ttl) safeExpire(false)
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

  // All weapon state reads go through getState() in useFrame to avoid stale closures.
  const { addDamage, addScore } = useGameStore()

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
  const gunReloadTimer      = useRef(0)
  const laserRechargeTimer  = useRef(0)
  const rocketReloadTimer   = useRef(0)

  // Each bullet/rocket stores the damage it deals so the expiry callback
  // can report the correct amount regardless of weapon type.
  const bulletDamageMap = useRef<Map<string, number>>(new Map())

  const expireBullet = useCallback((bulletId: string, wasHit: boolean, pos?: [number, number, number]) => {
    setBullets((prev) => prev.filter((b) => b.id !== bulletId))
    if (wasHit && pos) {
      const dmg = bulletDamageMap.current.get(bulletId) ?? GUN_DAMAGE
      bulletDamageMap.current.delete(bulletId)
      addDamage(dmg)
      addScore(1)
      playHitConfirm()
      useGameStore.getState().addDamagePopup(dmg, pos)
      setSparkBursts((prev) => [...prev, makeSparkBurst(pos)])
      onWeaponHit?.('gun', pos, dmg)
    } else {
      bulletDamageMap.current.delete(bulletId)
    }
  }, [addDamage, addScore, onWeaponHit])

  useFrame((_, delta) => {
    const rb = chassisRef.current
    const c  = controls.current
    if (!rb || !c) return

    const θ  = facingAngleRef.current ?? 0
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

    if (state.rocketAmmo < ROCKET_MAX_AMMO) {
      rocketReloadTimer.current += delta
      if (rocketReloadTimer.current >= ROCKET_RELOAD_RATE) {
        rocketReloadTimer.current = 0
        state.setRocketAmmo(Math.min(state.rocketAmmo + 1, ROCKET_MAX_AMMO))
      }
    } else {
      rocketReloadTimer.current = 0
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

    // ── Shared helpers ────────────────────────────────────────────────────────

    /** Spawns a single bullet from a world-space emitter point.
     *  dirOverride lets shotgun pellets spread around the aim vector. */
    const spawnBullet = (
      emitter: { x: number; y: number; z: number },
      bDirX: number,
      bDirZ: number,
      speed: number,
      damage: number,
      ttl: number = BULLET_TTL,
    ) => {
      const id = crypto.randomUUID()
      const spawnPos: [number, number, number] = [
        emitter.x + bDirX * 0.4, emitter.y, emitter.z + bDirZ * 0.4,
      ]
      bulletDamageMap.current.set(id, damage)
      setBullets((prev) => [
        ...prev,
        { id, spawnPos, velocity: [bDirX * speed, 0.5, bDirZ * speed], ttl },
      ])
    }

    /** Fires a single standard bullet (gun). */
    const doFireGun = (emitter: { x: number; y: number; z: number }) => {
      const s = useGameStore.getState()
      if (s.gunAmmo <= 0) return
      s.setGunAmmo(s.gunAmmo - 1)
      gunReloadTimer.current = 0

      const spawnPos: [number, number, number] = [emitter.x + dirX * 0.4, emitter.y, emitter.z + dirZ * 0.4]
      const flashExpiresAt = now + 120
      muzzleExpiresAt.current = flashExpiresAt
      setMuzzleFlash({ pos: spawnPos, expiresAt: flashExpiresAt, type: 'gun' })
      spawnBullet(emitter, dirX, dirZ, BULLET_SPEED, GUN_DAMAGE)
      playGunShot()
      onWeaponFired?.({ type: 'gun', origin: spawnPos, dir: [dirX, 0, dirZ] })
    }

    /** Fires 3 spread pellets (shotgun). Consumes 1 gunAmmo. */
    const doFireShotgun = (emitter: { x: number; y: number; z: number }) => {
      const s = useGameStore.getState()
      if (s.gunAmmo <= 0) return
      s.setGunAmmo(s.gunAmmo - 1)
      gunReloadTimer.current = 0

      // Wide muzzle flash
      const spawnPos: [number, number, number] = [emitter.x + dirX * 0.4, emitter.y, emitter.z + dirZ * 0.4]
      const flashExpiresAt = now + 140
      muzzleExpiresAt.current = flashExpiresAt
      setMuzzleFlash({ pos: spawnPos, expiresAt: flashExpiresAt, type: 'gun' })

      // Spawn 3 pellets with angular spread
      const angles = [-SHOTGUN_SPREAD, 0, SHOTGUN_SPREAD]
      for (const spread of angles) {
        const cos = Math.cos(spread)
        const sin = Math.sin(spread)
        const pDirX = dirX * cos - dirZ * sin
        const pDirZ = dirX * sin + dirZ * cos
        spawnBullet(emitter, pDirX, pDirZ, BULLET_SPEED, SHOTGUN_DAMAGE)
      }
      playGunShot()
      onWeaponFired?.({ type: 'shotgun', origin: spawnPos, dir: [dirX, 0, dirZ] })
    }

    /** Fires a slow heavy rocket. Consumes 1 rocketAmmo. */
    const doFireRocket = (emitter: { x: number; y: number; z: number }) => {
      const s = useGameStore.getState()
      if (s.rocketAmmo <= 0) return
      s.setRocketAmmo(s.rocketAmmo - 1)
      rocketReloadTimer.current = 0

      const spawnPos: [number, number, number] = [emitter.x + dirX * 0.5, emitter.y, emitter.z + dirZ * 0.5]
      const flashExpiresAt = now + 200
      muzzleExpiresAt.current = flashExpiresAt
      setMuzzleFlash({ pos: spawnPos, expiresAt: flashExpiresAt, type: 'gun' })
      spawnBullet(emitter, dirX, dirZ, ROCKET_SPEED, ROCKET_DAMAGE, ROCKET_TTL)
      playGunShot()   // reuse sound for now
      onWeaponFired?.({ type: 'rocket', origin: spawnPos, dir: [dirX, 0, dirZ] })
    }

    /** Fires an instant raycast beam. Used by both laser and sniper. */
    const doFireBeam = (
      origin: { x: number; y: number; z: number },
      range: number,
      damage: number,
      displayMs: number,
      type: 'laser' | 'sniper',
    ) => {
      const s = useGameStore.getState()
      if (s.laserCharges <= 0) return
      // Sniper costs 2 charges per shot; laser costs 1.
      const cost = type === 'sniper' ? 2 : 1
      if (s.laserCharges < cost) return
      s.setLaserCharges(s.laserCharges - cost)
      laserRechargeTimer.current = 0

      const ray = new rapier.Ray(origin, { x: dirX, y: 0, z: dirZ })
      // Filter: ray acts as group-0 member, colliding with groups 1-15.
      // Skips the firing robot's own colliders (group 0) so the arm tip doesn't self-hit.
      const RAY_FILTER = interactionGroups(0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
      const hit = world.castRay(ray, range, true, undefined, RAY_FILTER)
      const dist = hit ? hit.timeOfImpact : range

      // Enemy membership: group-1 bodies (RemoteRobotEntity) have bit 1 set in upper 16 bits
      const ENEMY_MEMBERSHIP = 1 << (16 + 1)
      const hitEnemy = hit != null && (hit.collider.collisionGroups() & ENEMY_MEMBERSHIP) !== 0

      if (hitEnemy) {
        addDamage(damage)
        addScore(type === 'sniper' ? 3 : 2)
        playHitConfirm()
        const hitPos: [number, number, number] = [origin.x + dirX * dist, origin.y, origin.z + dirZ * dist]
        useGameStore.getState().addDamagePopup(damage, hitPos)
        setSparkBursts((prev) => [...prev, makeSparkBurst(hitPos)])
        onWeaponHit?.(type, hitPos, damage)
      }

      const beamExpiresAt = now + displayMs
      laserExpiresAt.current = beamExpiresAt
      setLaserBeam({
        midPos: [origin.x + dirX * dist / 2, origin.y, origin.z + dirZ * dist / 2],
        length: dist,
        angleY: θ,
        expiresAt: beamExpiresAt,
        // Sniper beam is blue, laser is red — reuse hitEnemy flag but add weapon type
        hitEnemy: type === 'sniper' ? false : hitEnemy,   // sniper always draws blue regardless of hit
      })

      const flashExpiresAt = now + 200
      muzzleExpiresAt.current = flashExpiresAt
      setMuzzleFlash({ pos: [origin.x, origin.y, origin.z], expiresAt: flashExpiresAt, type: 'laser' })
      playLaserShot()
      onWeaponFired?.({ type, origin: [origin.x, origin.y, origin.z], dir: [dirX, 0, dirZ], dist })
    }

    const doFireLaser  = (o: { x: number; y: number; z: number }) =>
      doFireBeam(o, LASER_RANGE, LASER_DAMAGE, LASER_DISPLAY * 1000, 'laser')
    const doFireSniper = (o: { x: number; y: number; z: number }) =>
      doFireBeam(o, SNIPER_RANGE, SNIPER_DAMAGE, SNIPER_DISPLAY * 1000, 'sniper')

    /** Returns the cooldown duration for a weapon type. */
    const weaponCooldown = (w: WeaponType) => {
      if (w === 'gun')     return GUN_COOLDOWN
      if (w === 'shotgun') return SHOTGUN_COOLDOWN
      if (w === 'rocket')  return ROCKET_COOLDOWN
      if (w === 'laser')   return LASER_COOLDOWN
      return SNIPER_COOLDOWN  // sniper
    }

    /** Dispatches fire to the appropriate helper given a weapon type and emitter. */
    const fireWeapon = (w: WeaponType, arm: { x: number; y: number; z: number }) => {
      if (w === 'gun')     doFireGun(arm)
      if (w === 'shotgun') doFireShotgun(arm)
      if (w === 'rocket')  doFireRocket(arm)
      if (w === 'laser')   doFireLaser(arm)
      if (w === 'sniper')  doFireSniper(arm)
    }

    /** True if the given weapon has ammo. */
    const hasAmmoFor = (w: WeaponType) => {
      const s = useGameStore.getState()
      if (w === 'gun' || w === 'shotgun') return s.gunAmmo > 0
      if (w === 'rocket')                 return s.rocketAmmo > 0
      if (w === 'laser')                  return s.laserCharges > 0
      return s.laserCharges >= 2  // sniper costs 2
    }

    // ── Right arm (E key) — fires the weapon assigned to rightArmWeapon ───────
    if (c.fireGun) {
      const canFire = !gunConsumed.current && gunCooldown.current === 0
      if (canFire) {
        const weapon = useGameStore.getState().rightArmWeapon
        if (hasAmmoFor(weapon)) {
          gunCooldown.current = weaponCooldown(weapon)
          gunConsumed.current = true
          useGameStore.getState().bumpGunCooldown()
          const [bx, by, bz] = rotateByQuat(GUN_BARREL, cr)
          fireWeapon(weapon, { x: cp.x + bx, y: cp.y + by, z: cp.z + bz })
        }
      }
    } else {
      gunConsumed.current = false
    }

    // ── Left arm (Q key) — fires the weapon assigned to leftArmWeapon ─────────
    if (c.fireLaser) {
      const canFire = !laserConsumed.current && laserCooldown.current === 0
      if (canFire) {
        const weapon = useGameStore.getState().leftArmWeapon
        if (hasAmmoFor(weapon)) {
          laserCooldown.current = weaponCooldown(weapon)
          laserConsumed.current = true
          useGameStore.getState().bumpLaserCooldown()
          const [ex, ey, ez] = rotateByQuat(LASER_EMITTER, cr)
          fireWeapon(weapon, { x: cp.x + ex, y: cp.y + ey, z: cp.z + ez })
        }
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
