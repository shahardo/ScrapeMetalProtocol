import { describe, it, expect } from 'vitest'
import { rotateByQuat } from '../src/game/robot/RobotEntity'

// Helper: round each component to avoid floating-point noise in assertions.
// Also normalizes -0 → 0; IEEE 754 cross-product arithmetic can produce -0
// which is numerically equal to 0 but fails deep-equal checks.
const round = (v: [number, number, number], dp = 6): [number, number, number] =>
  v.map((n) => {
    const r = Math.round(n * 10 ** dp) / 10 ** dp
    return r === 0 ? 0 : r
  }) as [number, number, number]

describe('rotateByQuat', () => {
  it('identity quaternion leaves the vector unchanged', () => {
    // q = (0, 0, 0, 1) represents no rotation
    const result = rotateByQuat([3, -2, 5], { x: 0, y: 0, z: 0, w: 1 })
    expect(round(result)).toEqual([3, -2, 5])
  })

  it('180° rotation around Z flips X and Y', () => {
    // q = (0, 0, 1, 0) → 180° around Z: x→-x, y→-y, z unchanged
    const result = rotateByQuat([1, 0, 0], { x: 0, y: 0, z: 1, w: 0 })
    expect(round(result)).toEqual([-1, 0, 0])
  })

  it('90° rotation around Y maps +X to -Z', () => {
    // q = (0, sin45°, 0, cos45°) → 90° around Y
    const s = Math.SQRT1_2 // sin(π/4) = cos(π/4) ≈ 0.7071
    const result = rotateByQuat([1, 0, 0], { x: 0, y: s, z: 0, w: s })
    // After 90° CW around Y: [1,0,0] → [0,0,-1]
    expect(round(result)).toEqual([0, 0, -1])
  })

  it('90° rotation around Y maps +Z to +X', () => {
    const s = Math.SQRT1_2
    const result = rotateByQuat([0, 0, 1], { x: 0, y: s, z: 0, w: s })
    expect(round(result)).toEqual([1, 0, 0])
  })

  it('180° rotation around Y maps +X to -X and +Z to -Z', () => {
    // q = (0, 1, 0, 0) → 180° around Y
    const xResult = rotateByQuat([1, 0, 0], { x: 0, y: 1, z: 0, w: 0 })
    const zResult = rotateByQuat([0, 0, 1], { x: 0, y: 1, z: 0, w: 0 })
    expect(round(xResult)).toEqual([-1, 0, 0])
    expect(round(zResult)).toEqual([0, 0, -1])
  })

  it('Y-axis rotations do not affect the Y component of a vector', () => {
    // Any rotation around Y leaves the Y component of any vector unchanged.
    const s = Math.SQRT1_2
    const result = rotateByQuat([0, 4, 0], { x: 0, y: s, z: 0, w: s })
    expect(round(result)).toEqual([0, 4, 0])
  })

  it('preserves vector length (rotations are isometric)', () => {
    const s = Math.SQRT1_2
    const v: [number, number, number] = [3, 1, -2]
    const q = { x: 0, y: s, z: 0, w: s }
    const result = rotateByQuat(v, q)
    const lenBefore = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    const lenAfter  = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2)
    expect(Math.abs(lenBefore - lenAfter)).toBeLessThan(1e-10)
  })
})
