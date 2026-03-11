/**
 * Tests for weapon registry data consistency and the garage description helper.
 */

import { describe, it, expect } from 'vitest'
import {
  ALL_WEAPON_TYPES,
  WEAPON_STATS,
  WEAPON_LABEL,
  WEAPON_COLOR,
  WEAPON_POOL,
} from '../src/game/weapons/weaponRegistry'
import { buildDescription } from '../src/game/ui/GarageModal'
import type { WeaponType } from '../src/types/game'

// ── weaponRegistry data invariants ───────────────────────────────────────────

describe('weapon registry — completeness', () => {
  it('every WeaponType has a WEAPON_STATS entry', () => {
    for (const w of ALL_WEAPON_TYPES) {
      expect(WEAPON_STATS[w], `missing stats for ${w}`).toBeDefined()
    }
  })

  it('every WeaponType has a WEAPON_LABEL entry', () => {
    for (const w of ALL_WEAPON_TYPES) {
      expect(WEAPON_LABEL[w], `missing label for ${w}`).toBeTruthy()
    }
  })

  it('every WeaponType has a WEAPON_COLOR entry', () => {
    for (const w of ALL_WEAPON_TYPES) {
      expect(WEAPON_COLOR[w], `missing color for ${w}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('every WeaponType has a WEAPON_POOL entry', () => {
    for (const w of ALL_WEAPON_TYPES) {
      expect(['gun', 'laser', 'rocket']).toContain(WEAPON_POOL[w])
    }
  })
})

describe('weapon registry — stat ranges', () => {
  for (const w of ALL_WEAPON_TYPES) {
    const stats = WEAPON_STATS[w]

    it(`${w}: power is in [1, 100]`, () => {
      expect(stats.power).toBeGreaterThanOrEqual(1)
      expect(stats.power).toBeLessThanOrEqual(100)
    })

    it(`${w}: range is in [1, 5]`, () => {
      expect(stats.range).toBeGreaterThanOrEqual(1)
      expect(stats.range).toBeLessThanOrEqual(5)
    })

    it(`${w}: fireRate is in [1, 5]`, () => {
      expect(stats.fireRate).toBeGreaterThanOrEqual(1)
      expect(stats.fireRate).toBeLessThanOrEqual(5)
    })

    it(`${w}: ammo is positive`, () => {
      expect(stats.ammo).toBeGreaterThan(0)
    })

    it(`${w}: price is non-negative`, () => {
      expect(stats.price).toBeGreaterThanOrEqual(0)
    })

    it(`${w}: has a non-empty name and desc`, () => {
      expect(stats.name.trim().length).toBeGreaterThan(0)
      expect(stats.desc.trim().length).toBeGreaterThan(0)
    })
  }
})

describe('weapon registry — pool consistency', () => {
  it('gun and shotgun share the gun ammo pool', () => {
    expect(WEAPON_POOL['gun']).toBe('gun')
    expect(WEAPON_POOL['shotgun']).toBe('gun')
  })

  it('laser and sniper share the laser ammo pool', () => {
    expect(WEAPON_POOL['laser']).toBe('laser')
    expect(WEAPON_POOL['sniper']).toBe('laser')
  })

  it('rocket uses the rocket pool', () => {
    expect(WEAPON_POOL['rocket']).toBe('rocket')
  })
})

// ── buildDescription ──────────────────────────────────────────────────────────

describe('buildDescription', () => {
  it('formats Q and E slots correctly', () => {
    const result = buildDescription('laser', 'gun')
    expect(result).toBe(`Q: ${WEAPON_LABEL['laser']} / E: ${WEAPON_LABEL['gun']}`)
  })

  it('works for all weapon type combinations on the same slot', () => {
    const weapons: WeaponType[] = ['gun', 'shotgun', 'rocket', 'laser', 'sniper']
    for (const w of weapons) {
      const desc = buildDescription(w, w)
      expect(desc).toContain(WEAPON_LABEL[w])
    }
  })

  it('includes both slot labels in the output', () => {
    const desc = buildDescription('sniper', 'rocket')
    expect(desc).toContain('Q:')
    expect(desc).toContain('E:')
    expect(desc).toContain(WEAPON_LABEL['sniper'])
    expect(desc).toContain(WEAPON_LABEL['rocket'])
  })

  it('left and right slots appear in order (Q before E)', () => {
    const desc = buildDescription('gun', 'laser')
    const qIdx = desc.indexOf('Q:')
    const eIdx = desc.indexOf('E:')
    expect(qIdx).toBeLessThan(eIdx)
  })
})
