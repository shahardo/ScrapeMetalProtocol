import type { FastifyInstance } from 'fastify'
import { RobotConfigModel } from '../models/robotConfig.js'

interface SaveBody {
  name: string
  parts: unknown[]
}

/**
 * Garage REST routes — save, list, and delete robot configurations.
 *
 * Auth is out-of-scope for Sprint 7-8. The userId is supplied by the client
 * (a localStorage UUID). Full auth arrives in Sprint 9+.
 *
 * All handlers wrap DB calls in try-catch: if MongoDB is down the routes
 * return 503 rather than crashing the process.
 */
export async function garageRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /garage/:userId — list all saved robots for a user
  fastify.get<{ Params: { userId: string } }>(
    '/garage/:userId',
    async (request, reply) => {
      try {
        const robots = await RobotConfigModel
          .find({ userId: request.params.userId })
          .sort({ updatedAt: -1 })
          .lean()
        return { robots }
      } catch {
        return reply.status(503).send({ error: 'Database unavailable' })
      }
    },
  )

  // POST /garage/:userId — save a new robot config
  fastify.post<{ Params: { userId: string }; Body: SaveBody }>(
    '/garage/:userId',
    async (request, reply) => {
      const { name, parts } = request.body
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.status(400).send({ error: 'name is required' })
      }
      try {
        const robot = await RobotConfigModel.create({
          userId: request.params.userId,
          name: name.trim(),
          parts,
        })
        return reply.status(201).send({ robot })
      } catch {
        return reply.status(503).send({ error: 'Database unavailable' })
      }
    },
  )

  // DELETE /garage/:userId/:robotId — delete a specific robot
  fastify.delete<{ Params: { userId: string; robotId: string } }>(
    '/garage/:userId/:robotId',
    async (request, reply) => {
      try {
        const deleted = await RobotConfigModel.findOneAndDelete({
          _id: request.params.robotId,
          userId: request.params.userId,
        })
        if (!deleted) return reply.status(404).send({ error: 'Robot not found' })
        return { ok: true }
      } catch {
        return reply.status(503).send({ error: 'Database unavailable' })
      }
    },
  )
}
