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

/** Which shared ammo pool each weapon draws from. */
export type AmmoPool = 'gun' | 'laser' | 'rocket'

export const WEAPON_POOL: Record<WeaponType, AmmoPool> = {
  gun:     'gun',
  shotgun: 'gun',
  rocket:  'rocket',
  laser:   'laser',
  sniper:  'laser',
}
