/**
 * Pure matchmaking queue — no I/O, no side effects.
 * Isolated here so it can be unit-tested without starting a real server.
 */
export class MatchmakingQueue {
  private readonly queue: string[] = []

  /** Adds the socket to the queue if not already present. Returns 1-based queue position. */
  join(socketId: string): number {
    if (!this.queue.includes(socketId)) {
      this.queue.push(socketId)
    }
    return this.queue.indexOf(socketId) + 1
  }

  /** Removes the socket from the queue. No-op if not present. */
  leave(socketId: string): void {
    const idx = this.queue.indexOf(socketId)
    if (idx !== -1) this.queue.splice(idx, 1)
  }

  /**
   * If two or more players are waiting, removes and returns the first pair.
   * Returns null when fewer than two players are queued.
   */
  tryPair(): [string, string] | null {
    if (this.queue.length < 2) return null
    const a = this.queue.shift()!
    const b = this.queue.shift()!
    return [a, b]
  }

  /** Returns a shallow copy of all socket IDs currently waiting. */
  list(): string[] {
    return [...this.queue]
  }

  get length(): number {
    return this.queue.length
  }
}
