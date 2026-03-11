/**
 * WeaponTable — full weapon catalogue shown in the Garage WEAPONS tab.
 *
 * Each row has:
 *  - A 3-D rotating preview thumbnail (isolated R3F Canvas, 96×96 px)
 *  - Name, description, stat bars (Power / Range / Fire Rate)
 *  - Ammo count and credit price
 *  - SELECT buttons for left (Q) and right (E) arm slots
 */

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { WeaponType } from '../../types/game'
import { ALL_WEAPON_TYPES, WEAPON_COLOR, WEAPON_STATS } from '../weapons/weaponRegistry'
import { useGameStore } from '../../store/gameStore'

// ── Per-weapon 3-D mesh previews ──────────────────────────────────────────────
// Each weapon gets a simple geometric stand-in that rotates on Y.

function RotatingGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 1.2
  })
  return <group ref={ref}>{children}</group>
}

const PREVIEW_MESHES: Record<WeaponType, React.ReactNode> = {
  gun: (
    <RotatingGroup>
      {/* barrel */}
      <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
        <meshStandardMaterial color="#ffaa44" emissive="#ff8800" emissiveIntensity={0.4} />
      </mesh>
      {/* body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.2, 0.2]} />
        <meshStandardMaterial color="#886633" />
      </mesh>
    </RotatingGroup>
  ),
  shotgun: (
    <RotatingGroup>
      {/* wide barrel */}
      <mesh position={[0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.14, 0.9, 8]} />
        <meshStandardMaterial color="#ff8800" emissive="#ff6600" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[-0.1, 0, 0]}>
        <boxGeometry args={[0.5, 0.22, 0.22]} />
        <meshStandardMaterial color="#7a5020" />
      </mesh>
    </RotatingGroup>
  ),
  rocket: (
    <RotatingGroup>
      {/* rocket body */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15, 0.1, 1.0, 8]} />
        <meshStandardMaterial color="#ff4422" emissive="#cc2200" emissiveIntensity={0.5} />
      </mesh>
      {/* nose */}
      <mesh position={[0.55, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.15, 0.3, 8]} />
        <meshStandardMaterial color="#ff6644" />
      </mesh>
    </RotatingGroup>
  ),
  laser: (
    <RotatingGroup>
      {/* emitter dish */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.1, 0.6, 12]} />
        <meshStandardMaterial color="#ff3344" emissive="#ff0022" emissiveIntensity={0.7} />
      </mesh>
      {/* lens */}
      <mesh position={[0.35, 0, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#ff88aa" emissive="#ff3344" emissiveIntensity={1.0} />
      </mesh>
    </RotatingGroup>
  ),
  sniper: (
    <RotatingGroup>
      {/* long barrel */}
      <mesh position={[0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 1.1, 8]} />
        <meshStandardMaterial color="#44ccff" emissive="#0088cc" emissiveIntensity={0.5} />
      </mesh>
      {/* scope */}
      <mesh position={[0.1, 0.18, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.35, 8]} />
        <meshStandardMaterial color="#336688" />
      </mesh>
      {/* body */}
      <mesh position={[-0.1, 0, 0]}>
        <boxGeometry args={[0.5, 0.15, 0.15]} />
        <meshStandardMaterial color="#224455" />
      </mesh>
    </RotatingGroup>
  ),
}

// ── Stat bar ──────────────────────────────────────────────────────────────────

function StatBar({ label, value, max = 5, color }: { label: string; value: number; max?: number; color: string }) {
  return (
    <div className="wt-stat-row">
      <span className="wt-stat-label">{label}</span>
      <div className="wt-stat-track">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className="wt-stat-pip"
            style={{ background: i < value ? color : 'rgba(255,255,255,0.1)' }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface WeaponTableProps {
  credits:       number
  onSelectLeft:  (w: WeaponType) => void
  onSelectRight: (w: WeaponType) => void
}

export function WeaponTable({ credits, onSelectLeft, onSelectRight }: WeaponTableProps) {
  const { leftArmWeapon, rightArmWeapon } = useGameStore()

  return (
    <div className="wt-list">
      {ALL_WEAPON_TYPES.map((w) => {
        const stats   = WEAPON_STATS[w]
        const color   = WEAPON_COLOR[w]
        const isLeft  = leftArmWeapon  === w
        const isRight = rightArmWeapon === w
        // Weapons with a price gate require sufficient credits to equip
        const locked  = stats.price > 0 && credits < stats.price

        return (
          <div key={w} className={`wt-row${isLeft || isRight ? ' wt-row--equipped' : ''}${locked ? ' wt-row--locked' : ''}`}>

            {/* 3-D preview thumbnail */}
            <div className="wt-preview">
              <Canvas
                camera={{ position: [0, 0.5, 2.2], fov: 40 }}
                style={{ background: 'transparent' }}
                gl={{ alpha: true }}
              >
                <ambientLight intensity={1.5} />
                <pointLight position={[2, 2, 2]} intensity={2} color={color} />
                {PREVIEW_MESHES[w]}
              </Canvas>
            </div>

            {/* Info column */}
            <div className="wt-info">
              <div className="wt-name" style={{ color }}>{stats.name}</div>
              <div className="wt-desc">{stats.desc}</div>
              <div className="wt-stats">
                <StatBar label="PWR"  value={Math.round(stats.power / 20)}   color={color} />
                <StatBar label="RNG"  value={stats.range}                     color={color} />
                <StatBar label="ROF"  value={stats.fireRate}                  color={color} />
              </div>
              <div className="wt-meta">
                <span className="wt-ammo">AMMO {stats.ammo}</span>
                <span className="wt-price">{stats.price > 0 ? `${stats.price} ¢` : 'FREE'}</span>
              </div>
            </div>

            {/* Slot buttons — disabled when credits < weapon price */}
            <div className="wt-slots">
              <button
                className={`wt-slot-btn${isLeft ? ' wt-slot-btn--active' : ''}`}
                style={isLeft ? { borderColor: color, color } : {}}
                onClick={() => onSelectLeft(w)}
                disabled={locked}
                title={locked ? `Requires ${stats.price} ¢` : 'Equip on left arm (Q key)'}
              >
                {isLeft ? '✓ Q' : 'Q'}
              </button>
              <button
                className={`wt-slot-btn${isRight ? ' wt-slot-btn--active' : ''}`}
                style={isRight ? { borderColor: color, color } : {}}
                onClick={() => onSelectRight(w)}
                disabled={locked}
                title={locked ? `Requires ${stats.price} ¢` : 'Equip on right arm (E key)'}
              >
                {isRight ? '✓ E' : 'E'}
              </button>
            </div>

          </div>
        )
      })}
    </div>
  )
}
