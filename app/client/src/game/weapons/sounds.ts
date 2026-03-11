/**
 * Synthesised weapon sound effects using the Web Audio API.
 * A single AudioContext is created lazily on first use (browsers require
 * it to be created after a user gesture).
 *
 * Non-positional variants play from the local player's perspective (listener
 * and source coincide). Positional (*At) variants route through a PannerNode
 * so remote weapon events attenuate with distance.
 */
let _ctx: AudioContext | null = null

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') void _ctx.resume()
  return _ctx
}

// ── Listener ──────────────────────────────────────────────────────────────────

/** Update the Web Audio listener position to follow the local robot each frame. */
export function updateListenerPosition(x: number, y: number, z: number): void {
  const c = ctx()
  c.listener.positionX.value = x
  c.listener.positionY.value = y
  c.listener.positionZ.value = z
}

// ── Panner helper ─────────────────────────────────────────────────────────────

/**
 * Creates an HRTF PannerNode anchored at a world-space position.
 * Used for remote-player sounds so they attenuate with distance from the listener.
 */
function createPanner(x: number, y: number, z: number): PannerNode {
  const c = ctx()
  const p = c.createPanner()
  p.panningModel  = 'HRTF'
  p.distanceModel = 'inverse'
  p.refDistance   = 3
  p.rolloffFactor = 1.5
  p.positionX.value = x
  p.positionY.value = y
  p.positionZ.value = z
  return p
}

// ── Local (non-positional) sounds ─────────────────────────────────────────────

/** Short percussive noise burst — kinetic gun shot. */
export function playGunShot(): void {
  const c   = ctx()
  const len = Math.floor(c.sampleRate * 0.08)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    // White noise with exponential decay envelope
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
  }
  const src  = c.createBufferSource()
  src.buffer = buf
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.55, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.08)
  src.connect(gain)
  gain.connect(c.destination)
  src.start()
}

/** Three rapid staggered noise bursts — shotgun triple discharge. */
export function playShotgunShot(): void {
  const c = ctx()
  for (let i = 0; i < 3; i++) {
    const delay = i * 0.025
    const len   = Math.floor(c.sampleRate * 0.07)
    const buf   = c.createBuffer(1, len, c.sampleRate)
    const data  = buf.getChannelData(0)
    for (let j = 0; j < len; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2)
    }
    const src  = c.createBufferSource()
    src.buffer = buf
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.45, c.currentTime + delay)
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + delay + 0.07)
    src.connect(gain)
    gain.connect(c.destination)
    src.start(c.currentTime + delay)
  }
}

/** Low sine rumble — rocket launch. */
export function playRocketShot(): void {
  const c    = ctx()
  const osc  = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(90, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.4)
  gain.gain.setValueAtTime(0.6, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.4)
}

/** Descending sawtooth sweep — laser zap. */
export function playLaserShot(): void {
  const c   = ctx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(1600, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.28)
  gain.gain.setValueAtTime(0.28, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.28)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.28)
}

/** High-pitched descending sawtooth — sniper beam (distinct from laser). */
export function playSniperShot(): void {
  const c    = ctx()
  const osc  = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(3200, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(440, c.currentTime + 0.35)
  gain.gain.setValueAtTime(0.22, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.35)
}

/** Short high ping — weapon hit confirmation. */
export function playHitConfirm(): void {
  const c   = ctx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1800, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.12)
  gain.gain.setValueAtTime(0.2, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.12)
}

// ── Positional (remote-player) sounds ─────────────────────────────────────────
// Called when receiving opponent weapon events over the network so the sound
// attenuates based on distance between the two robots.

export function playGunShotAt(x: number, y: number, z: number): void {
  const c    = ctx()
  const len  = Math.floor(c.sampleRate * 0.08)
  const buf  = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
  }
  const src    = c.createBufferSource()
  src.buffer   = buf
  const gain   = c.createGain()
  gain.gain.setValueAtTime(0.55, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.08)
  const panner = createPanner(x, y, z)
  src.connect(gain)
  gain.connect(panner)
  panner.connect(c.destination)
  src.start()
}

export function playShotgunShotAt(x: number, y: number, z: number): void {
  const c      = ctx()
  const panner = createPanner(x, y, z)
  for (let i = 0; i < 3; i++) {
    const delay = i * 0.025
    const len   = Math.floor(c.sampleRate * 0.07)
    const buf   = c.createBuffer(1, len, c.sampleRate)
    const data  = buf.getChannelData(0)
    for (let j = 0; j < len; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2)
    }
    const src  = c.createBufferSource()
    src.buffer = buf
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.45, c.currentTime + delay)
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + delay + 0.07)
    src.connect(gain)
    gain.connect(panner)
    panner.connect(c.destination)
    src.start(c.currentTime + delay)
  }
}

export function playRocketShotAt(x: number, y: number, z: number): void {
  const c      = ctx()
  const osc    = c.createOscillator()
  const gain   = c.createGain()
  const panner = createPanner(x, y, z)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(90, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.4)
  gain.gain.setValueAtTime(0.6, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4)
  osc.connect(gain)
  gain.connect(panner)
  panner.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.4)
}

export function playLaserShotAt(x: number, y: number, z: number): void {
  const c      = ctx()
  const osc    = c.createOscillator()
  const gain   = c.createGain()
  const panner = createPanner(x, y, z)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(1600, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.28)
  gain.gain.setValueAtTime(0.28, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.28)
  osc.connect(gain)
  gain.connect(panner)
  panner.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.28)
}

export function playSniperShotAt(x: number, y: number, z: number): void {
  const c      = ctx()
  const osc    = c.createOscillator()
  const gain   = c.createGain()
  const panner = createPanner(x, y, z)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(3200, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(440, c.currentTime + 0.35)
  gain.gain.setValueAtTime(0.22, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35)
  osc.connect(gain)
  gain.connect(panner)
  panner.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.35)
}

export function playHitConfirmAt(x: number, y: number, z: number): void {
  const c      = ctx()
  const osc    = c.createOscillator()
  const gain   = c.createGain()
  const panner = createPanner(x, y, z)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1800, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.12)
  gain.gain.setValueAtTime(0.2, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12)
  osc.connect(gain)
  gain.connect(panner)
  panner.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.12)
}

// ── Ambient ───────────────────────────────────────────────────────────────────

/**
 * Starts a low 80 Hz sine hum to give the arena ambience.
 * Returns a stop callback — call it on component unmount to silence the hum.
 */
export function startAmbientHum(): () => void {
  const c    = ctx()
  const osc  = c.createOscillator()
  const gain = c.createGain()
  osc.type        = 'sine'
  osc.frequency.value = 80
  gain.gain.value = 0.03
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  return () => { try { osc.stop() } catch { /* already stopped */ } }
}
