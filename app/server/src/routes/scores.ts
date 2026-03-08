import type { FastifyInstance } from 'fastify'
import { ScoreModel } from '../models/score.js'
import { tryVerifyToken } from '../auth.js'

export async function scoreRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /scores ───────────────────────────────────────────────────────────
  // Public endpoint — returns the top 20 all-time scores.
  fastify.get('/scores', async () => {
    const scores = await ScoreModel.find()
      .sort({ score: -1 })
      .limit(20)
      .select('-__v')
      .lean()
    return { scores }
  })

  // ── POST /scores ──────────────────────────────────────────────────────────
  // Authenticated — records a score for the calling user.
  fastify.post('/scores', async (req, reply) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const payload = tryVerifyToken(authHeader.slice(7))
    if (!payload) {
      return reply.status(401).send({ error: 'Invalid or expired token' })
    }

    const { score } = req.body as { score?: unknown }
    if (typeof score !== 'number' || score < 0 || !Number.isFinite(score)) {
      return reply.status(400).send({ error: 'score must be a non-negative number' })
    }

    await ScoreModel.create({ userId: payload.userId, username: payload.username, score })
    return reply.status(201).send({ ok: true })
  })
}
