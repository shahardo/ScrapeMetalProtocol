/**
 * Weapon registry — metadata for every WeaponType.
 * Import from here instead of scattering weapon constants across files.
 */

import type { WeaponType } from '../../types/game'

export const ALL_WEAPON_TYPES: WeaponType[] = ['gun', 'shotgun', 'rocket', 'laser', 'sniper']

/** Short display label shown in the Garage and HUD. */
export const WEAPON_LABEL: Record<WeaponType, string> = {
  gun:     'GUN',
  shotgun: 'SHOT',
  rocket:  'ROCKET',
  laser:   'LASER',
  sniper:  'SNIPER',
}

/** HUD accent colour for each weapon type. */
export const WEAPON_COLOR: Record<WeaponType, string> = {
  gun:     '#ffaa44',
  shotgun: '#ff8800',
  rocket:  '#ff4422',
  laser:   '#ff3344',
  sniper:  '#44ccff',
}

export interface WeaponStats {
  /** Full display name shown in the weapon table. */
  name:      string
  /** Short description of the weapon's behaviour. */
  desc:      string
  /** Damage per hit (or per pellet for shotgun). 1–100 scale. */
  power:     number
  /** Effective range: 1 = point-blank, 5 = extreme range. */
  range:     number
  /** Fire rate: higher = faster. 1–5 scale. */
  fireRate:  number
  /** Magazine / charge capacity. */
  ammo:      number
  /** Placeholder credit cost for the future economy system. */
  price:     number
}

export const WEAPON_STATS: Record<WeaponType, WeaponStats> = {
  gun:     { name: 'PULSE GUN',       desc: 'Fast projectile, reliable mid-range.',     power: 25,  range: 3, fireRate: 4, ammo: 12, price: 0    },
  shotgun: { name: 'SCATTER CANNON',  desc: '3-pellet spread, devastating up close.',   power: 18,  range: 1, fireRate: 3, ammo: 12, price: 400  },
  rocket:  { name: 'ROCKET LAUNCHER', desc: 'Slow heavy rocket, massive damage.',       power: 60,  range: 4, fireRate: 1, ammo: 2,  price: 800  },
  laser:   { name: 'PLASMA LASER',    desc: 'Instant hit raycast, medium damage.',      power: 40,  range: 4, fireRate: 2, ammo: 5,  price: 200  },
  sniper:  { name: 'RAIL SNIPER',     desc: 'Extreme range, costs 2 laser charges.',   power: 80,  range: 5, fireRate: 1, ammo: 5,  price: 1200 },
}

/** Which shared ammo pool each weapon draws from. */
export type AmmoPool = 'gun' | 'laser' | 'rocket'

export const WEAPON_POOL: Record<WeaponType, AmmoPool> = {
  gun:     'gun',
  shotgun: 'gun',
  rocket:  'rocket',
  laser:   'laser',
  sniper:  'laser',
}
