/**
 * GarageModal — full-screen loadout hub (Sprint 14).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  HANGAR           $120              [DEPLOY ▶]       │  ← top bar
 *   ├──────────────────────┬──────────────────────────────┤
 *   │  WEAPONS             │                              │
 *   │  (scrollable list)   │   Robot preview (R3F)        │
 *   │  ──────────────────  │                              │
 *   │  SAVED CONFIGS ▸     │                              │
 *   │  BOT SCRIPT ▸        │                              │
 *   └──────────────────────┴──────────────────────────────┘
 */

import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { GarageRobot, RobotPart, PartType, WeaponType } from '../../types/game'
import { useGameStore } from '../../store/gameStore'
import { WeaponTable } from './WeaponTable'
import { WEAPON_LABEL, WEAPON_COLOR } from '../weapons/weaponRegistry'
import { formatDollars } from '../../utils/formatDollars'

const API = 'http://localhost:3001'

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildParts(leftWeapon: WeaponType, rightWeapon: WeaponType): RobotPart[] {
  return [
    { id: 'chassis', type: 'chassis'   as PartType, health: 100, maxHealth: 100, weight: 30, armor: 10, isDetached: false },
    { id: 'head',    type: 'head'      as PartType, health: 100, maxHealth: 100, weight: 5,  armor: 5,  isDetached: false },
    { id: 'arm-l',   type: 'arm-left'  as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false, weaponSlot: leftWeapon },
    { id: 'arm-r',   type: 'arm-right' as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false, weaponSlot: rightWeapon },
  ]
}

export function buildDescription(leftWeapon: WeaponType, rightWeapon: WeaponType): string {
  return `Q: ${WEAPON_LABEL[leftWeapon]} / E: ${WEAPON_LABEL[rightWeapon]}`
}

// ── Bot script validation (main-thread syntax check — no worker needed) ───────

function validateScript(code: string): { valid: boolean; error: string | null } {
  if (!code.trim()) return { valid: false, error: null }
  try {
    new Function('state', code)
    return { valid: true, error: null }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Syntax error' }
  }
}

// ── Robot preview — static R3F canvas, no physics ─────────────────────────────

function ArmWeaponMesh({ type }: { type: WeaponType }) {
  const color = WEAPON_COLOR[type]
  switch (type) {
    case 'gun':
      return (
        <>
          <mesh position={[0.28, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.07, 0.07, 0.55, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.32, 0.18, 0.18]} />
            <meshStandardMaterial color="#775522" />
          </mesh>
        </>
      )
    case 'shotgun':
      return (
        <>
          <mesh position={[0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.11, 0.13, 0.6, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.36, 0.2, 0.2]} />
            <meshStandardMaterial color="#664411" />
          </mesh>
        </>
      )
    case 'rocket':
      return (
        <>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.13, 0.09, 0.7, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0.38, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.13, 0.22, 8]} />
            <meshStandardMaterial color="#ff6644" />
          </mesh>
        </>
      )
    case 'laser':
      return (
        <>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.08, 0.5, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0.28, 0, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color="#ff88aa" emissive="#ff3344" emissiveIntensity={0.9} />
          </mesh>
        </>
      )
    case 'sniper':
      return (
        <>
          <mesh position={[0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.055, 0.055, 0.8, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0.08, 0.16, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.28, 8]} />
            <meshStandardMaterial color="#336688" />
          </mesh>
          <mesh position={[-0.06, 0, 0]}>
            <boxGeometry args={[0.4, 0.13, 0.13]} />
            <meshStandardMaterial color="#1e3d55" />
          </mesh>
        </>
      )
  }
}

function RobotPreviewMesh() {
  const { leftArmWeapon, rightArmWeapon } = useGameStore()
  const groupRef = useRef<Group>(null)

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.35
  })

  return (
    <group ref={groupRef}>
      {/* Chassis */}
      <mesh>
        <boxGeometry args={[1.4, 1.0, 0.8]} />
        <meshStandardMaterial color="#3a6a8a" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.84, 0]}>
        <boxGeometry args={[0.72, 0.58, 0.58]} />
        <meshStandardMaterial color="#2a5a7a" />
      </mesh>
      {/* Visor */}
      <mesh position={[0, 0.87, 0.3]}>
        <boxGeometry args={[0.52, 0.13, 0.02]} />
        <meshStandardMaterial color="#44aaff" emissive="#2288cc" emissiveIntensity={0.9} />
      </mesh>
      {/* Left arm + weapon — arm points forward (+Z), weapon at the Z tip */}
      <group position={[-1.0, 0.05, 0]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.58, 0.32, 0.32]} />
          <meshStandardMaterial color="#2a5a7a" />
        </mesh>
        <group position={[0, 0, 0.52]} scale={0.72} rotation={[0, -Math.PI / 2, 0]}>
          <ArmWeaponMesh type={leftArmWeapon} />
        </group>
      </group>
      {/* Right arm + weapon — arm points forward (+Z), weapon at the Z tip */}
      <group position={[1.0, 0.05, 0]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.58, 0.32, 0.32]} />
          <meshStandardMaterial color="#2a5a7a" />
        </mesh>
        <group position={[0, 0, 0.52]} scale={0.72} rotation={[0, -Math.PI / 2, 0]}>
          <ArmWeaponMesh type={rightArmWeapon} />
        </group>
      </group>
      {/* Legs */}
      <mesh position={[-0.35, -0.9, 0]}>
        <boxGeometry args={[0.34, 0.7, 0.34]} />
        <meshStandardMaterial color="#1f4a6a" />
      </mesh>
      <mesh position={[0.35, -0.9, 0]}>
        <boxGeometry args={[0.34, 0.7, 0.34]} />
        <meshStandardMaterial color="#1f4a6a" />
      </mesh>
    </group>
  )
}

function RobotPreviewCanvas() {
  return (
    <div className="garage-preview-wrap">
      <Canvas
        camera={{ position: [0, 0.5, 5.5], fov: 40 }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
        gl={{ alpha: true }}
      >
        <ambientLight intensity={1.4} />
        <directionalLight position={[5, 8, 4]} intensity={2.2} />
        <pointLight position={[-4, 4, 4]} intensity={1.4} color="#5070a8" />
        <RobotPreviewMesh />
      </Canvas>
    </div>
  )
}

// ── Bot script editor ─────────────────────────────────────────────────────────

const BOT_PLACEHOLDER = `// Bot script — write a function body that returns a BotInput object.
// Available on 'state': x, y, enemyX, enemyY, health, enemyHealth,
//                       gunAmmo, laserCharges, isGrounded
//
// Example:
const { x, enemyX } = state
if (enemyX > x) {
  return { moveRight: true, fireRight: true }
}
return { moveLeft: true }`

function BotEditor() {
  const { botScript, botScriptValid, setBotScript, setBotScriptValid } = useGameStore()
  const [localError, setLocalError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const code = e.target.value
    setBotScript(code)
    const result = validateScript(code)
    setBotScriptValid(result.valid)
    setLocalError(result.error)
  }

  const statusClass = botScript.trim()
    ? botScriptValid ? 'bot-status--valid' : 'bot-status--error'
    : ''

  const statusText = !botScript.trim()
    ? 'No script — bot will not run'
    : botScriptValid
      ? '✓ VALID — will activate on DEPLOY'
      : `✗ ${localError ?? 'Syntax error'}`

  return (
    <div className="garage-bot-editor">
      <textarea
        className="garage-bot-textarea"
        value={botScript}
        onChange={handleChange}
        placeholder={BOT_PLACEHOLDER}
        spellCheck={false}
        rows={10}
      />
      <div className={`garage-bot-status ${statusClass}`}>{statusText}</div>
    </div>
  )
}

// Small badge next to "BOT SCRIPT" toggle showing script status at a glance.
function BotStatusBadge() {
  const { botScript, botScriptValid } = useGameStore()
  if (!botScript.trim()) return null
  return (
    <span className={`garage-tab-badge${botScriptValid ? '' : ' garage-tab-badge--error'}`}>
      {botScriptValid ? 'RDY' : 'ERR'}
    </span>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GarageModalProps {
  userId:    string
  authToken: string
  onDeploy:  () => void
}

// ── Main component ────────────────────────────────────────────────────────────

export function GarageModal({ userId, authToken, onDeploy }: GarageModalProps) {
  const credits = useGameStore((s) => s.credits)
  const { setLeftArmWeapon, setRightArmWeapon } = useGameStore()

  const [robots,      setRobots]      = useState<GarageRobot[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [saveName,    setSaveName]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [configsOpen, setConfigsOpen] = useState(false)
  const [botOpen,     setBotOpen]     = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${API}/garage/${userId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`)
        return r.json() as Promise<{ robots: GarageRobot[] }>
      })
      .then(({ robots }) => { if (!cancelled) setRobots(robots) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { leftArmWeapon, rightArmWeapon } = useGameStore.getState()
      const res = await fetch(`${API}/garage/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        saveName.trim(),
          description: buildDescription(leftArmWeapon, rightArmWeapon),
          parts:       buildParts(leftArmWeapon, rightArmWeapon),
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { robot } = await res.json() as { robot: GarageRobot }
      setRobots((prev) => [robot, ...prev])
      setSaveName('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleLoad = (robot: GarageRobot) => {
    const leftArm  = robot.parts.find((p) => p.type === 'arm-left')
    const rightArm = robot.parts.find((p) => p.type === 'arm-right')
    if (leftArm?.weaponSlot)  setLeftArmWeapon(leftArm.weaponSlot as WeaponType)
    if (rightArm?.weaponSlot) setRightArmWeapon(rightArm.weaponSlot as WeaponType)
  }

  const handleDelete = async (robotId: string) => {
    setError(null)
    try {
      const res = await fetch(`${API}/garage/${userId}/${robotId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setRobots((prev) => prev.filter((r) => r._id !== robotId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  return (
    <div className="garage-fullscreen">

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="garage-topbar">
        <span className="garage-topbar-title">SCRAP METAL PROTOCOL — HANGAR</span>
        <span className="garage-topbar-wallet">{formatDollars(credits)}</span>
        <button className="garage-deploy-btn" onClick={onDeploy}>DEPLOY ▶</button>
      </div>

      {/* ── Two-panel layout ─────────────────────────────────────────── */}
      <div className="garage-layout">

        {/* Left panel: loadout + configs + bot */}
        <div className="garage-panel-left">

          <div className="garage-section-header">WEAPONS</div>
          <WeaponTable authToken={authToken} />

          {/* Saved configs (collapsible) */}
          <button
            className="garage-section-toggle"
            onClick={() => setConfigsOpen((v) => !v)}
          >
            {configsOpen ? '▾' : '▸'} SAVED CONFIGS
            {robots.length > 0 && <span className="garage-section-count">{robots.length}</span>}
          </button>

          {configsOpen && (
            <div className="garage-configs">
              <div className="garage-save-row">
                <input
                  className="garage-name-input"
                  placeholder="Name your loadout..."
                  value={saveName}
                  maxLength={40}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
                />
                <button
                  className="garage-btn"
                  onClick={() => void handleSave()}
                  disabled={saving || !saveName.trim()}
                >
                  {saving ? 'SAVING...' : 'SAVE'}
                </button>
              </div>
              {error && <p className="garage-error">{error}</p>}
              <div className="garage-list">
                {loading && <p className="garage-empty">Loading...</p>}
                {!loading && robots.length === 0 && (
                  <p className="garage-empty">No saved configs.</p>
                )}
                {robots.map((robot) => (
                  <div key={robot._id} className="garage-row">
                    <div className="garage-robot-info">
                      <span className="garage-robot-name">{robot.name}</span>
                      {robot.description && (
                        <span className="garage-robot-desc">{robot.description}</span>
                      )}
                    </div>
                    <div className="garage-row-actions">
                      <button className="garage-btn" onClick={() => handleLoad(robot)}>LOAD</button>
                      <button className="garage-btn garage-btn--danger" onClick={() => void handleDelete(robot._id)}>DEL</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bot script (collapsible) */}
          <button
            className="garage-section-toggle"
            onClick={() => setBotOpen((v) => !v)}
          >
            {botOpen ? '▾' : '▸'} BOT SCRIPT
            <BotStatusBadge />
          </button>

          {botOpen && <BotEditor />}
        </div>

        {/* Right panel: robot preview */}
        <div className="garage-panel-right">
          <RobotPreviewCanvas />
        </div>

      </div>
    </div>
  )
}
