import { describe, it, expect, vi, afterEach } from 'vitest'
import mongoose from 'mongoose'

// SKIP_MONGO must be unset for these tests — we want createServer to run the
// mongoose.connect branch so we can assert on it.
const originalSkipMongo = process.env['SKIP_MONGO']
delete process.env['SKIP_MONGO']

const { createServer } = await import('../src/index.js')

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let app: Awaited<ReturnType<typeof createServer>>

afterEach(async () => {
  await app?.close()
  vi.restoreAllMocks()
  // Restore env for other test files
  if (originalSkipMongo !== undefined) {
    process.env['SKIP_MONGO'] = originalSkipMongo
  } else {
    delete process.env['SKIP_MONGO']
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MongoDB connection on startup', () => {
  it('calls mongoose.connect with the configured URI', async () => {
    const connectSpy = vi.spyOn(mongoose, 'connect').mockResolvedValueOnce(mongoose as never)

    app = await createServer(0)

    // connect is called non-blocking (fire-and-forget .then/.catch),
    // so we flush the microtask queue before asserting.
    await new Promise((r) => setTimeout(r, 0))

    expect(connectSpy).toHaveBeenCalledOnce()
    expect(connectSpy).toHaveBeenCalledWith(
      process.env['MONGO_URI'] ?? 'mongodb://127.0.0.1:27017/ScrapMetalDB',
    )
  })

  it('does not throw when MongoDB is unreachable — server still starts', async () => {
    vi.spyOn(mongoose, 'connect').mockRejectedValueOnce(new Error('ECONNREFUSED'))

    app = await createServer(0)
    // test passes if createServer resolved without throwing
  })

  it('does not call mongoose.connect when SKIP_MONGO=1', async () => {
    process.env['SKIP_MONGO'] = '1'
    const connectSpy = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose as never)

    app = await createServer(0)
    await new Promise((r) => setTimeout(r, 0))

    expect(connectSpy).not.toHaveBeenCalled()
  })
})
