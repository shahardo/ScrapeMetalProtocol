import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { GameCanvas } from './game/GameCanvas'
import { ScoreboardModal } from './game/ui/ScoreboardModal'
import { AdminConsole } from './game/ui/AdminConsole'
import { AuthModal } from './auth/AuthModal'
import { useAuth } from './auth/useAuth'
import { useGameStore } from './store/gameStore'

export function App() {
  const auth = useAuth()
  const matchStatus = useGameStore((s) => s.matchStatus)
  const credits     = useGameStore((s) => s.credits)
  const isMatched   = matchStatus === 'matched'

  const [garageOpen,    setGarageOpen]    = useState(false)
  const [scoreOpen,     setScoreOpen]     = useState(false)
  const [adminOpen,     setAdminOpen]     = useState(false)

  // Mirror bot state from GameCanvas so we can render the BOT RUN/STOP in the top HUD.
  const [botInstalled, setBotInstalled] = useState(false)
  const [botActive,    setBotActive]    = useState(false)
  const botStartRef = useRef<() => void>(() => {})
  const botStopRef  = useRef<() => void>(() => {})
  const handleBotStateChange = useCallback(
    (isInstalled: boolean, isActive: boolean, startBot: () => void, stopBot: () => void) => {
      setBotInstalled(isInstalled)
      setBotActive(isActive)
      botStartRef.current = startBot
      botStopRef.current  = stopBot
    },
    [],
  )

  // Close garage automatically if a match starts mid-browse.
  useEffect(() => { if (isMatched) setGarageOpen(false) }, [isMatched])

  // Keyboard shortcuts (only when logged in and not in a match)
  useEffect(() => {
    if (!auth.user) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG' && !isMatched) setGarageOpen((v) => !v)
      if (e.code === 'KeyT') setScoreOpen((v)  => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [auth.user, isMatched])

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
            <button
              className="hud-garage-btn hud-garage-btn--primary"
              onClick={() => setGarageOpen(true)}
              disabled={isMatched}
              title={isMatched ? 'Garage locked during match' : undefined}
            >
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
            {botInstalled && (
              <button
                className={`hud-garage-btn hud-bot-toggle${botActive ? ' hud-bot-toggle--active' : ''}`}
                onClick={botActive ? () => botStopRef.current() : () => botStartRef.current()}
              >
                {botActive ? '■ BOT STOP' : '▶ BOT RUN'}
              </button>
            )}
          </div>
        </div>
        <div className="hud-right">
          <span className="hud-pilot">
            PILOT: <strong>{auth.user.username}</strong>
            {auth.user.isAdmin && <span className="hud-admin-tag"> [ADMIN]</span>}
          </span>
          <span className="hud-credits">{credits} ¢</span>
          <button className="hud-garage-btn hud-logout-btn" onClick={auth.logout}>LOGOUT</button>
          <span className="hud-controls">
            W/S — Walk&nbsp;&nbsp;|&nbsp;&nbsp;A/D — Rotate&nbsp;&nbsp;|&nbsp;&nbsp;Space — Jump<br></br>↑↓←→ — Camera&nbsp;&nbsp;|&nbsp;&nbsp;Q — Left weapon&nbsp;&nbsp;|&nbsp;&nbsp;E — Right weapon
          </span>
        </div>
      </div>

      {/* ── Main game canvas ─────────────────────────────────────────────── */}
      <GameCanvas
        authToken={auth.user.token}
        userId={auth.user.userId}
        credits={auth.user.credits}
        garageOpen={garageOpen}
        onGarageClose={() => setGarageOpen(false)}
        onBotStateChange={handleBotStateChange}
      />

      {/* ── Modals (GarageModal is rendered inside GameCanvas with bot props) */}
      {scoreOpen    && <ScoreboardModal onClose={() => setScoreOpen(false)} />}
      {adminOpen && auth.user.isAdmin && (
        <AdminConsole token={auth.user.token} onClose={() => setAdminOpen(false)} />
      )}
    </div>
  )
}
