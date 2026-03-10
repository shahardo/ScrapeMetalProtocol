import type { FastifyInstance, FastifyReply } from 'fastify'
import { UserModel } from '../models/user.js'
import { tryVerifyToken } from '../auth.js'

/** Returns the verified admin payload, or sends 403 and returns null. */
async function requireAdmin(
  authHeader: string | undefined,
  reply: FastifyReply,
) {
  if (!authHeader?.startsWith('Bearer ')) {
    await reply.status(403).send({ error: 'Admin access required' })
    return null
  }
  const payload = tryVerifyToken(authHeader.slice(7))
  if (!payload?.isAdmin) {
    await reply.status(403).send({ error: 'Admin access required' })
    return null
  }
  return payload
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /admin/users ──────────────────────────────────────────────────────
  // Lists all registered users (without password hashes).
  fastify.get('/admin/users', async (req, reply) => {
    if (!await requireAdmin(req.headers.authorization, reply)) return
    const users = await UserModel.find()
      .select('-passwordHash -__v')
      .sort({ createdAt: -1 })
      .lean()
    return { users }
  })

  // ── DELETE /admin/users/:userId ───────────────────────────────────────────
  // Removes a user account. Admins cannot delete themselves.
  fastify.delete('/admin/users/:userId', async (req, reply) => {
    const admin = await requireAdmin(req.headers.authorization, reply)
    if (!admin) return

    const { userId } = req.params as { userId: string }

    if (userId === admin.userId) {
      return reply.status(400).send({ error: 'Admins cannot delete their own account' })
    }

    const deleted = await UserModel.findByIdAndDelete(userId)
    if (!deleted) {
      return reply.status(404).send({ error: 'User not found' })
    }
    return { ok: true }
  })

  // ── PATCH /admin/users/:userId/promote ────────────────────────────────────
  // Toggles a user's admin status.
  fastify.patch('/admin/users/:userId/promote', async (req, reply) => {
    if (!await requireAdmin(req.headers.authorization, reply)) return
    const { userId } = req.params as { userId: string }

    const user = await UserModel.findById(userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    user.isAdmin = !user.isAdmin
    await user.save()
    return { ok: true, isAdmin: user.isAdmin }
  })
}
