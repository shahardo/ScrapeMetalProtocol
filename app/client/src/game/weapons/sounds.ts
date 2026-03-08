/**
 * Synthesised weapon sound effects using the Web Audio API.
 * A single AudioContext is created lazily on first use (browsers require
 * it to be created after a user gesture).
 */
let _ctx: AudioContext | null = null

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') void _ctx.resume()
  return _ctx
}

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
