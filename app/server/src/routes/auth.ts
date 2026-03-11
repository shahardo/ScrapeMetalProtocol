import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/user.js'
import { signToken } from '../auth.js'

const BCRYPT_ROUNDS = 10

interface AuthBody {
  username?: string
  password?: string
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /auth/register ───────────────────────────────────────────────────
  fastify.post('/auth/register', async (req, reply) => {
    const { username, password } = req.body as AuthBody

    if (!username || username.trim().length < 2) {
      return reply.status(400).send({ error: 'Username must be at least 2 characters' })
    }
    if (!password || password.length < 6) {
      return reply.status(400).send({ error: 'Password must be at least 6 characters' })
    }

    const trimmed = username.trim()
    const existing = await UserModel.findOne({ username: trimmed })
    if (existing) {
      return reply.status(409).send({ error: 'Username already taken' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await UserModel.create({ username: trimmed, passwordHash })

    const token = signToken({ userId: user._id.toString(), username: user.username, isAdmin: user.isAdmin })
    return reply.status(201).send({
      token,
      userId:   user._id.toString(),
      username: user.username,
      isAdmin:  user.isAdmin,
      credits:  user.credits ?? 0,
    })
  })

  // ── POST /auth/login ──────────────────────────────────────────────────────
  fastify.post('/auth/login', async (req, reply) => {
    const { username, password } = req.body as AuthBody

    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' })
    }

    const user = await UserModel.findOne({ username: username.trim() })
    if (!user) {
      // Constant-time response: hash a dummy string so timing attacks don't reveal existence
      await bcrypt.hash('dummy', BCRYPT_ROUNDS)
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = signToken({ userId: user._id.toString(), username: user.username, isAdmin: user.isAdmin })
    return reply.send({
      token,
      userId:   user._id.toString(),
      username: user.username,
      isAdmin:  user.isAdmin,
      credits:  user.credits ?? 0,
    })
  })
}
