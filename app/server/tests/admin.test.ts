import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { signToken } from '../src/auth.js'

// ── Mock mongoose models ──────────────────────────────────────────────────────

const mockUsers = [
  { _id: 'u1', username: 'alice', isAdmin: true,  createdAt: new Date().toISOString() },
  { _id: 'u2', username: 'bob',   isAdmin: false, createdAt: new Date().toISOString() },
]

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    findOne: vi.fn(),
    create:  vi.fn(),
    find:    vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      sort:   vi.fn().mockReturnThis(),
      lean:   vi.fn().mockResolvedValue(mockUsers),
    })),
    findById:          vi.fn(),
    findByIdAndDelete: vi.fn(),
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

const adminToken = signToken({ userId: 'u1', username: 'alice', isAdmin: true })
const userToken  = signToken({ userId: 'u2', username: 'bob',   isAdmin: false })

beforeAll(async () => {
  app  = await createServer(0)
  base = `http://localhost:${(app.server.address() as AddressInfo).port}`
})

afterAll(async () => { await app.close() }, 15_000)

beforeEach(() => { vi.clearAllMocks() })

// ── GET /admin/users ──────────────────────────────────────────────────────────

describe('GET /admin/users', () => {
  it('returns 403 with no token', async () => {
    const res = await fetch(`${base}/admin/users`)
    expect(res.status).toBe(403)
  })

  it('returns 403 for a non-admin user', async () => {
    const res = await fetch(`${base}/admin/users`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(res.status).toBe(403)
  })

  it('returns user list for an admin', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.find).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      sort:   vi.fn().mockReturnThis(),
      lean:   vi.fn().mockResolvedValue(mockUsers),
    } as never)

    const res  = await fetch(`${base}/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const body = await res.json() as { users: typeof mockUsers }
    expect(res.status).toBe(200)
    expect(body.users).toHaveLength(2)
  })
})

// ── DELETE /admin/users/:userId ───────────────────────────────────────────────

describe('DELETE /admin/users/:userId', () => {
  it('returns 403 for non-admins', async () => {
    const res = await fetch(`${base}/admin/users/u2`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(res.status).toBe(403)
  })

  it('returns 400 when admin tries to delete themselves', async () => {
    const res = await fetch(`${base}/admin/users/u1`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the target user does not exist', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findByIdAndDelete).mockResolvedValueOnce(null)

    const res = await fetch(`${base}/admin/users/nonexistent`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(404)
  })

  it('returns ok:true when user is deleted', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findByIdAndDelete).mockResolvedValueOnce({ _id: 'u2' } as never)

    const res  = await fetch(`${base}/admin/users/u2`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
    })
    const body = await res.json() as { ok: boolean }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })
})

// ── PATCH /admin/users/:userId/promote ────────────────────────────────────────

describe('PATCH /admin/users/:userId/promote', () => {
  it('returns 403 for non-admins', async () => {
    const res = await fetch(`${base}/admin/users/u2/promote`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 when the target user does not exist', async () => {
    const { UserModel } = await import('../src/models/user.js')
    vi.mocked(UserModel.findById).mockResolvedValueOnce(null)

    const res = await fetch(`${base}/admin/users/ghost/promote`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(404)
  })

  it('toggles admin status and returns the new value', async () => {
    const { UserModel } = await import('../src/models/user.js')
    const fakeUser = { _id: 'u2', isAdmin: false, save: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(UserModel.findById).mockResolvedValueOnce(fakeUser as never)

    const res  = await fetch(`${base}/admin/users/u2/promote`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` },
    })
    const body = await res.json() as { ok: boolean; isAdmin: boolean }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.isAdmin).toBe(true)  // was false, toggled to true
  })
})
