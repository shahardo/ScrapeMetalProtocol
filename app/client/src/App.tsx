import './App.css'
import { GameCanvas } from './game/GameCanvas'

export function App() {
  return (
    <div className="game-wrapper">
      {/* ── HUD overlay ──────────────────────────────────────────────────── */}
      <div className="hud">
        <span className="hud-title">Scrap Metal Protocol — v0.1 MVP</span>
        <span className="hud-controls">
          WASD — Move / Jump&nbsp;&nbsp;|&nbsp;&nbsp;↑↓←→ — Rotate camera
        </span>
      </div>

      {/* ── Main game canvas ─────────────────────────────────────────────── */}
      <GameCanvas />
    </div>
  )
}
