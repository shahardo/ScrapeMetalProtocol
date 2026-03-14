/**
 * useBotWorker — manages the bot sandbox Web Worker lifecycle.
 *
 * On mount, auto-installs any script that was written in the Garage
 * (read from gameStore.botScript) so the bot is ready as soon as the arena loads.
 *
 * Bot lifecycle:
 *   - Script is authored and validated in GarageModal (main thread, no worker needed).
 *   - When GameCanvas mounts (arena), this hook installs the stored script into
 *     the sandbox worker automatically.
 *   - startBot() / stopBot() toggle whether the bot is actively feeding input.
 *   - The arena HUD RUN/STOP button drives these calls.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BotState, BotInput, BotWorkerResult } from '../../types/bot'
import { useGameStore } from '../../store/gameStore'

import BotWorkerClass from './botWorker?worker'

export interface BotDebugSnapshot {
  state: BotState
  input: BotInput
}

export interface UseBotWorkerReturn {
  /** True when the bot is actively running (ticks being sent). */
  isActive: boolean
  /** Last error message from the worker (compile or runtime). */
  workerError: string | null
  /** Start the bot running. Requires a valid script in the store. */
  startBot: () => void
  /** Deactivate the bot — stops feeding input to RobotEntity. */
  stopBot: () => void
  /** Last state+input pair for the debug panel. Updated on every tick reply. */
  debugRef: React.RefObject<BotDebugSnapshot | null>
  /**
   * Send a tick to the worker. The game loop reads `latestInputRef` each frame
   * rather than awaiting a Promise to stay off the critical path.
   */
  sendTick: (state: BotState) => void
  /** Most recently received BotInput from the worker. Read in useFrame. */
  latestInputRef: React.RefObject<BotInput>
}

export function useBotWorker(): UseBotWorkerReturn {
  const workerRef      = useRef<Worker | null>(null)
  const latestInputRef = useRef<BotInput>({})
  const debugRef       = useRef<BotDebugSnapshot | null>(null)
  const tickIdRef      = useRef(0)
  const lastStateRef   = useRef<BotState | null>(null)

  const [isActive,    setIsActive]    = useState(false)
  const [workerError, setWorkerError] = useState<string | null>(null)

  // Spawn the worker on mount; auto-install any script already authored in the Garage.
  useEffect(() => {
    const worker = new BotWorkerClass()

    worker.onmessage = (evt: MessageEvent<BotWorkerResult>) => {
      const msg = evt.data
      if (msg.type === 'tick' && msg.tickId !== -1) {
        latestInputRef.current = msg.input
        if (lastStateRef.current) {
          debugRef.current = { state: lastStateRef.current, input: msg.input }
        }
      } else if (msg.type === 'error') {
        setWorkerError(msg.message)
        latestInputRef.current = {}
      }
    }

    worker.onerror = (err: ErrorEvent) => {
      setWorkerError(`Worker error: ${err.message}`)
      latestInputRef.current = {}
    }

    workerRef.current = worker

    // Auto-install the script that was authored in the Garage.
    const { botScript } = useGameStore.getState()
    if (botScript.trim()) {
      worker.postMessage({ type: 'install', script: botScript })
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const startBot = useCallback(() => {
    setIsActive(true)
    setWorkerError(null)
  }, [])

  const stopBot = useCallback(() => {
    latestInputRef.current = {}
    setIsActive(false)
    setWorkerError(null)
  }, [])

  const sendTick = useCallback((state: BotState) => {
    if (!workerRef.current || !isActive) return
    tickIdRef.current += 1
    lastStateRef.current = state
    workerRef.current.postMessage({ type: 'tick', tickId: tickIdRef.current, state })
  }, [isActive])

  return { isActive, workerError, startBot, stopBot, sendTick, latestInputRef, debugRef }
}
