import { expect, it } from 'vitest'
import { gpsArrival, gpsArrivalRadius, gpsMatchesWaypoint, photoMatchesWaypoint } from './waypointArrival'
import type { BackendStep } from '../wayfinder/wayfinderApi'

const waypoint: BackendStep = { kind: 'walk', meters: 35, approx: false, mapKind: 'outdoor', building: null,
  text: '', passes: [], side: null, target: { node: 'right', label: 'Cửa', lat: 21, lng: 105 } }
const coords = { latitude: 21, longitude: 105, accuracy: 4 }
// ~1 m theo vĩ độ
const north = (m: number, accuracy = 4) => ({ latitude: 21 + m / 111_195, longitude: 105, accuracy })

it('requires an outdoor fix near the target and skips very short or indoor waypoints', () => {
  expect(gpsMatchesWaypoint(waypoint, coords)).toBe(true)
  expect(gpsMatchesWaypoint(waypoint, { ...coords, latitude: 21.001 })).toBe(false)
  expect(gpsMatchesWaypoint(waypoint, { ...coords, accuracy: 35 })).toBe(false)
  expect(gpsMatchesWaypoint({ ...waypoint, meters: 4 }, coords)).toBe(false)
  expect(gpsMatchesWaypoint({ ...waypoint, mapKind: 'indoor' }, coords)).toBe(false)
  expect(gpsMatchesWaypoint({ ...waypoint, target: { ...waypoint.target, lat: null } }, coords)).toBe(false)
})

it('accepts a typical phone fix (8–15 m accuracy) a few metres from the waypoint', () => {
  expect(gpsMatchesWaypoint(waypoint, north(6, 12))).toBe(true)
  expect(gpsMatchesWaypoint(waypoint, north(9, 8))).toBe(true)
})

it('sizes the radius from GPS accuracy (10–20 m) and caps it at half the step', () => {
  expect(gpsArrivalRadius(4, 100)).toBe(10)
  expect(gpsArrivalRadius(15, 100)).toBe(15)
  expect(gpsArrivalRadius(28, 100)).toBe(20)
  expect(gpsArrivalRadius(15, 16)).toBe(8)
})

it('reports the remaining distance and flags weak fixes', () => {
  const far = gpsArrival(waypoint, north(42, 6))
  expect(far.match).toBe(false)
  expect(far.weak).toBe(false)
  expect(far.distance).toBeCloseTo(42, 0)
  const weak = gpsArrival(waypoint, north(1, 45))
  expect(weak).toMatchObject({ match: false, weak: true })
  expect(gpsArrival({ ...waypoint, mapKind: 'indoor' }, coords).distance).toBeNull()
})

it('only accepts a confident visual match for the current target or the final destination node', () => {
  expect(photoMatchesWaypoint('right', undefined, { tier: 'auto', spot: 'right' })).toBe(true)
  expect(photoMatchesWaypoint('right', 'venue', { tier: 'auto', spot: 'venue' })).toBe(true)
  expect(photoMatchesWaypoint('right', undefined, { tier: 'auto', spot: 'venue' })).toBe(false)
  expect(photoMatchesWaypoint('right', 'venue', { tier: 'auto', spot: 'left' })).toBe(false)
  expect(photoMatchesWaypoint('right', 'venue', { tier: 'picker', spot: 'right' })).toBe(false)
})
