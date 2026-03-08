import { useEffect, useState } from 'react'
import './App.css'
import { GameCanvas } from './game/GameCanvas'
import { GarageModal } from './game/ui/GarageModal'
import { ScoreboardModal } from './game/ui/ScoreboardModal'
import { AdminConsole } from './game/ui/AdminConsole'
import { AuthModal } from './auth/AuthModal'
import { useAuth } from './auth/useAuth'

export function App() {
  const auth = useAuth()

  const [garageOpen,    setGarageOpen]    = useState(false)
  const [scoreOpen,     setScoreOpen]     = useState(false)
  const [adminOpen,     setAdminOpen]     = useState(false)

  // Keyboard shortcuts (only when logged in)
  useEffect(() => {
    if (!auth.user) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG') setGarageOpen((v) => !v)
      if (e.code === 'KeyT') setScoreOpen((v)  => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [auth.user])

  // ── Not logged in → show auth modal ────────────────────────────────────────
  if (!auth.user) {
    return (
      <div className="game-wrapper">
        <AuthModal onLogin={auth.login} onRegister={auth.register} />
      </div>
    )
  }

  return (
    <div className="game-wrapper">
      {/* ── HUD overlay ──────────────────────────────────────────────────── */}
      <div className="hud">
        <div className="hud-left">
          <span className="hud-title">Scrap Metal Protocol — v0.1</span>
          <div className="hud-btn-row">
            <button className="hud-garage-btn" onClick={() => setGarageOpen(true)}>
              GARAGE [G]
            </button>
            <button className="hud-garage-btn" onClick={() => setScoreOpen(true)}>
              SCORES [T]
            </button>
            {auth.user.isAdmin && (
              <button className="hud-garage-btn hud-garage-btn--admin" onClick={() => setAdminOpen(true)}>
                ADMIN
              </button>
            )}
          </div>
        </div>
        <div className="hud-right">
          <span className="hud-pilot">
            PILOT: <strong>{auth.user.username}</strong>
            {auth.user.isAdmin && <span className="hud-admin-tag"> [ADMIN]</span>}
          </span>
          <button className="hud-garage-btn hud-logout-btn" onClick={auth.logout}>LOGOUT</button>
          <span className="hud-controls">
            W/S — Walk&nbsp;&nbsp;|&nbsp;&nbsp;A/D — Rotate&nbsp;&nbsp;|&nbsp;&nbsp;Space — Jump&nbsp;&nbsp;|&nbsp;&nbsp;↑↓←→ — Camera&nbsp;&nbsp;|&nbsp;&nbsp;F — Gun&nbsp;&nbsp;|&nbsp;&nbsp;L — Laser
          </span>
        </div>
      </div>

      {/* ── Main game canvas ─────────────────────────────────────────────── */}
      <GameCanvas authToken={auth.user.token} userId={auth.user.userId} />

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {garageOpen   && <GarageModal onClose={() => setGarageOpen(false)} />}
      {scoreOpen    && <ScoreboardModal onClose={() => setScoreOpen(false)} />}
      {adminOpen && auth.user.isAdmin && (
        <AdminConsole token={auth.user.token} onClose={() => setAdminOpen(false)} />
      )}
    </div>
  )
}
