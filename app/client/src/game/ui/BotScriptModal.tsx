/**
 * BotScriptModal — lets players author and activate a JS bot script.
 *
 * The script must define a function named `bot(state)` that returns a BotInput.
 * Example:
 *   function bot(state) {
 *     const goRight = state.enemyX > state.x;
 *     return { right: goRight, left: !goRight, fireGun: true };
 *   }
 *
 * The script is sent to the Web Worker sandbox for execution.
 * localStorage key `smp:botScript` persists the user's last script.
 */

import { useState } from 'react'

const STORAGE_KEY = 'smp:botScript'

const PLACEHOLDER = `// Bot script — define a function named bot(state) that returns a BotInput.
// state fields: x, y, enemyX, enemyY, health, enemyHealth, gunAmmo, laserCharges, isGrounded
// return fields: forward, backward, left, right, jump, fireGun, fireLaser (all optional booleans)
//   forward/backward = walk  |  left/right = rotate  |  fireGun = F key  |  fireLaser = L key

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
  onClose: () => void
  onInstall: (script: string) => void
  isActive: boolean
  workerError: string | null
}

export function BotScriptModal({ onClose, onInstall, isActive, workerError }: BotScriptModalProps) {
  const [script, setScript] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? PLACEHOLDER,
  )

  const handleInstall = () => {
    localStorage.setItem(STORAGE_KEY, script)
    onInstall(script)
  }

  return (
    <div className="garage-overlay" onClick={onClose}>
      <div className="garage-modal bot-modal" onClick={(e) => e.stopPropagation()}>

        <div className="garage-header">
          <span className="garage-title">BOT SCRIPT</span>
          <button className="garage-close" onClick={onClose}>✕</button>
        </div>

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
          <span className={`bot-status ${isActive ? 'bot-status--active' : ''}`}>
            {isActive ? (workerError ? 'ERROR' : 'ACTIVE') : 'INACTIVE'}
          </span>
          <button className="garage-btn" onClick={handleInstall}>
            INSTALL &amp; RUN
          </button>
        </div>

      </div>
    </div>
  )
}
