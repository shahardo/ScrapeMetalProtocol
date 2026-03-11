import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore, GUN_MAX_AMMO, LASER_MAX_CHARGES, CHASSIS_MAX_HEALTH } from '../src/store/gameStore'
import type { RobotPart } from '../src/types/game'

// Zustand stores are module-level singletons. Reset to a clean baseline
// before each test so state doesn't bleed across cases.
beforeEach(() => {
  useGameStore.setState({
    playerParts: [],
    score: 0,
    damageDealt: 0,
    gunAmmo: GUN_MAX_AMMO,
    laserCharges: LASER_MAX_CHARGES,
    chassisHealth: CHASSIS_MAX_HEALTH,
    damagePopups: [],
    credits: 0,
  })
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

// ── addScore ──────────────────────────────────────────────────────────────────

describe('addScore', () => {
  it('increases score by the given amount', () => {
    useGameStore.getState().addScore(5)
    expect(useGameStore.getState().score).toBe(5)
  })

  it('accumulates across multiple calls', () => {
    useGameStore.getState().addScore(1)
    useGameStore.getState().addScore(2)
    useGameStore.getState().addScore(1)
    expect(useGameStore.getState().score).toBe(4)
  })

  it('adds to a non-zero starting score', () => {
    useGameStore.setState({ score: 10 })
    useGameStore.getState().addScore(3)
    expect(useGameStore.getState().score).toBe(13)
  })

  it('does not modify damageDealt', () => {
    useGameStore.setState({ damageDealt: 50 })
    useGameStore.getState().addScore(99)
    expect(useGameStore.getState().damageDealt).toBe(50)
  })
})

// ── addDamage ─────────────────────────────────────────────────────────────────

describe('addDamage', () => {
  it('increases damageDealt by the given amount', () => {
    useGameStore.getState().addDamage(25)
    expect(useGameStore.getState().damageDealt).toBe(25)
  })

  it('accumulates across multiple hits', () => {
    useGameStore.getState().addDamage(25)  // gun hit
    useGameStore.getState().addDamage(40)  // laser hit
    expect(useGameStore.getState().damageDealt).toBe(65)
  })

  it('adds to a non-zero starting total', () => {
    useGameStore.setState({ damageDealt: 100 })
    useGameStore.getState().addDamage(40)
    expect(useGameStore.getState().damageDealt).toBe(140)
  })

  it('does not modify score', () => {
    useGameStore.setState({ score: 7 })
    useGameStore.getState().addDamage(999)
    expect(useGameStore.getState().score).toBe(7)
  })
})

// ── setGunAmmo ────────────────────────────────────────────────────────────────

describe('setGunAmmo', () => {
  it('sets gun ammo to the exact value', () => {
    useGameStore.getState().setGunAmmo(7)
    expect(useGameStore.getState().gunAmmo).toBe(7)
  })

  it('accepts zero (empty magazine)', () => {
    useGameStore.getState().setGunAmmo(0)
    expect(useGameStore.getState().gunAmmo).toBe(0)
  })

  it('accepts the max value', () => {
    useGameStore.setState({ gunAmmo: 0 })
    useGameStore.getState().setGunAmmo(GUN_MAX_AMMO)
    expect(useGameStore.getState().gunAmmo).toBe(GUN_MAX_AMMO)
  })

  it('does not modify laserCharges', () => {
    useGameStore.setState({ laserCharges: 3 })
    useGameStore.getState().setGunAmmo(5)
    expect(useGameStore.getState().laserCharges).toBe(3)
  })
})

// ── setLaserCharges ───────────────────────────────────────────────────────────

describe('setLaserCharges', () => {
  it('sets laser charges to the exact value', () => {
    useGameStore.getState().setLaserCharges(2)
    expect(useGameStore.getState().laserCharges).toBe(2)
  })

  it('accepts zero (depleted)', () => {
    useGameStore.getState().setLaserCharges(0)
    expect(useGameStore.getState().laserCharges).toBe(0)
  })

  it('accepts the max value', () => {
    useGameStore.setState({ laserCharges: 0 })
    useGameStore.getState().setLaserCharges(LASER_MAX_CHARGES)
    expect(useGameStore.getState().laserCharges).toBe(LASER_MAX_CHARGES)
  })

  it('does not modify gunAmmo', () => {
    useGameStore.setState({ gunAmmo: 9 })
    useGameStore.getState().setLaserCharges(1)
    expect(useGameStore.getState().gunAmmo).toBe(9)
  })
})

// ── damagePlayerChassis ───────────────────────────────────────────────────────

describe('damagePlayerChassis', () => {
  it('reduces chassisHealth by the given amount', () => {
    useGameStore.getState().damagePlayerChassis(20)
    expect(useGameStore.getState().chassisHealth).toBe(CHASSIS_MAX_HEALTH - 20)
  })

  it('does not reduce below zero', () => {
    useGameStore.getState().damagePlayerChassis(9999)
    expect(useGameStore.getState().chassisHealth).toBe(0)
  })

  it('accumulates across multiple hits', () => {
    useGameStore.getState().damagePlayerChassis(10)
    useGameStore.getState().damagePlayerChassis(15)
    expect(useGameStore.getState().chassisHealth).toBe(CHASSIS_MAX_HEALTH - 25)
  })

  it('does not modify score or damageDealt', () => {
    useGameStore.setState({ score: 5, damageDealt: 100 })
    useGameStore.getState().damagePlayerChassis(30)
    expect(useGameStore.getState().score).toBe(5)
    expect(useGameStore.getState().damageDealt).toBe(100)
  })
})

// ── addDamagePopup / clearDamagePopup ─────────────────────────────────────────

const HIT_POS: [number, number, number] = [1, 2, 3]

describe('addDamagePopup', () => {
  it('adds a popup entry with the correct amount and hitPos', () => {
    useGameStore.getState().addDamagePopup(25, HIT_POS)
    const popups = useGameStore.getState().damagePopups
    expect(popups).toHaveLength(1)
    expect(popups[0]?.amount).toBe(25)
    expect(popups[0]?.hitPos).toEqual(HIT_POS)
  })

  it('assigns a unique id to each popup', () => {
    useGameStore.getState().addDamagePopup(10, HIT_POS)
    useGameStore.getState().addDamagePopup(40, HIT_POS)
    const ids = useGameStore.getState().damagePopups.map((p) => p.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('accumulates multiple popups', () => {
    useGameStore.getState().addDamagePopup(25, HIT_POS)
    useGameStore.getState().addDamagePopup(40, HIT_POS)
    expect(useGameStore.getState().damagePopups).toHaveLength(2)
  })
})

describe('clearDamagePopup', () => {
  it('removes only the matching popup by id', () => {
    useGameStore.getState().addDamagePopup(25, HIT_POS)
    useGameStore.getState().addDamagePopup(40, HIT_POS)
    const [first] = useGameStore.getState().damagePopups
    useGameStore.getState().clearDamagePopup(first!.id)
    const remaining = useGameStore.getState().damagePopups
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.amount).toBe(40)
  })

  it('is a no-op for an unknown id', () => {
    useGameStore.getState().addDamagePopup(25, HIT_POS)
    useGameStore.getState().clearDamagePopup('does-not-exist')
    expect(useGameStore.getState().damagePopups).toHaveLength(1)
  })
})

// ── setCredits ────────────────────────────────────────────────────────────────

describe('setCredits', () => {
  it('sets the credit balance to the given value', () => {
    useGameStore.getState().setCredits(350)
    expect(useGameStore.getState().credits).toBe(350)
  })

  it('does not modify score or damageDealt', () => {
    useGameStore.setState({ score: 3, damageDealt: 80 })
    useGameStore.getState().setCredits(500)
    expect(useGameStore.getState().score).toBe(3)
    expect(useGameStore.getState().damageDealt).toBe(80)
  })
})
