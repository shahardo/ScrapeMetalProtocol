import { useEffect, useRef, useState } from 'react'
import type { GarageRobot, RobotPart, PartType } from '../../types/game'

const API = 'http://localhost:3001'

// ── Default robot config saved when the user clicks "Save Current" ────────────
// Reflects the current RobotEntity layout. In Sprint 9+ the Garage editor will
// let players customise parts; for now we persist the baseline build.
const DEFAULT_PARTS: RobotPart[] = [
  { id: 'chassis', type: 'chassis' as PartType, health: 100, maxHealth: 100, weight: 30, armor: 10, isDetached: false },
  { id: 'head',    type: 'head'    as PartType, health: 100, maxHealth: 100, weight: 5,  armor: 5,  isDetached: false },
  { id: 'arm-l',   type: 'arm-left'  as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false },
  { id: 'arm-r',   type: 'arm-right' as PartType, health: 100, maxHealth: 100, weight: 8,  armor: 3,  isDetached: false },
]

// ── Persistent user identity ──────────────────────────────────────────────────
// No auth yet (Sprint 9+). A random UUID is generated once and stored in
// localStorage so garage data persists across browser sessions on the same machine.
function getUserId(): string {
  const key = 'smp:userId'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GarageModalProps {
  onClose: () => void
}

export function GarageModal({ onClose }: GarageModalProps) {
  const userId = useRef(getUserId())

  const [robots,   setRobots]   = useState<GarageRobot[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saving,   setSaving]   = useState(false)

  // ── Load saved robots ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`${API}/garage/${userId.current}`)
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
  }, [])

  // ── Save current robot ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API}/garage/${userId.current}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), parts: DEFAULT_PARTS }),
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

  // ── Delete robot ─────────────────────────────────────────────────────────────
  const handleDelete = async (robotId: string) => {
    setError(null)
    try {
      const res = await fetch(`${API}/garage/${userId.current}/${robotId}`, { method: 'DELETE' })
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
              <button className="garage-btn garage-btn--danger" onClick={() => void handleDelete(robot._id)}>
                DELETE
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
