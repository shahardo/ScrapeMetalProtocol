import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import { MatchmakingQueue } from './matchmaking.js'

// ── Types (shared with client; will live in @smp/shared once Sprint 5-6 lands)
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

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_PORT = Number(process.env['PORT']) || 3001
const CLIENT_ORIGIN = process.env['CLIENT_URL'] ?? 'http://localhost:5173'

// ── Server factory ────────────────────────────────────────────────────────────
// Exported so integration tests can call createServer(0) for a random port.

export async function createServer(port: number = DEFAULT_PORT): Promise<FastifyInstance> {
  // Silence the logger in tests (port 0 signals a test environment)
  const fastify = Fastify({ logger: port !== 0 })

  await fastify.register(cors, { origin: CLIENT_ORIGIN })

  // ── REST endpoints (Sprint 7-8 will expand with Garage save/load) ─────────
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  await fastify.listen({ port, host: '0.0.0.0' })

  // ── Socket.io (attach to Fastify's underlying HTTP server) ────────────────
  const io = new SocketIOServer(fastify.server as HttpServer, {
    cors: { origin: CLIENT_ORIGIN },
  })

  const queue = new MatchmakingQueue()

  io.on('connection', (socket) => {
    // ── Matchmaking ─────────────────────────────────────────────────────────
    socket.on('join_queue', () => {
      const position = queue.join(socket.id)
      socket.emit('queue_joined', { position })

      const pair = queue.tryPair()
      if (pair) {
        const [playerA, playerB] = pair
        const roomId = `match::${playerA}::${playerB}`

        io.sockets.sockets.get(playerA)?.join(roomId)
        io.sockets.sockets.get(playerB)?.join(roomId)

        io.to(roomId).emit('match_found', {
          roomId,
          players: [playerA, playerB],
        })
      }
    })

    socket.on('leave_queue', () => {
      queue.leave(socket.id)
    })

    // ── Input relay ─────────────────────────────────────────────────────────
    // Sprint 1-2 (MVP): relay client input to the opponent. No server-side
    // physics yet. Sprint 5-6 will replace this with a server-authoritative
    // tick loop and reconciliation.
    socket.on('player_input', (input: PlayerInput) => {
      // Find the room this socket is in (if any match room)
      const matchRoom = [...socket.rooms].find((r) => r.startsWith('match::'))
      if (!matchRoom) return

      // Relay to everyone else in the room (the opponent)
      socket.to(matchRoom).emit('opponent_input', input)
    })

    // ── WebRTC signaling relay ───────────────────────────────────────────────
    // The server is a dumb relay for SDP and ICE payloads — it never parses
    // them. Each message is forwarded directly to the target socket by id.
    // Once the DataChannel opens, all game data flows P2P; the server is idle.
    socket.on('webrtc_offer', ({ to, sdp }: WebRTCOfferPayload) => {
      io.to(to).emit('webrtc_offer', { from: socket.id, sdp })
    })

    socket.on('webrtc_answer', ({ to, sdp }: WebRTCAnswerPayload) => {
      io.to(to).emit('webrtc_answer', { from: socket.id, sdp })
    })

    socket.on('webrtc_ice', ({ to, candidate }: WebRTCIcePayload) => {
      io.to(to).emit('webrtc_ice', { from: socket.id, candidate })
    })

    // ── Disconnect ──────────────────────────────────────────────────────────
    // Use 'disconnecting' (not 'disconnect') because socket.rooms is already
    // cleared by the time 'disconnect' fires. 'disconnecting' fires while the
    // socket still belongs to all its rooms, so we can notify the opponent.
    socket.on('disconnecting', () => {
      queue.leave(socket.id)

      socket.rooms.forEach((room) => {
        if (!room.startsWith('match::')) return
        io.to(room).emit('opponent_disconnected', {
          playerId: socket.id,
          // Friendly, in-universe message per PDD error handling guidelines
          message:
            'Pilot signal lost. Substituting emergency AI protocol. Standby...',
        })
      })
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
