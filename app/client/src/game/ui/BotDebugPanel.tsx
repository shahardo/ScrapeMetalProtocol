/**
 * BotDebugPanel — collapsible HUD showing the last state/input pair sent to
 * the bot worker. Polls at 10 Hz via setInterval to avoid per-frame React
 * state updates. Visible only when isBotActive is true.
 */

import { useEffect, useRef, useState } from 'react'
import type { BotDebugSnapshot } from '../bot/useBotWorker'

interface BotDebugPanelProps {
  isBotActive:  boolean
  workerError:  string | null
  debugRef:     React.RefObject<BotDebugSnapshot | null>
}

export function BotDebugPanel({ isBotActive, workerError, debugRef }: BotDebugPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [snapshot,  setSnapshot]  = useState<BotDebugSnapshot | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll the ref at 10 Hz; only run when active.
  useEffect(() => {
    if (!isBotActive) {
      setSnapshot(null)
      return
    }
    intervalRef.current = setInterval(() => {
      if (debugRef.current) setSnapshot({ ...debugRef.current })
    }, 100)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isBotActive, debugRef])

  if (!isBotActive) return null

  return (
    <div className="bot-debug-panel">
      <button
        className="bot-debug-header"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span>BOT DEBUG</span>
        <span className={`bot-debug-chevron${collapsed ? ' bot-debug-chevron--closed' : ''}`}>▾</span>
      </button>

      {!collapsed && (
        <div className="bot-debug-body">
          {workerError ? (
            <pre className="bot-debug-error">{workerError}</pre>
          ) : snapshot ? (
            <>
              <p className="bot-debug-section">STATE</p>
              <pre className="bot-debug-pre">{JSON.stringify(snapshot.state, null, 2)}</pre>
              <p className="bot-debug-section">INPUT</p>
              <pre className="bot-debug-pre">{JSON.stringify(snapshot.input, null, 2)}</pre>
            </>
          ) : (
            <p className="bot-debug-empty">Waiting for first tick…</p>
          )}
        </div>
      )}
    </div>
  )
}
