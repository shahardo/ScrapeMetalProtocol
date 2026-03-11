import type { FastifyInstance } from 'fastify'
import { tryVerifyToken } from '../auth.js'
import { UserModel } from '../models/user.js'
import { calcMatchCredits, canAfford } from '../credits.js'

interface AwardBody  { damageDealt?: unknown; score?: unknown }
interface SpendBody  { amount?: unknown }

export async function creditsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /credits ─────────────────────────────────────────────────────────────
  // Returns the authenticated user's current credit balance.
  fastify.get('/credits', async (req, reply) => {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '')
    const payload = tryVerifyToken(token)
    if (!payload) return reply.status(401).send({ error: 'Unauthorised' })

    const user = await UserModel.findById(payload.userId).lean()
    if (!user) return reply.status(404).send({ error: 'User not found' })

    return reply.send({ credits: user.credits ?? 0 })
  })

  // ── POST /credits/award ───────────────────────────────────────────────────────
  // Awards credits for a completed match. Called by the client when a match ends.
  // Uses $inc for atomicity — safe even if two requests arrive concurrently.
  fastify.post('/credits/award', async (req, reply) => {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '')
    const payload = tryVerifyToken(token)
    if (!payload) return reply.status(401).send({ error: 'Unauthorised' })

    const { damageDealt, score } = req.body as AwardBody
    if (typeof damageDealt !== 'number' || typeof score !== 'number') {
      return reply.status(400).send({ error: 'damageDealt and score must be numbers' })
    }

    const earned = calcMatchCredits({ damageDealt, score })
    const updated = await UserModel.findByIdAndUpdate(
      payload.userId,
      { $inc: { credits: earned } },
      { new: true },
    ).lean()
    if (!updated) return reply.status(404).send({ error: 'User not found' })

    return reply.send({ credits: updated.credits ?? earned, earned })
  })

  // ── POST /credits/spend ───────────────────────────────────────────────────────
  // Deducts credits for a weapon/item purchase.
  fastify.post('/credits/spend', async (req, reply) => {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '')
    const payload = tryVerifyToken(token)
    if (!payload) return reply.status(401).send({ error: 'Unauthorised' })

    const { amount } = req.body as SpendBody
    if (typeof amount !== 'number' || amount < 0) {
      return reply.status(400).send({ error: 'amount must be a non-negative number' })
    }

    const user = await UserModel.findById(payload.userId).lean()
    if (!user) return reply.status(404).send({ error: 'User not found' })

    if (!canAfford(user.credits ?? 0, amount)) {
      return reply.status(400).send({ error: 'Insufficient credits' })
    }

    const updated = await UserModel.findByIdAndUpdate(
      payload.userId,
      { $inc: { credits: -amount } },
      { new: true },
    ).lean()
    if (!updated) return reply.status(404).send({ error: 'User not found' })

    return reply.send({ credits: updated.credits ?? 0 })
  })
}
