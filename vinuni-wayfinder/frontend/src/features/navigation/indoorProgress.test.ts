import { describe, expect, it } from 'vitest'
import { hasMotionReading, headingDelta, indoorProgress, nextTurnOf, trackingModes } from './indoorProgress'
import type { BackendStep } from '../wayfinder/wayfinderApi'

const step = (text: string, kind = 'walk'): BackendStep => ({ kind, text, meters: 20, approx: false, mapKind: 'indoor', building: 'I',
  target: { node: 'n', label: 'N', lat: null, lng: null }, passes: [], side: null })

describe('headingDelta', () => {
  it('returns the signed clockwise turn in degrees, wrapping through north', () => {
    expect(headingDelta(10, 100)).toBe(90)
    expect(headingDelta(100, 10)).toBe(-90)
    expect(headingDelta(350, 20)).toBe(30)
    expect(headingDelta(20, 350)).toBe(-30)
    expect(Math.abs(headingDelta(0, 180))).toBe(180)
  })
})

describe('nextTurnOf', () => {
  it('maps the following step to the turn the walker must make', () => {
    expect(nextTurnOf(step('Rẽ trái và đi 12 m'))).toBe('left')
    expect(nextTurnOf(step('Rẽ phải và đi 8 m'))).toBe('right')
    expect(nextTurnOf(step('Quay lại và đi 5 m'))).toBe('back')
    expect(nextTurnOf(step('Đi thẳng 10 m'))).toBeNull()
    expect(nextTurnOf(step('Vào Tòa I qua cửa Tây', 'door'))).toBeNull()
    expect(nextTurnOf(undefined)).toBeNull()
  })
})

describe('indoorProgress', () => {
  const base = { meters: 30, turnDeg: null as number | null, nextTurn: null as 'left' | 'right' | 'back' | null, promptAt: 1.3 }

  it('converts counted steps into walked metres and a ratio of the step', () => {
    const p = indoorProgress({ ...base, walked: 12 })
    expect(p.ratio).toBeCloseTo(0.4)
    expect(p.remaining).toBe(18)
    expect(p.state).toBe('walking')
  })

  it('is near once three quarters of the step are walked', () => {
    expect(indoorProgress({ ...base, walked: 23 }).state).toBe('near')
  })

  it('asks the walker after overshooting by 30 %, never advancing on its own', () => {
    expect(indoorProgress({ ...base, walked: 40 }).state).toBe('ask')
    expect(indoorProgress({ ...base, walked: 40, promptAt: 1.6 }).state).toBe('near')
  })

  it('treats a matching turn after most of the step as arrival', () => {
    expect(indoorProgress({ ...base, walked: 20, nextTurn: 'left', turnDeg: -80 }).state).toBe('turned')
    expect(indoorProgress({ ...base, walked: 20, nextTurn: 'right', turnDeg: 70 }).state).toBe('turned')
    expect(indoorProgress({ ...base, walked: 20, nextTurn: 'back', turnDeg: -165 }).state).toBe('turned')
  })

  it('ignores turns that are too early, too small or the wrong way', () => {
    expect(indoorProgress({ ...base, walked: 10, nextTurn: 'left', turnDeg: -90 }).state).toBe('walking')
    expect(indoorProgress({ ...base, walked: 20, nextTurn: 'left', turnDeg: -30 }).state).toBe('walking')
    expect(indoorProgress({ ...base, walked: 20, nextTurn: 'left', turnDeg: 90 }).state).toBe('walking')
    expect(indoorProgress({ ...base, walked: 20, nextTurn: null, turnDeg: 90 }).state).toBe('walking')
  })

  it('does nothing for a step without length', () => {
    expect(indoorProgress({ ...base, meters: 0, walked: 5 }).state).toBe('walking')
  })
})

describe('trackingModes', () => {
  it('treats missing or incomplete motion readings as unavailable and accepts real zero readings', () => {
    expect(hasMotionReading(null)).toBe(false)
    expect(hasMotionReading({ x: null, y: null, z: null })).toBe(false)
    expect(hasMotionReading({ x: 0, y: Infinity, z: 9.8 })).toBe(false)
    expect(hasMotionReading({ x: 0, y: 0, z: 0 })).toBe(true)
  })

  it('prefers step counting indoors and stops sending camera frames when motion sensors exist', () => {
    expect(trackingModes({ outdoorGps: false, indoorStep: true, motionSensor: true, cameraReady: true }))
      .toEqual({ gps: false, pdr: true, photo: false })
  })
  it('falls back to camera recognition indoors without motion sensors', () => {
    expect(trackingModes({ outdoorGps: false, indoorStep: true, motionSensor: false, cameraReady: true }))
      .toEqual({ gps: false, pdr: false, photo: true })
  })
  it('uses GPS outdoors', () => {
    expect(trackingModes({ outdoorGps: true, indoorStep: false, motionSensor: true, cameraReady: true }))
      .toEqual({ gps: true, pdr: false, photo: false })
  })
})
