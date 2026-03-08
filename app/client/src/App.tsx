import { useEffect, useState } from 'react'
import './App.css'
import { GameCanvas } from './game/GameCanvas'
import { GarageModal } from './game/ui/GarageModal'

export function App() {
  const [garageOpen, setGarageOpen] = useState(false)

  // G key toggles the garage modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG') setGarageOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="game-wrapper">
      {/* ── HUD overlay ──────────────────────────────────────────────────── */}
      <div className="hud">
        <div className="hud-left">
          <span className="hud-title">Scrap Metal Protocol — v0.1</span>
          <button className="hud-garage-btn" onClick={() => setGarageOpen(true)}>
            GARAGE [G]
          </button>
        </div>
        <span className="hud-controls">
          W/S — Walk&nbsp;&nbsp;|&nbsp;&nbsp;A/D — Rotate&nbsp;&nbsp;|&nbsp;&nbsp;Space — Jump&nbsp;&nbsp;|&nbsp;&nbsp;↑↓←→ — Camera&nbsp;&nbsp;|&nbsp;&nbsp;F — Gun&nbsp;&nbsp;|&nbsp;&nbsp;L — Laser
        </span>
      </div>

      {/* ── Main game canvas ─────────────────────────────────────────────── */}
      <GameCanvas />

      {/* ── Garage modal ─────────────────────────────────────────────────── */}
      {garageOpen && <GarageModal onClose={() => setGarageOpen(false)} />}
    </div>
  )
}
