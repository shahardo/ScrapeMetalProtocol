import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { signToken } from '../src/auth.js'

// ── Mock mongoose models ──────────────────────────────────────────────────────

const mockScores = [
  { _id: 's1', userId: 'u1', username: 'alice', score: 42, createdAt: new Date().toISOString() },
  { _id: 's2', userId: 'u2', username: 'bob',   score: 17, createdAt: new Date().toISOString() },
]

vi.mock('../src/models/score.js', () => ({
  ScoreModel: {
    find: vi.fn(() => ({
      sort:   vi.fn().mockReturnThis(),
      limit:  vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean:   vi.fn().mockResolvedValue(mockScores),
    })),
    create: vi.fn(),
  },
}))

vi.mock('../src/models/user.js', () => ({
  UserModel: { findOne: vi.fn(), create: vi.fn() },
}))

vi.mock('../src/models/robotConfig.js', () => ({
  RobotConfigModel: {
    find: vi.fn(() => ({ sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) })),
    create: vi.fn(),
    findOneAndDelete: vi.fn(),
  },
}))

process.env['SKIP_MONGO'] = '1'

const { createServer } = await import('../src/index.js')

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let app: FastifyInstance
let base: string

beforeAll(async () => {
  app  = await createServer(0)
  base = `http://localhost:${(app.server.address() as AddressInfo).port}`
})

afterAll(async () => { await app.close() }, 15_000)

beforeEach(() => { vi.clearAllMocks() })

// ── GET /scores ───────────────────────────────────────────────────────────────

describe('GET /scores', () => {
  it('returns the top scores array', async () => {
    const { ScoreModel } = await import('../src/models/score.js')
    vi.mocked(ScoreModel.find).mockReturnValueOnce({
      sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(mockScores),
    } as never)

    const res  = await fetch(`${base}/scores`)
    const body = await res.json() as { scores: typeof mockScores }
    expect(res.status).toBe(200)
    expect(body.scores).toHaveLength(2)
    expect(body.scores[0]?.username).toBe('alice')
  })
})

// ── POST /scores ──────────────────────────────────────────────────────────────

describe('POST /scores', () => {
  it('returns 401 without a token', async () => {
    const res = await fetch(`${base}/scores`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 10 }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 with a malformed token', async () => {
    const res = await fetch(`${base}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad.token.here' },
      body: JSON.stringify({ score: 10 }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when score is negative', async () => {
    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: -5 }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 201 on success with valid token', async () => {
    const { ScoreModel } = await import('../src/models/score.js')
    vi.mocked(ScoreModel.create).mockResolvedValueOnce({} as never)

    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 99 }),
    })
    const body = await res.json() as { ok: boolean }
    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(ScoreModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', username: 'alice', score: 99 }),
    )
  })
})
