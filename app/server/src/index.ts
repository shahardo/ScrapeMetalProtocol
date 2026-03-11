import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import mongoose from 'mongoose'
import { MatchmakingQueue } from './matchmaking.js'
import { garageRoutes }   from './routes/garage.js'
import { authRoutes }     from './routes/auth.js'
import { scoreRoutes }    from './routes/scores.js'
import { adminRoutes }    from './routes/admin.js'
import { creditsRoutes }  from './routes/credits.js'
import { tryVerifyToken } from './auth.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerInput {
  playerId: string
  tick: number
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
}

// Opaque relay payloads — the server never inspects SDP or ICE bodies.
interface WebRTCOfferPayload  { to: string; sdp: unknown }
interface WebRTCAnswerPayload { to: string; sdp: unknown }
interface WebRTCIcePayload    { to: string; candidate: unknown }

/** Entry broadcast to all sockets when the waiting-room lobby changes. */
export interface LobbyEntry {
  socketId: string
  username: string
}

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_PORT  = Number(process.env['PORT']) || 3001
const CLIENT_ORIGIN = process.env['CLIENT_URL'] ?? 'http://localhost:5173'
const MONGO_URI     = process.env['MONGO_URI']  ?? 'mongodb://127.0.0.1:27017/ScrapMetalDB'

// ── Server factory ────────────────────────────────────────────────────────────
// Exported so integration tests can call createServer(0) for a random port.

export async function createServer(port: number = DEFAULT_PORT): Promise<FastifyInstance> {
  // Silence the logger in tests (port 0 signals a test environment)
  const fastify = Fastify({ logger: port !== 0 })

  await fastify.register(cors, { origin: CLIENT_ORIGIN })

  // ── MongoDB (non-blocking — REST features return errors if unavailable) ────
  if (process.env['SKIP_MONGO'] !== '1') {
    mongoose.connect(MONGO_URI).then(() => {
      fastify.log.info('[SMP] MongoDB connected')
    }).catch((err: unknown) => {
      fastify.log.warn(`[SMP] MongoDB unavailable — auth/garage/scores disabled: ${String(err)}`)
    })
  }

  // ── REST endpoints ────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  await fastify.register(authRoutes)
  await fastify.register(garageRoutes)
  await fastify.register(scoreRoutes)
  await fastify.register(adminRoutes)
  await fastify.register(creditsRoutes)

  await fastify.listen({ port, host: '0.0.0.0' })

  // ── Socket.io (attach to Fastify's underlying HTTP server) ────────────────
  const io = new SocketIOServer(fastify.server as HttpServer, {
    cors: { origin: CLIENT_ORIGIN },
  })

  const queue = new MatchmakingQueue()

  // Tracks the display name of every connected socket.
  // Populated on 'authenticate'; falls back to short socket ID for guests.
  const socketNames = new Map<string, string>()

  // In-memory live scores for the current session — keyed by socketId.
  const liveScores = new Map<string, { username: string; score: number }>()

  // Countdown state — only one active countdown at a time.
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let countdownSeconds = 0
  const MATCH_COUNTDOWN_SECONDS = 5

  /** Push the current waiting-room list to every connected socket. */
  function broadcastLobby(): void {
    const waiting: LobbyEntry[] = queue.list().map((id) => ({
      socketId: id,
      username: socketNames.get(id) ?? `Pilot-${id.slice(0, 4)}`,
    }))
    io.emit('lobby_update', waiting)
  }

  /** Broadcast current live scores (sorted descending) to all sockets. */
  function broadcastLiveScores(): void {
    const sorted = [...liveScores.values()].sort((a, b) => b.score - a.score)
    io.emit('live_scores', sorted)
  }

  /** Emit the remaining countdown seconds to everyone still in the queue. */
  function broadcastCountdown(secondsLeft: number | null): void {
    queue.list().forEach((id) => {
      io.to(id).emit('match_countdown', { secondsLeft })
    })
  }

  /** Cancel the active countdown if fewer than 2 players remain queued. */
  function cancelCountdownIfNeeded(): void {
    if (queue.length >= 2 || countdownTimer === null) return
    clearInterval(countdownTimer)
    countdownTimer = null
    broadcastCountdown(null)
  }

  /**
   * Start a countdown before pairing the first two queued players.
   * No-op if a countdown is already running.
   */
  function startMatchCountdown(): void {
    if (countdownTimer !== null) return
    countdownSeconds = MATCH_COUNTDOWN_SECONDS
    broadcastCountdown(countdownSeconds)

    countdownTimer = setInterval(() => {
      countdownSeconds--
      broadcastCountdown(countdownSeconds)

      if (countdownSeconds > 0) return

      clearInterval(countdownTimer!)
      countdownTimer = null

      const pair = queue.tryPair()
      if (!pair) return

      const [playerA, playerB] = pair
      const roomId = `match::${playerA}::${playerB}`
      io.sockets.sockets.get(playerA)?.join(roomId)
      io.sockets.sockets.get(playerB)?.join(roomId)
      io.to(roomId).emit('match_found', { roomId, players: [playerA, playerB] })
      broadcastLobby()

      // Chain the next countdown if more players are still waiting.
      if (queue.length >= 2) startMatchCountdown()
    }, 1000)
  }

  io.on('connection', (socket) => {
    // ── Auth handshake ───────────────────────────────────────────────────────
    // Client sends its JWT immediately after connecting so the server can
    // associate a username with this socket for the lobby display.
    socket.on('authenticate', (token: string) => {
      const payload = tryVerifyToken(token)
      if (payload) {
        socketNames.set(socket.id, payload.username)
        socket.emit('authenticated', { username: payload.username, userId: payload.userId })
      }
    })

    // ── Matchmaking ──────────────────────────────────────────────────────────
    socket.on('join_queue', () => {
      const position = queue.join(socket.id)
      socket.emit('queue_joined', { position })
      broadcastLobby()

      // Start the countdown once 2+ players are waiting.
      // The actual pairing happens when the timer fires, not immediately.
      if (queue.length >= 2) startMatchCountdown()
    })

    socket.on('leave_queue', () => {
      queue.leave(socket.id)
      cancelCountdownIfNeeded()
      broadcastLobby()
    })

    // Skip the countdown and fire the match immediately (requires 2+ queued players).
    socket.on('skip_countdown', () => {
      if (!queue.list().includes(socket.id) || queue.length < 2) return
      if (countdownTimer !== null) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
      const pair = queue.tryPair()
      if (!pair) return
      const [playerA, playerB] = pair
      const roomId = `match::${playerA}::${playerB}`
      io.sockets.sockets.get(playerA)?.join(roomId)
      io.sockets.sockets.get(playerB)?.join(roomId)
      io.to(roomId).emit('match_found', { roomId, players: [playerA, playerB] })
      broadcastLobby()
      if (queue.length >= 2) startMatchCountdown()
    })

    // ── Live score reporting ──────────────────────────────────────────────────
    // Clients emit this whenever the local player's score changes.
    socket.on('score_update', (score: unknown) => {
      if (typeof score !== 'number' || score < 0 || !Number.isFinite(score)) return
      const username = socketNames.get(socket.id) ?? `Pilot-${socket.id.slice(0, 4)}`
      liveScores.set(socket.id, { username, score })
      broadcastLiveScores()
    })

    // ── Input relay ──────────────────────────────────────────────────────────
    socket.on('player_input', (input: PlayerInput) => {
      const matchRoom = [...socket.rooms].find((r) => r.startsWith('match::'))
      if (!matchRoom) return
      socket.to(matchRoom).emit('opponent_input', input)
    })

    // ── WebRTC signaling relay ───────────────────────────────────────────────
    // The server is a dumb relay — it never parses SDP or ICE payloads.
    // Once the DataChannel opens, all game data flows P2P and the server idles.
    socket.on('webrtc_offer', ({ to, sdp }: WebRTCOfferPayload) => {
      io.to(to).emit('webrtc_offer', { from: socket.id, sdp })
    })

    socket.on('webrtc_answer', ({ to, sdp }: WebRTCAnswerPayload) => {
      io.to(to).emit('webrtc_answer', { from: socket.id, sdp })
    })

    socket.on('webrtc_ice', ({ to, candidate }: WebRTCIcePayload) => {
      io.to(to).emit('webrtc_ice', { from: socket.id, candidate })
    })

    // ── Disconnect ───────────────────────────────────────────────────────────
    // 'disconnecting' fires while socket.rooms is still populated; we use it
    // to notify the opponent before the socket leaves its match room.
    socket.on('disconnecting', () => {
      queue.leave(socket.id)
      cancelCountdownIfNeeded()
      socketNames.delete(socket.id)
      liveScores.delete(socket.id)

      socket.rooms.forEach((room) => {
        if (!room.startsWith('match::')) return
        io.to(room).emit('opponent_disconnected', {
          playerId: socket.id,
          message: 'Pilot signal lost. Substituting emergency AI protocol. Standby...',
        })
      })
    })

    socket.on('disconnect', () => {
      broadcastLobby()
      broadcastLiveScores()
    })
  })

  return fastify
}

// ── Entry point guard ─────────────────────────────────────────────────────────
// Only start the server when this file is run directly (not imported by tests).
const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename) {
  createServer().catch((err: unknown) => {
    console.error('[SMP] Fatal startup error:', err)
    process.exit(1)
  })
}
