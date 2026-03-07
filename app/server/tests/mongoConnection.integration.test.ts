/**
 * Real MongoDB connection integration test.
 *
 * Reads MONGO_URI from .env at the repo root automatically.
 * Skipped when SKIP_MONGO=1 (normal `npm test` always sets this).
 *
 * Run manually:
 *   cd app/server && npx vitest run tests/mongoConnection.integration.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Load .env from repo root if MONGO_URI is not already set in the environment
if (!process.env['MONGO_URI']) {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (key && !(key in process.env)) process.env[key] = val
    }
  } catch {
    // .env not found — rely on environment variables already being set
  }
}

const MONGO_URI = process.env['MONGO_URI'] ?? 'mongodb://127.0.0.1:27017/ScrapMetalDB'
const skip = process.env['SKIP_MONGO'] === '1'

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
})

describe.skipIf(skip)('MongoDB live connection', () => {
  it('connects to the URI in MONGO_URI', async () => {
    await expect(mongoose.connect(MONGO_URI)).resolves.toBeDefined()
    expect(mongoose.connection.readyState).toBe(1) // 1 = connected
  })

  it('can ping the database', async () => {
    const db = mongoose.connection.db
    // admin ping returns { ok: 1 } on success
    const result = await db?.admin().ping() as { ok: number } | undefined
    expect(result?.ok).toBe(1)
  })

  it('can write and read a document', async () => {
    const col = mongoose.connection.collection('_smp_connection_test')
    const doc = { _probe: true, ts: new Date() }

    const { insertedId } = await col.insertOne(doc)
    const found = await col.findOne({ _id: insertedId })
    expect(found?._probe).toBe(true)

    await col.deleteOne({ _id: insertedId })   // clean up
  })
})
