import jwt from 'jsonwebtoken'

// Fall back to a dev secret; production deployments must set JWT_SECRET.
const JWT_SECRET  = process.env['JWT_SECRET'] ?? 'smp-dev-secret-change-in-prod'
const JWT_EXPIRES = '7d'

export interface TokenPayload {
  userId:   string
  username: string
  isAdmin:  boolean
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

/** Throws if the token is invalid or expired. */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload
}

/** Returns null instead of throwing — use where auth is optional. */
export function tryVerifyToken(token: string): TokenPayload | null {
  try {
    return verifyToken(token)
  } catch {
    return null
  }
}
