import { useEffect, useState } from 'react'
import type { GarageRobot, RobotPart, PartType, WeaponType } from '../../types/game'
import { useGameStore } from '../../store/gameStore'
import { ALL_WEAPON_TYPES, WEAPON_LABEL } from '../weapons/weaponRegistry'

const API = 'http://localhost:3001'

/** Builds the parts array from the current store weapon loadout. */
function buildParts(leftWeapon: WeaponType, rightWeapon: WeaponType): RobotPart[] {
  return [
    { id: 'chassis', type: 'chassis'   as PartType, health: 100, maxHealth: 100, weight: 30, armor: 10, isDetached: false },
    { id: 'head',    type: 'head'      as PartType, health: 100, maxHealth: 100, weight: 5,  armor: 5,  isDetached: false },
    { id: 'arm-l',   type: 'arm-left'  as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false, weaponSlot: leftWeapon },
    { id: 'arm-r',   type: 'arm-right' as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false, weaponSlot: rightWeapon },
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GarageModalProps {
  onClose: () => void
  /** Authenticated user's DB id — used as the garage partition key. */
  userId: string
}

export function GarageModal({ onClose, userId }: GarageModalProps) {

  const [robots,   setRobots]   = useState<GarageRobot[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saving,   setSaving]   = useState(false)

  const { leftArmWeapon, rightArmWeapon, setLeftArmWeapon, setRightArmWeapon } = useGameStore()

  // ── Load saved robots ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`${API}/garage/${userId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`)
        return r.json() as Promise<{ robots: GarageRobot[] }>
      })
      .then(({ robots }) => { if (!cancelled) setRobots(robots) })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load garage')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [userId])

  // ── Save current robot ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API}/garage/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), parts: buildParts(leftArmWeapon, rightArmWeapon) }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { robot } = await res.json() as { robot: GarageRobot }
      setRobots((prev) => [robot, ...prev])
      setSaveName('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save robot')
    } finally {
      setSaving(false)
    }
  }

  // ── Load robot — restores weapon loadout from a saved config ─────────────────
  const handleLoad = (robot: GarageRobot) => {
    const leftArm  = robot.parts.find((p) => p.type === 'arm-left')
    const rightArm = robot.parts.find((p) => p.type === 'arm-right')
    if (leftArm?.weaponSlot)  setLeftArmWeapon(leftArm.weaponSlot)
    if (rightArm?.weaponSlot) setRightArmWeapon(rightArm.weaponSlot)
  }

  // ── Delete robot ─────────────────────────────────────────────────────────────
  const handleDelete = async (robotId: string) => {
    setError(null)
    try {
      const res = await fetch(`${API}/garage/${userId}/${robotId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setRobots((prev) => prev.filter((r) => r._id !== robotId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete robot')
    }
  }

  return (
    <div className="garage-overlay" onClick={onClose}>
      <div className="garage-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="garage-header">
          <span className="garage-title">GARAGE</span>
          <button className="garage-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Weapon loadout editor ────────────────────────────────────── */}
        <div className="garage-weapons">
          <span className="garage-section-label">WEAPON LOADOUT</span>
          <div className="garage-weapon-slots">
            <div className="garage-weapon-slot">
              <span className="garage-slot-label">L ARM (L key)</span>
              <div className="garage-slot-btns">
                {ALL_WEAPON_TYPES.map((w) => (
                  <button
                    key={w}
                    className={`garage-slot-btn${leftArmWeapon === w ? ' active' : ''} garage-slot-btn--${w}`}
                    onClick={() => setLeftArmWeapon(w)}
                    title={WEAPON_LABEL[w]}
                  >
                    {WEAPON_LABEL[w]}
                  </button>
                ))}
              </div>
            </div>
            <div className="garage-weapon-slot">
              <span className="garage-slot-label">R ARM (F key)</span>
              <div className="garage-slot-btns">
                {ALL_WEAPON_TYPES.map((w) => (
                  <button
                    key={w}
                    className={`garage-slot-btn${rightArmWeapon === w ? ' active' : ''} garage-slot-btn--${w}`}
                    onClick={() => setRightArmWeapon(w)}
                    title={WEAPON_LABEL[w]}
                  >
                    {WEAPON_LABEL[w]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Save current robot ───────────────────────────────────────── */}
        <div className="garage-save-row">
          <input
            className="garage-name-input"
            placeholder="Name your robot..."
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
            {saving ? 'SAVING...' : 'SAVE CURRENT'}
          </button>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && <p className="garage-error">{error}</p>}

        {/* ── Robot list ───────────────────────────────────────────────── */}
        <div className="garage-list">
          {loading && <p className="garage-empty">Loading...</p>}
          {!loading && robots.length === 0 && (
            <p className="garage-empty">No saved robots. Save your first build above.</p>
          )}
          {robots.map((robot) => (
            <div key={robot._id} className="garage-row">
              <span className="garage-robot-name">{robot.name}</span>
              <span className="garage-robot-meta">{robot.parts.length} parts</span>
              <div className="garage-row-actions">
                <button className="garage-btn" onClick={() => handleLoad(robot)}>LOAD</button>
                <button className="garage-btn garage-btn--danger" onClick={() => void handleDelete(robot._id)}>DELETE</button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
