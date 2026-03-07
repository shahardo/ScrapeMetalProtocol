import { describe, it, expect, beforeEach } from 'vitest'
import { MatchmakingQueue } from '../src/matchmaking.js'

let q: MatchmakingQueue

beforeEach(() => {
  q = new MatchmakingQueue()
})

describe('MatchmakingQueue.join', () => {
  it('returns position 1 for the first player', () => {
    expect(q.join('alice')).toBe(1)
  })

  it('returns position 2 for the second player', () => {
    q.join('alice')
    expect(q.join('bob')).toBe(2)
  })

  it('is idempotent — rejoining returns the same position and does not add a duplicate', () => {
    q.join('alice')
    const pos = q.join('alice')
    expect(pos).toBe(1)
    expect(q.length).toBe(1)
  })
})

describe('MatchmakingQueue.leave', () => {
  it('removes a queued player', () => {
    q.join('alice')
    q.leave('alice')
    expect(q.length).toBe(0)
  })

  it('is a no-op for a player not in the queue', () => {
    q.join('alice')
    q.leave('bob')           // bob was never queued
    expect(q.length).toBe(1)
  })
})

describe('MatchmakingQueue.tryPair', () => {
  it('returns null when fewer than two players are queued', () => {
    expect(q.tryPair()).toBeNull()
    q.join('alice')
    expect(q.tryPair()).toBeNull()
  })

  it('returns the first two players as a pair', () => {
    q.join('alice')
    q.join('bob')
    const pair = q.tryPair()
    expect(pair).toEqual(['alice', 'bob'])
  })

  it('removes the paired players from the queue', () => {
    q.join('alice')
    q.join('bob')
    q.tryPair()
    expect(q.length).toBe(0)
  })

  it('pairs in FIFO order when more than two players are queued', () => {
    q.join('alice')
    q.join('bob')
    q.join('carol')
    const first = q.tryPair()
    expect(first).toEqual(['alice', 'bob'])
    expect(q.length).toBe(1) // carol is still waiting
  })

  it('allows a second pair after the first is removed', () => {
    q.join('alice')
    q.join('bob')
    q.join('carol')
    q.join('dave')
    q.tryPair()
    const second = q.tryPair()
    expect(second).toEqual(['carol', 'dave'])
  })
})
