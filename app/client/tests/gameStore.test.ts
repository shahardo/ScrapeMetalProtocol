import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '../src/store/gameStore'
import type { RobotPart } from '../src/types/game'

// Zustand stores are module-level singletons. Reset to a clean baseline
// before each test so state doesn't bleed across cases.
beforeEach(() => {
  useGameStore.setState({ playerParts: [] })
})

const makePart = (overrides: Partial<RobotPart> = {}): RobotPart => ({
  id: 'p1',
  type: 'head',
  health: 100,
  maxHealth: 100,
  weight: 10,
  armor: 5,
  isDetached: false,
  ...overrides,
})

describe('damagePlayerPart', () => {
  it('reduces health by the damage amount', () => {
    useGameStore.setState({ playerParts: [makePart()] })
    useGameStore.getState().damagePlayerPart('p1', 30)
    const part = useGameStore.getState().playerParts[0]
    expect(part?.health).toBe(70)
  })

  it('does not reduce health below zero', () => {
    useGameStore.setState({ playerParts: [makePart({ health: 20 })] })
    useGameStore.getState().damagePlayerPart('p1', 999)
    const part = useGameStore.getState().playerParts[0]
    expect(part?.health).toBe(0)
  })

  it('marks the part as detached when health reaches zero', () => {
    useGameStore.setState({ playerParts: [makePart({ health: 50 })] })
    useGameStore.getState().damagePlayerPart('p1', 50)
    const part = useGameStore.getState().playerParts[0]
    expect(part?.isDetached).toBe(true)
  })

  it('does not mark the part detached if health remains above zero', () => {
    useGameStore.setState({ playerParts: [makePart({ health: 100 })] })
    useGameStore.getState().damagePlayerPart('p1', 99)
    const part = useGameStore.getState().playerParts[0]
    expect(part?.isDetached).toBe(false)
    expect(part?.health).toBe(1)
  })

  it('leaves other parts unmodified', () => {
    useGameStore.setState({
      playerParts: [
        makePart({ id: 'p1', health: 100 }),
        makePart({ id: 'p2', type: 'arm-left', health: 80 }),
      ],
    })
    useGameStore.getState().damagePlayerPart('p1', 40)
    const p2 = useGameStore.getState().playerParts.find((p) => p.id === 'p2')
    expect(p2?.health).toBe(80)
  })

  it('is a no-op for an unknown partId', () => {
    const parts = [makePart({ id: 'p1', health: 100 })]
    useGameStore.setState({ playerParts: parts })
    useGameStore.getState().damagePlayerPart('does-not-exist', 50)
    expect(useGameStore.getState().playerParts[0]?.health).toBe(100)
  })

  it('produces a new array (immutable update)', () => {
    useGameStore.setState({ playerParts: [makePart()] })
    const before = useGameStore.getState().playerParts
    useGameStore.getState().damagePlayerPart('p1', 10)
    const after = useGameStore.getState().playerParts
    // Array reference must change; Zustand state is immutable.
    expect(after).not.toBe(before)
  })
})
