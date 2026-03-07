import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mongoose from 'mongoose'

// ── Mock mongoose so no real TCP connection is attempted ──────────────────────
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof mongoose>()
  return {
    ...actual,
    connect: vi.fn(),
  }
})

// SKIP_MONGO must be unset for these tests — we want createServer to run the
// mongoose.connect branch so we can assert on it.
const originalSkipMongo = process.env['SKIP_MONGO']
delete process.env['SKIP_MONGO']

const { createServer } = await import('../src/index.js')

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let app: Awaited<ReturnType<typeof createServer>>

afterEach(async () => {
  await app?.close()
  vi.clearAllMocks()
  // Restore env for other test files
  if (originalSkipMongo !== undefined) {
    process.env['SKIP_MONGO'] = originalSkipMongo
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MongoDB connection on startup', () => {
  it('calls mongoose.connect with the configured URI', async () => {
    const connectMock = vi.mocked(mongoose.connect)
    connectMock.mockResolvedValueOnce(mongoose)

    app = await createServer(0)

    // connect is called non-blocking (fire-and-forget .then/.catch),
    // so we flush the microtask queue before asserting.
    await new Promise((r) => setTimeout(r, 0))

    expect(connectMock).toHaveBeenCalledOnce()
    expect(connectMock).toHaveBeenCalledWith(
      process.env['MONGO_URI'] ?? 'mongodb://localhost:27017/smp',
    )
  })

  it('does not throw when MongoDB is unreachable — server still starts', async () => {
    const connectMock = vi.mocked(mongoose.connect)
    connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    // createServer must resolve even if mongo fails
    await expect(createServer(0)).resolves.toBeDefined()
    app = await createServer(0)
  })

  it('does not call mongoose.connect when SKIP_MONGO=1', async () => {
    process.env['SKIP_MONGO'] = '1'
    const connectMock = vi.mocked(mongoose.connect)

    app = await createServer(0)
    await new Promise((r) => setTimeout(r, 0))

    expect(connectMock).not.toHaveBeenCalled()
  })
})
