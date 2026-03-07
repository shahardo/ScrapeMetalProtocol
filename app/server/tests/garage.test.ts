import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'

// ── Mock mongoose before importing the server ─────────────────────────────────
// This prevents any real MongoDB connection attempt during tests.

const mockRobots: unknown[] = []

vi.mock('../src/models/robotConfig.js', () => ({
  RobotConfigModel: {
    find: vi.fn(() => ({
      sort:  vi.fn().mockReturnThis(),
      lean:  vi.fn().mockResolvedValue(mockRobots),
    })),
    create: vi.fn(async (data: { userId: string; name: string; parts: unknown[] }) => ({
      _id: 'mock-id-123',
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    findOneAndDelete: vi.fn(),
  },
}))

// Skip the real mongoose.connect inside createServer
process.env['SKIP_MONGO'] = '1'

const { createServer } = await import('../src/index.js')

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let app: FastifyInstance
let base: string

beforeAll(async () => {
  app = await createServer(0)
  const addr = app.server.address() as AddressInfo
  base = `http://localhost:${addr.port}`
})

afterAll(async () => { await app.close() }, 15_000)

// Reset mock call state between tests
beforeEach(() => { vi.clearAllMocks() })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /garage/:userId', () => {
  it('returns an empty robots array when the user has no saves', async () => {
    const res  = await fetch(`${base}/garage/user-abc`)
    const body = await res.json() as { robots: unknown[] }
    expect(res.status).toBe(200)
    expect(body.robots).toEqual([])
  })
})

describe('POST /garage/:userId', () => {
  it('returns 400 when name is missing', async () => {
    const res = await fetch(`${base}/garage/user-abc`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ parts: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is blank', async () => {
    const res = await fetch(`${base}/garage/user-abc`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: '   ', parts: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 201 with the saved robot on success', async () => {
    const res  = await fetch(`${base}/garage/user-abc`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: 'Crusher Mk I', parts: [] }),
    })
    const body = await res.json() as { robot: { _id: string; name: string } }
    expect(res.status).toBe(201)
    expect(body.robot.name).toBe('Crusher Mk I')
    expect(typeof body.robot._id).toBe('string')
  })
})

describe('DELETE /garage/:userId/:robotId', () => {
  it('returns 404 when the robot does not belong to the user', async () => {
    const { RobotConfigModel } = await import('../src/models/robotConfig.js')
    vi.mocked(RobotConfigModel.findOneAndDelete).mockResolvedValueOnce(null)

    const res = await fetch(`${base}/garage/user-abc/nonexistent-id`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns ok:true when the robot is deleted successfully', async () => {
    const { RobotConfigModel } = await import('../src/models/robotConfig.js')
    vi.mocked(RobotConfigModel.findOneAndDelete).mockResolvedValueOnce({ _id: 'mock-id-123' } as never)

    const res  = await fetch(`${base}/garage/user-abc/mock-id-123`, { method: 'DELETE' })
    const body = await res.json() as { ok: boolean }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })
})
