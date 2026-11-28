import { describe, expect, it } from 'vitest'
import { joystickMove, joystickVector } from './mascotAr'

describe('joystickVector', () => {
  it('normalises the thumb offset to a unit disc with a small dead zone', () => {
    expect(joystickVector(0, 0, 50)).toEqual({ x: 0, y: 0 })
    expect(joystickVector(3, 0, 50)).toEqual({ x: 0, y: 0 })
    const v = joystickVector(100, 0, 50)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
  })
})

describe('joystickMove', () => {
  it('pushing up walks away from the camera along the floor', () => {
    // camera yaw 0 → camera looks toward -Z
    const m = joystickMove({ x: 0, y: -1 }, 0, 0.5, 1)
    expect(m.dx).toBeCloseTo(0)
    expect(m.dz).toBeCloseTo(-0.5)
  })
  it('pushing right walks to the camera’s right', () => {
    const m = joystickMove({ x: 1, y: 0 }, 0, 0.5, 1)
    expect(m.dx).toBeCloseTo(0.5)
    expect(m.dz).toBeCloseTo(0)
  })
  it('follows the camera heading', () => {
    // camera turned 90° left (yaw +π/2) → forward is -X
    const m = joystickMove({ x: 0, y: -1 }, Math.PI / 2, 0.5, 1)
    expect(m.dx).toBeCloseTo(-0.5)
    expect(m.dz).toBeCloseTo(0)
  })
  it('faces the direction of travel and stands still without input', () => {
    expect(joystickMove({ x: 0, y: 0 }, 0, 0.5, 1)).toEqual({ dx: 0, dz: 0, facing: null })
    expect(joystickMove({ x: 1, y: 0 }, 0, 0.5, 1).facing).toBeCloseTo(Math.PI / 2)
  })
})
