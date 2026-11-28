import { describe, expect, it } from 'vitest'
import { anchorAt, groundReady, pitchDownFromBeta, projectAnchor, type Pose } from './groundAnchor'

const view = { aspect: 9 / 19.5 }
const pose = (pitchDown: number, heading = 0): Pose => ({ pitchDown, heading })

describe('pitchDownFromBeta', () => {
  it('is 0 when the phone is upright and grows as the camera tilts toward the floor', () => {
    expect(pitchDownFromBeta(90)).toBe(0)
    expect(pitchDownFromBeta(60)).toBe(30)
    expect(pitchDownFromBeta(10)).toBe(80)
  })
})

describe('groundReady', () => {
  it('needs the camera aimed somewhat down, but not flat at the feet', () => {
    expect(groundReady(5)).toBe(false)
    expect(groundReady(30)).toBe(true)
    expect(groundReady(85)).toBe(false)
  })
})

describe('anchorAt', () => {
  it('drops a ray from the bottom-right of the frame onto the floor', () => {
    const a = anchorAt(pose(30), 0.72, 0.82, view)!
    expect(a.distance).toBeGreaterThan(0.5)
    expect(a.distance).toBeLessThan(3)
    expect(a.yaw).toBeGreaterThan(0)
  })

  it('returns null when the chosen point is above the horizon', () => {
    expect(anchorAt(pose(0), 0.5, 0.3, view)).toBeNull()
  })
})

describe('projectAnchor', () => {
  it('puts the feet back where they were locked when the phone has not moved', () => {
    const p = pose(30, 40)
    const a = anchorAt(p, 0.72, 0.82, view)!
    const s = projectAnchor(a, p, view)!
    expect(s.x).toBeCloseTo(0.72, 2)
    expect(s.y).toBeCloseTo(0.82, 2)
  })

  it('slides the mascot left when the phone turns right, keeping it on the floor', () => {
    const a = anchorAt(pose(30, 0), 0.72, 0.82, view)!
    const turned = projectAnchor(a, pose(30, 10), view)!
    expect(turned.x).toBeLessThan(0.72)
    expect(turned.y).toBeCloseTo(0.82, 2)
  })

  it('moves the feet up the screen when the phone tilts further down', () => {
    const a = anchorAt(pose(30), 0.72, 0.82, view)!
    expect(projectAnchor(a, pose(40), view)!.y).toBeLessThan(0.82)
  })

  it('shrinks with distance', () => {
    const near = anchorAt(pose(45), 0.72, 0.85, view)!
    const far = anchorAt(pose(15), 0.72, 0.85, view)!
    expect(projectAnchor(near, pose(45), view)!.zoom).toBeGreaterThan(projectAnchor(far, pose(15), view)!.zoom)
  })

  it('hides the mascot once it is behind the camera', () => {
    const a = anchorAt(pose(30, 0), 0.72, 0.82, view)!
    expect(projectAnchor(a, pose(30, 180), view)).toBeNull()
  })
})
