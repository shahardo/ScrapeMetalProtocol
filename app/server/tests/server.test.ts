import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as ioClient, type Socket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { createServer } from '../src/index.js'

// ── Test server lifecycle ─────────────────────────────────────────────────────

let app: FastifyInstance
let serverUrl: string

beforeAll(async () => {
  // Port 0 = OS picks a free port, preventing conflicts with a running dev server
  app = await createServer(0)
  const addr = app.server.address() as AddressInfo
  serverUrl = `http://localhost:${addr.port}`
})

// Give the server time to close all socket.io connections
afterAll(async () => {
  await app.close()
}, 15_000)

// ── Helper ────────────────────────────────────────────────────────────────────

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(serverUrl, { forceNew: true })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status ok with a timestamp', async () => {
    const res = await fetch(`${serverUrl}/health`)
    const body = await res.json() as { status: string; timestamp: string }
    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
  })
})

describe('Matchmaking', () => {
  it('emits queue_joined when a single player joins', async () => {
    const a = await connect()
    // Set up listener BEFORE emitting so we don't miss a fast response
    const racePromise = Promise.race([
      waitFor<{ position: number }>(a, 'queue_joined'),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 2000)),
    ])
    a.emit('join_queue')
    const payload = await racePromise
    expect(payload.position).toBe(1)
    a.disconnect()
  })

  it('emits match_found to both players when two join the queue', async () => {
    const [a, b] = await Promise.all([connect(), connect()])

    const matchA = waitFor<{ roomId: string; players: [string, string] }>(a, 'match_found')
    const matchB = waitFor<{ roomId: string; players: [string, string] }>(b, 'match_found')

    a.emit('join_queue')
    b.emit('join_queue')
    // Skip the 5-second countdown so match_found fires immediately
    a.emit('skip_countdown')

    const [payloadA, payloadB] = await Promise.all([matchA, matchB])

    // Both sockets receive the same room info
    expect(payloadA.roomId).toBe(payloadB.roomId)
    expect(payloadA.players).toHaveLength(2)
    // The room includes both socket ids
    expect(payloadA.players).toContain(a.id)
    expect(payloadA.players).toContain(b.id)

    a.disconnect()
    b.disconnect()
  })

  it('notifies the surviving player when their opponent disconnects', async () => {
    const [a, b] = await Promise.all([connect(), connect()])

    const matchA = waitFor(a, 'match_found')
    const matchB = waitFor(b, 'match_found')
    a.emit('join_queue')
    b.emit('join_queue')
    // Skip the 5-second countdown so match_found fires immediately
    a.emit('skip_countdown')
    await Promise.all([matchA, matchB])

    // Capture id before disconnect — socket.io-client clears it on disconnect
    const bId = b.id
    const disconnectNotice = waitFor<{ playerId: string }>(a, 'opponent_disconnected')
    b.disconnect()

    const notice = await Promise.race([
      disconnectNotice,
      new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 2000)),
    ])
    expect(notice.playerId).toBe(bId)

    a.disconnect()
  })
})
