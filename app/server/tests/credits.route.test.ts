import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { signToken } from '../src/auth.js'

// ── Shared mock user ──────────────────────────────────────────────────────────

const mockUser = { _id: 'u1', username: 'alice', isAdmin: false, credits: 120 }

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    findById: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue(mockUser),
    })),
    findByIdAndUpdate: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue({ ...mockUser, credits: 155 }),
    })),
    findOne: vi.fn(),
    create:  vi.fn(),
  },
}))

vi.mock('../src/models/score.js', () => ({
  ScoreModel: {
    find: vi.fn(() => ({ sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) })),
    create: vi.fn(),
  },
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

// ── GET /credits ──────────────────────────────────────────────────────────────

describe('GET /credits', () => {
  it('returns 401 without a token', async () => {
    const res = await fetch(`${base}/credits`)
    expect(res.status).toBe(401)
  })

  it('returns the user credit balance', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(mockUser) } as never)

    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/credits`, { headers: { Authorization: `Bearer ${token}` } })
    const body  = await res.json() as { credits: number }
    expect(res.status).toBe(200)
    expect(body.credits).toBe(120)
  })
})

// ── POST /credits/award ───────────────────────────────────────────────────────

describe('POST /credits/award', () => {
  it('returns 401 without a token', async () => {
    const res = await fetch(`${base}/credits/award`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ damageDealt: 100, score: 2 }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing fields', async () => {
    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/credits/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ damageDealt: 100 }),
    })
    expect(res.status).toBe(400)
  })

  it('awards credits and returns new balance + earned amount', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findByIdAndUpdate).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ ...mockUser, credits: 155 }) } as never)

    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/credits/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ damageDealt: 200, score: 3 }),
    })
    const body = await res.json() as { credits: number; earned: number }
    expect(res.status).toBe(200)
    expect(body.earned).toBe(35)   // floor(200/10) + 3*5 = 35
    expect(body.credits).toBe(155)
  })

  it('caps award at MAX_CREDITS_PER_MATCH (500)', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findByIdAndUpdate).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ ...mockUser, credits: 620 }) } as never)

    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/credits/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ damageDealt: 100_000, score: 9999 }),
    })
    const body = await res.json() as { earned: number }
    expect(res.status).toBe(200)
    expect(body.earned).toBe(500)
  })
})

// ── POST /credits/spend ───────────────────────────────────────────────────────

describe('POST /credits/spend', () => {
  it('returns 401 without a token', async () => {
    const res = await fetch(`${base}/credits/spend`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100 }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when balance is insufficient', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ ...mockUser, credits: 50 }) } as never)

    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/credits/spend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 200 }),
    })
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('Insufficient credits')
  })

  it('deducts and returns new balance when affordable', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(mockUser) } as never)
    vi.mocked(UserModel.findByIdAndUpdate).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ ...mockUser, credits: 20 }) } as never)

    const token = signToken({ userId: 'u1', username: 'alice', isAdmin: false })
    const res   = await fetch(`${base}/credits/spend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 100 }),
    })
    const body = await res.json() as { credits: number }
    expect(res.status).toBe(200)
    expect(body.credits).toBe(20)
  })
})
