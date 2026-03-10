/**
 * useBotWorker — React hook that manages the bot sandbox Web Worker lifecycle.
 *
 * Usage:
 *   const { installScript, latestInput, workerError, isActive } = useBotWorker()
 *   // Each frame: call tick(state) to get the bot's current input
 *
 * The Worker is created once and lives for the component's lifetime.
 * installScript() compiles and installs a new user script.
 * The hook merges the latest bot input so the game loop can read it via a ref.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BotState, BotInput, BotWorkerResult } from '../../types/bot'

// Import the worker source as a raw string so we can blob-URL it.
// Vite's ?worker suffix handles this automatically.
import BotWorkerClass from './botWorker?worker'

export interface UseBotWorkerReturn {
  /** True when a script is installed and the worker is running. */
  isActive: boolean
  /** Last error message from the worker (compile or runtime). Cleared on new install. */
  workerError: string | null
  /** Compile and install a new bot script. Clears any previous error. */
  installScript: (script: string) => void
  /**
   * Send a tick to the worker. Returns immediately (async result arrives via
   * onmessage). The game loop should read `latestInputRef` each frame instead
   * of awaiting a Promise to stay off the critical path.
   */
  sendTick: (state: BotState) => void
  /**
   * Ref containing the most recently received BotInput from the worker.
   * Read this in useFrame — it never causes a re-render.
   */
  latestInputRef: React.RefObject<BotInput>
}

export function useBotWorker(): UseBotWorkerReturn {
  const workerRef      = useRef<Worker | null>(null)
  const latestInputRef = useRef<BotInput>({})
  const tickIdRef      = useRef(0)

  const [isActive,    setIsActive]    = useState(false)
  const [workerError, setWorkerError] = useState<string | null>(null)

  // Spawn the worker once on mount.
  useEffect(() => {
    const worker = new BotWorkerClass()

    worker.onmessage = (evt: MessageEvent<BotWorkerResult>) => {
      const msg = evt.data
      if (msg.type === 'tick' && msg.tickId !== -1) {
        latestInputRef.current = msg.input
      } else if (msg.type === 'error') {
        setWorkerError(msg.message)
        // Reset input so the robot stops moving on error
        latestInputRef.current = {}
      }
    }

    worker.onerror = (err: ErrorEvent) => {
      setWorkerError(`Worker error: ${err.message}`)
      latestInputRef.current = {}
    }

    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const installScript = useCallback((script: string) => {
    if (!workerRef.current) return
    setWorkerError(null)
    latestInputRef.current = {}
    workerRef.current.postMessage({ type: 'install', script })
    setIsActive(true)
  }, [])

  const sendTick = useCallback((state: BotState) => {
    if (!workerRef.current || !isActive) return
    tickIdRef.current += 1
    workerRef.current.postMessage({ type: 'tick', tickId: tickIdRef.current, state })
  }, [isActive])

  return { isActive, workerError, installScript, sendTick, latestInputRef }
}
