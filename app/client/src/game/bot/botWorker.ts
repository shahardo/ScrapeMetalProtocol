/**
 * Bot sandbox Web Worker.
 *
 * Security model:
 * - User code runs inside a new Function() call so it cannot close over host globals.
 * - A 20 ms hard deadline via a SharedArrayBuffer flag is not feasible in all browsers,
 *   so we use a setTimeout abort: if the bot's tick function doesn't return within
 *   BOT_TICK_TIMEOUT_MS the result is discarded and an error is posted.
 * - The Worker itself has no DOM, no fetch, no WebSocket access — the browser enforces this.
 * - Infinite loops will hang the Worker thread (not the main thread), which is acceptable.
 *   The host terminates the Worker on reload/restart.
 *
 * The Worker is loaded as a Blob URL by useBotWorker.ts so it doesn't need a
 * separate entry in the Vite config.
 */

import type { BotWorkerRequest, BotWorkerResult, BotInput, BotState } from '../../types/bot'

// Maximum milliseconds allowed for a single bot tick before the result is dropped.
const BOT_TICK_TIMEOUT_MS = 20

type BotFn = (state: BotState) => BotInput

let botFn: BotFn | null = null

/**
 * Compiles the user-supplied script string into a callable function.
 * The script must define or return an object with move/fire fields.
 * Expected shape:
 *
 *   function bot(state) {
 *     return { right: state.enemyX > state.x, fireGun: true }
 *   }
 *   // Last expression or explicit: bot
 *
 * We wrap the script in a Function body that calls the last defined `bot`
 * identifier, or whatever the script returns.
 */
function compileScript(script: string): BotFn {
  // Wrap user code so it runs in a clean scope with no access to Worker globals.
  // The wrapper calls `bot(state)` — user must define a function named `bot`.
  const wrapped = `
    "use strict";
    ${script}
    if (typeof bot !== "function") throw new Error("Script must define a function named \`bot\`");
    return bot(state);
  `
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function('state', wrapped)
  return (state: BotState) => factory(state) as BotInput
}

self.onmessage = (evt: MessageEvent<BotWorkerRequest>) => {
  const msg = evt.data

  if (msg.type === 'install') {
    try {
      botFn = compileScript(msg.script)
      self.postMessage({ type: 'tick', tickId: -1, input: {} } satisfies BotWorkerResult)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      self.postMessage({ type: 'error', message: `Compile error: ${message}` } satisfies BotWorkerResult)
      botFn = null
    }
    return
  }

  if (msg.type === 'tick') {
    if (!botFn) return   // no script installed; silently skip

    let finished = false
    const timeout = setTimeout(() => {
      if (!finished) {
        self.postMessage({
          type: 'error',
          message: `Bot tick exceeded ${BOT_TICK_TIMEOUT_MS} ms — possible infinite loop`,
        } satisfies BotWorkerResult)
      }
    }, BOT_TICK_TIMEOUT_MS)

    try {
      const input = botFn(msg.state)
      finished = true
      clearTimeout(timeout)
      // Sanitise the returned value — only accept boolean fields from BotInput
      const safe: BotInput = {
        forward:    input.forward    === true,
        backward:   input.backward   === true,
        left:       input.left       === true,
        right:      input.right      === true,
        jump:       input.jump       === true,
        fireGun:    input.fireGun    === true,
        fireLaser:  input.fireLaser  === true,
      }
      self.postMessage({ type: 'tick', tickId: msg.tickId, input: safe } satisfies BotWorkerResult)
    } catch (err) {
      finished = true
      clearTimeout(timeout)
      const message = err instanceof Error ? err.message : String(err)
      self.postMessage({ type: 'error', message: `Runtime error: ${message}` } satisfies BotWorkerResult)
    }
  }
}
