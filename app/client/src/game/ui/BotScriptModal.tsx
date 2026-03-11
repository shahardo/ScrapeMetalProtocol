/**
 * BotScriptModal — lets players author and activate a JS bot script.
 *
 * When `inline` is true the component renders without its own overlay/header
 * so it can live inside the Garage modal's BOT SCRIPT tab.
 */

import { useState } from 'react'

const STORAGE_KEY = 'smp:botScript'

const PLACEHOLDER = `// Bot script — define a function named bot(state) that returns a BotInput.
// state fields: x, y, enemyX, enemyY, health, enemyHealth, gunAmmo, laserCharges, isGrounded
// return fields: forward, backward, left, right, jump, fireGun, fireLaser (all optional booleans)
//   forward/backward = walk  |  left/right = rotate  |  fireGun = E key  |  fireLaser = Q key

function bot(state) {
  const goRight = state.enemyX > state.x;
  const inRange = Math.abs(state.enemyX - state.x) < 6;
  return {
    forward: true,          // always walk forward
    right: goRight,         // rotate toward enemy
    left: !goRight,
    jump: state.isGrounded && Math.random() < 0.02,
    fireGun: inRange,
    fireLaser: inRange && state.laserCharges > 0,
  };
}`

interface BotScriptModalProps {
  onInstall: (script: string) => void
  onStart: () => void
  onStop: () => void
  isInstalled: boolean
  isActive: boolean
  workerError: string | null
  /** When true renders without an outer overlay or its own close button. */
  inline?: boolean
  /** Only used in standalone (non-inline) mode. */
  onClose?: () => void
}

export function BotScriptModal({ onInstall, onStart, onStop, isInstalled, isActive, workerError, inline, onClose }: BotScriptModalProps) {
  const [script, setScript] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? PLACEHOLDER,
  )

  const handleInstall = () => {
    localStorage.setItem(STORAGE_KEY, script)
    onInstall(script)
  }

  const statusLabel = isActive
    ? (workerError ? 'ERROR' : 'RUNNING')
    : isInstalled ? 'READY' : 'NOT LOADED'

  const body = (
    <>
      <p className="bot-instructions">
        Define <code>function bot(state)</code> returning movement flags.
        Runs in an isolated Web Worker — no DOM, no network access.
      </p>

      <textarea
        className="bot-editor"
        value={script}
        onChange={(e) => setScript(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
      />

      {workerError && (
        <p className="garage-error bot-error">{workerError}</p>
      )}

      <div className="garage-save-row">
        <span className={`bot-status ${isActive ? 'bot-status--active' : isInstalled ? 'bot-status--ready' : ''}`}>
          {statusLabel}
        </span>
        <div className="bot-action-btns">
          <button className="garage-btn" onClick={handleInstall}>
            INSTALL
          </button>
          {isActive ? (
            <button className="garage-btn garage-btn--danger" onClick={onStop}>
              STOP BOT
            </button>
          ) : (
            <button
              className="garage-btn garage-btn--start"
              onClick={onStart}
              disabled={!isInstalled}
              title={!isInstalled ? 'Install a script first' : 'Start the bot'}
            >
              START BOT
            </button>
          )}
        </div>
      </div>
    </>
  )

  if (inline) return <div className="bot-inline">{body}</div>

  return (
    <div className="garage-overlay" onClick={onClose}>
      <div className="garage-modal bot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="garage-header">
          <span className="garage-title">BOT SCRIPT</span>
          <button className="garage-close" onClick={onClose}>✕</button>
        </div>
        {body}
      </div>
    </div>
  )
}
