import { useEffect, useState } from 'react'
import './App.css'
import { GameCanvas } from './game/GameCanvas'
import { GarageModal } from './game/ui/GarageModal'
import { ScoreboardModal } from './game/ui/ScoreboardModal'
import { AdminConsole } from './game/ui/AdminConsole'
import { AuthModal } from './auth/AuthModal'
import { useAuth } from './auth/useAuth'
import { useGameStore } from './store/gameStore'

/**
 * Top-level view state machine:
 *   'garage' — Full-screen hangar. Player configures loadout and bot, then clicks DEPLOY.
 *   'arena'  — Game canvas active. After match ends, auto-returns to 'garage'.
 */
type AppView = 'garage' | 'arena'

export function App() {
  const auth    = useAuth()
  const credits = useGameStore((s) => s.credits)

  const [view,      setView]      = useState<AppView>('garage')
  const [scoreOpen, setScoreOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  // Seed store credits from the value loaded at login
  const setCredits = useGameStore((s) => s.setCredits)
  useEffect(() => {
    if (auth.user) setCredits(auth.user.credits ?? 0)
  }, [auth.user, setCredits])

  // Keyboard shortcuts (T for scoreboard, available in both views)
  useEffect(() => {
    if (!auth.user) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyT') setScoreOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [auth.user])

  // ── Not logged in → show auth modal ──────────────────────────────────────
  if (!auth.user) {
    return (
      <div className="game-wrapper">
        <AuthModal onLogin={auth.login} onRegister={auth.register} />
      </div>
    )
  }

  return (
    <div className="game-wrapper">

      {/* ── Garage view — full-screen hangar ──────────────────────────────── */}
      {view === 'garage' && (
        <>
          <GarageModal
            userId={auth.user.userId}
            authToken={auth.user.token}
            onDeploy={() => setView('arena')}
          />
          {/* Minimal utility bar overlaid on the garage (top-right) */}
          <div className="hud hud--garage-overlay">
            <div className="hud-right">
              <span className="hud-pilot">
                PILOT: <strong>{auth.user.username}</strong>
                {auth.user.isAdmin && <span className="hud-admin-tag"> [ADMIN]</span>}
              </span>
              <span className="hud-credits">{credits} ¢</span>
              <button className="hud-garage-btn" onClick={() => setScoreOpen(true)}>
                SCORES [T]
              </button>
              {auth.user.isAdmin && (
                <button className="hud-garage-btn hud-garage-btn--admin" onClick={() => setAdminOpen(true)}>
                  ADMIN
                </button>
              )}
              <button className="hud-garage-btn hud-logout-btn" onClick={auth.logout}>LOGOUT</button>
            </div>
          </div>
        </>
      )}

      {/* ── Arena view — game canvas ──────────────────────────────────────── */}
      {view === 'arena' && (
        <>
          <div className="hud">
            <div className="hud-left">
              <span className="hud-title">Scrap Metal Protocol — v0.1</span>
            </div>
            <div className="hud-right">
              <span className="hud-pilot">
                PILOT: <strong>{auth.user.username}</strong>
                {auth.user.isAdmin && <span className="hud-admin-tag"> [ADMIN]</span>}
              </span>
              <span className="hud-credits">{credits} ¢</span>
              <button className="hud-garage-btn" onClick={() => setScoreOpen(true)}>
                SCORES [T]
              </button>
              {auth.user.isAdmin && (
                <button className="hud-garage-btn hud-garage-btn--admin" onClick={() => setAdminOpen(true)}>
                  ADMIN
                </button>
              )}
              <button className="hud-garage-btn hud-logout-btn" onClick={auth.logout}>LOGOUT</button>
              <span className="hud-controls">
                W/S — Walk&nbsp;|&nbsp;A/D — Rotate&nbsp;|&nbsp;Space — Jump<br />
                ↑↓←→ — Camera&nbsp;|&nbsp;Q — Left weapon&nbsp;|&nbsp;E — Right weapon
              </span>
            </div>
          </div>

          <GameCanvas
            authToken={auth.user.token}
            userId={auth.user.userId}
            credits={auth.user.credits}
            onReturnToGarage={() => setView('garage')}
          />
        </>
      )}

      {/* ── Global modals ─────────────────────────────────────────────────── */}
      {scoreOpen && <ScoreboardModal onClose={() => setScoreOpen(false)} />}
      {adminOpen && auth.user.isAdmin && (
        <AdminConsole token={auth.user.token} onClose={() => setAdminOpen(false)} />
      )}
    </div>
  )
}
