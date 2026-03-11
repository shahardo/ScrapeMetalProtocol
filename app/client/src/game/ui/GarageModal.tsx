import { useEffect, useState } from 'react'
import type { GarageRobot, RobotPart, PartType, WeaponType } from '../../types/game'
import { useGameStore } from '../../store/gameStore'
import { BotScriptModal } from './BotScriptModal'
import { WeaponTable } from './WeaponTable'
import { WEAPON_LABEL } from '../weapons/weaponRegistry'

const API = 'http://localhost:3001'

type GarageTab = 'weapons' | 'bot'

/** Builds the parts array from the current store weapon loadout. */
function buildParts(leftWeapon: WeaponType, rightWeapon: WeaponType): RobotPart[] {
  return [
    { id: 'chassis', type: 'chassis'   as PartType, health: 100, maxHealth: 100, weight: 30, armor: 10, isDetached: false },
    { id: 'head',    type: 'head'      as PartType, health: 100, maxHealth: 100, weight: 5,  armor: 5,  isDetached: false },
    { id: 'arm-l',   type: 'arm-left'  as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false, weaponSlot: leftWeapon },
    { id: 'arm-r',   type: 'arm-right' as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false, weaponSlot: rightWeapon },
  ]
}

/** Generates a short description summarising the weapon loadout. Exported for testing. */
export function buildDescription(leftWeapon: WeaponType, rightWeapon: WeaponType): string {
  return `Q: ${WEAPON_LABEL[leftWeapon]} / E: ${WEAPON_LABEL[rightWeapon]}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface GarageModalProps {
  onClose: () => void
  /** Authenticated user's DB id — used as the garage partition key. */
  userId: string
  /** Bot state — passed from GameCanvas which owns useBotWorker. */
  isBotInstalled: boolean
  isBotActive: boolean
  workerError: string | null
  onInstallBot: (script: string) => void
  onStartBot: () => void
  onStopBot: () => void
}

export function GarageModal({ onClose, userId, isBotInstalled, isBotActive, workerError, onInstallBot, onStartBot, onStopBot }: GarageModalProps) {

  const [tab,      setTab]      = useState<GarageTab>('weapons')
  const [robots,   setRobots]   = useState<GarageRobot[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saving,   setSaving]   = useState(false)

  const { setLeftArmWeapon, setRightArmWeapon } = useGameStore()

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
      setError(e instanceof Error ? e.message : 'Failed to save robot')
    } finally {
      setSaving(false)
    }
  }

  // ── Load robot — restores weapon loadout from a saved config ─────────────────
  const handleLoad = (robot: GarageRobot) => {
    const leftArm  = robot.parts.find((p) => p.type === 'arm-left')
    const rightArm = robot.parts.find((p) => p.type === 'arm-right')
    // Cast needed: JSON deserialization returns string, not narrowed WeaponType
    if (leftArm?.weaponSlot)  setLeftArmWeapon(leftArm.weaponSlot as WeaponType)
    if (rightArm?.weaponSlot) setRightArmWeapon(rightArm.weaponSlot as WeaponType)
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

        {/* ── Header with tabs ─────────────────────────────────────────── */}
        <div className="garage-header">
          <div className="garage-tabs">
            <button
              className={`garage-tab${tab === 'weapons' ? ' garage-tab--active' : ''}`}
              onClick={() => setTab('weapons')}
            >WEAPONS</button>
            <button
              className={`garage-tab${tab === 'bot' ? ' garage-tab--active' : ''}`}
              onClick={() => setTab('bot')}
            >
              BOT SCRIPT
              {isBotActive && <span className="garage-tab-badge">RUN</span>}
              {!isBotActive && isBotInstalled && <span className="garage-tab-badge garage-tab-badge--ready">RDY</span>}
            </button>
          </div>
          <button className="garage-close" onClick={onClose}>✕</button>
        </div>

        {/* ── WEAPONS tab ──────────────────────────────────────────────── */}
        {tab === 'weapons' && (
          <>
            {/* Weapon table: 3-D preview + stats + slot select */}
            <WeaponTable
              onSelectLeft={setLeftArmWeapon}
              onSelectRight={setRightArmWeapon}
            />

            {/* Save current robot */}
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

            {error && <p className="garage-error">{error}</p>}

            {/* Robot list */}
            <div className="garage-list">
              {loading && <p className="garage-empty">Loading...</p>}
              {!loading && robots.length === 0 && (
                <p className="garage-empty">No saved robots. Save your first build above.</p>
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
                    <button className="garage-btn garage-btn--danger" onClick={() => void handleDelete(robot._id)}>DELETE</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── BOT SCRIPT tab ───────────────────────────────────────────── */}
        {tab === 'bot' && (
          // BotScriptModal renders its own inner layout; we pass it inline
          // (no overlay — the garage modal is already the overlay).
          <BotScriptModal
            inline
            onInstall={onInstallBot}
            onStart={onStartBot}
            onStop={onStopBot}
            isInstalled={isBotInstalled}
            isActive={isBotActive}
            workerError={workerError}
          />
        )}

      </div>
    </div>
  )
}
