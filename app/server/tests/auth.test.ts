import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'

// ── Mock mongoose + models before importing the server ────────────────────────

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    findOne: vi.fn(),
    create:  vi.fn(),
  },
}))

// Garage and score models are registered but not exercised here
vi.mock('../src/models/robotConfig.js', () => ({
  RobotConfigModel: {
    find: vi.fn(() => ({ sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) })),
    create: vi.fn(),
    findOneAndDelete: vi.fn(),
  },
}))

vi.mock('../src/models/score.js', () => ({
  ScoreModel: {
    find: vi.fn(() => ({ sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) })),
    create: vi.fn(),
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

// ── POST /auth/register ───────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('returns 400 when username is too short', async () => {
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'password123' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when password is too short', async () => {
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: '123' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 409 when username is already taken', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findOne).mockResolvedValueOnce({ _id: 'existing' } as never)

    const res = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password123' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 201 with a token on success', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findOne).mockResolvedValueOnce(null)
    vi.mocked(UserModel.create).mockResolvedValueOnce({
      _id: { toString: () => 'user-id-1' },
      username: 'alice',
      isAdmin: false,
    } as never)

    const res  = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password123' }),
    })
    const body = await res.json() as { token?: string; username?: string }
    expect(res.status).toBe(201)
    expect(typeof body.token).toBe('string')
    expect(body.username).toBe('alice')
  })
})

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 when user does not exist', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findOne).mockResolvedValueOnce(null)

    const res = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ghost', password: 'password123' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when password is wrong', async () => {
    const { UserModel } = await import('../src/models/user.js')
    // bcrypt hash of "correctpass"
    const bcrypt = await import('bcryptjs')
    const hash   = await bcrypt.hash('correctpass', 4)
    vi.mocked(UserModel.findOne).mockResolvedValueOnce({
      _id: { toString: () => 'uid' }, username: 'alice', passwordHash: hash, isAdmin: false,
    } as never)

    const res = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'wrongpass' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 with a token when credentials are correct', async () => {
    const { UserModel } = await import('../src/models/user.js')
    const bcrypt = await import('bcryptjs')
    const hash   = await bcrypt.hash('correctpass', 4)
    vi.mocked(UserModel.findOne).mockResolvedValueOnce({
      _id: { toString: () => 'uid' }, username: 'alice', passwordHash: hash, isAdmin: false,
    } as never)

    const res  = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'correctpass' }),
    })
    const body = await res.json() as { token?: string; username?: string }
    expect(res.status).toBe(200)
    expect(typeof body.token).toBe('string')
    expect(body.username).toBe('alice')
  })
})
