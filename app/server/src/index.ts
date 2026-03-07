import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'node:http'

// ── Types (shared with client; will live in @smp/shared once Sprint 5-6 lands)
interface PlayerInput {
  playerId: string
  tick: number
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
}

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env['PORT']) || 3001
const CLIENT_ORIGIN = process.env['CLIENT_URL'] ?? 'http://localhost:5173'

// ── Server bootstrap ──────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const fastify = Fastify({ logger: true })

  await fastify.register(cors, { origin: CLIENT_ORIGIN })

  // ── REST endpoints (Sprint 7-8 will expand with Garage save/load) ─────────
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  fastify.log.info(`[SMP] Server listening on port ${PORT}`)

  // ── Socket.io (attach to Fastify's underlying HTTP server) ────────────────
  const io = new SocketIOServer(fastify.server as HttpServer, {
    cors: { origin: CLIENT_ORIGIN },
  })

  // Matchmaking queue — players waiting for an opponent
  const queue: string[] = []

  io.on('connection', (socket) => {
    fastify.log.info(`[SMP] Player connected: ${socket.id}`)

    // ── Matchmaking ─────────────────────────────────────────────────────────
    socket.on('join_queue', () => {
      if (queue.includes(socket.id)) return

      queue.push(socket.id)
      fastify.log.info(`[SMP] Queue depth: ${queue.length}`)
      socket.emit('queue_joined', { position: queue.length })

      // Pair up the first two players in the queue
      if (queue.length >= 2) {
        const [playerA, playerB] = queue.splice(0, 2)
        const roomId = `match::${playerA}::${playerB}`

        io.sockets.sockets.get(playerA)?.join(roomId)
        io.sockets.sockets.get(playerB)?.join(roomId)

        io.to(roomId).emit('match_found', {
          roomId,
          players: [playerA, playerB],
        })

        fastify.log.info(`[SMP] Match started — room: ${roomId}`)
      }
    })

    socket.on('leave_queue', () => {
      const idx = queue.indexOf(socket.id)
      if (idx !== -1) queue.splice(idx, 1)
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

    // ── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      fastify.log.info(`[SMP] Player disconnected: ${socket.id} (${reason})`)

      // Clean up queue if the player was waiting
      const queueIdx = queue.indexOf(socket.id)
      if (queueIdx !== -1) queue.splice(queueIdx, 1)

      // Notify opponent in any active match room
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
}

bootstrap().catch((err: unknown) => {
  console.error('[SMP] Fatal startup error:', err)
  process.exit(1)
})
