import { describe, expect, it } from 'vitest'
import type { CampusEvent } from '../events/events'
import { resolveArrivalContext } from './eventArrival'

const baseEvent: CampusEvent = {
  id: 'robotics-open-lab',
  title: 'Robotics Open Lab',
  club: 'CLB Robotics',
  description: 'Khám phá phòng lab robot.',
  locationId: 'startup',
  startsAt: '2026-11-28T14:00:00+07:00',
  endsAt: '2026-11-28T16:00:00+07:00',
  mascotId: 'boba',
  status: 'published',
}

const multiStopEvent: CampusEvent = {
  ...baseEvent,
  id: 'vinuni-open-day',
  title: 'VinUni Open Day',
  locationId: 'lobby',
  stops: [
    { id: 'st-1', label: 'Gian hàng Robotics', locationId: 'startup', note: 'Tầng trệt' },
    { id: 'st-2', label: 'Quầy cà phê giao lưu', locationId: 'coffee' },
  ],
}

describe('resolveArrivalContext', () => {
  it('returns check-in code and single-stop defaults when event has no stops', () => {
    expect(resolveArrivalContext(baseEvent, 'startup')).toEqual({
      checkinCode: 'SUNSHINE-CHECKIN:robotics-open-lab',
      currentStop: null,
      nextStop: null,
      nextStopRoute: null,
      stopIndex: 0,
      totalStops: 1,
    })

    expect(resolveArrivalContext({ ...baseEvent, stops: [] }, 'startup')).toEqual({
      checkinCode: 'SUNSHINE-CHECKIN:robotics-open-lab',
      currentStop: null,
      nextStop: null,
      nextStopRoute: null,
      stopIndex: 0,
      totalStops: 1,
    })
  })

  it('resolves the main stop and next stop route when arriving at main venue of a multi-stop event', () => {
    const ctx = resolveArrivalContext(multiStopEvent, 'lobby')
    expect(ctx).toEqual({
      checkinCode: 'SUNSHINE-CHECKIN:vinuni-open-day',
      currentStop: { id: 'main', label: 'VinUni Open Day', locationId: 'lobby' },
      nextStop: { id: 'st-1', label: 'Gian hàng Robotics', locationId: 'startup', note: 'Tầng trệt' },
      nextStopRoute: '/hanh-trinh?from=lobby&to=startup&event=vinuni-open-day&stop=st-1',
      stopIndex: 0,
      totalStops: 3,
    })
  })

  it('resolves an intermediate stop by stopId or locationId and points to the subsequent stop', () => {
    const byStopId = resolveArrivalContext(multiStopEvent, 'startup', 'st-1')
    expect(byStopId).toEqual({
      checkinCode: 'SUNSHINE-CHECKIN:vinuni-open-day',
      currentStop: { id: 'st-1', label: 'Gian hàng Robotics', locationId: 'startup', note: 'Tầng trệt' },
      nextStop: { id: 'st-2', label: 'Quầy cà phê giao lưu', locationId: 'coffee' },
      nextStopRoute: '/hanh-trinh?from=startup&to=coffee&event=vinuni-open-day&stop=st-2',
      stopIndex: 1,
      totalStops: 3,
    })

    const byLocation = resolveArrivalContext(multiStopEvent, 'startup')
    expect(byLocation).toEqual(byStopId)
  })

  it('returns null nextStop and nextStopRoute when arriving at the final stop', () => {
    const ctx = resolveArrivalContext(multiStopEvent, 'coffee', 'st-2')
    expect(ctx).toEqual({
      checkinCode: 'SUNSHINE-CHECKIN:vinuni-open-day',
      currentStop: { id: 'st-2', label: 'Quầy cà phê giao lưu', locationId: 'coffee' },
      nextStop: null,
      nextStopRoute: null,
      stopIndex: 2,
      totalStops: 3,
    })
  })

  it('prioritizes stopId over locationId when multiple stops share the same venue', () => {
    const loopEvent: CampusEvent = {
      ...multiStopEvent,
      stops: [
        { id: 'st-1', label: 'Gian hàng Robotics', locationId: 'startup' },
        { id: 'st-2', label: 'Tổng kết tại Sảnh', locationId: 'lobby' },
      ],
    }

    const ctx = resolveArrivalContext(loopEvent, 'lobby', 'st-2')
    expect(ctx.currentStop).toEqual({ id: 'st-2', label: 'Tổng kết tại Sảnh', locationId: 'lobby' })
    expect(ctx.stopIndex).toBe(2)
    expect(ctx.nextStop).toBeNull()
    expect(ctx.nextStopRoute).toBeNull()
  })

  it('falls back to matching by locationId when stopId is unknown, and returns nulls if neither matches', () => {
    const fallback = resolveArrivalContext(multiStopEvent, 'startup', 'unknown-stop')
    expect(fallback.currentStop?.id).toBe('st-1')
    expect(fallback.nextStop?.id).toBe('st-2')

    const unmatched = resolveArrivalContext(multiStopEvent, 'i109', 'unknown-stop')
    expect(unmatched).toEqual({
      checkinCode: 'SUNSHINE-CHECKIN:vinuni-open-day',
      currentStop: null,
      nextStop: null,
      nextStopRoute: null,
      stopIndex: -1,
      totalStops: 3,
    })
  })

  it('URL-encodes query parameters in nextStopRoute', () => {
    const specialEvent: CampusEvent = {
      ...baseEvent,
      id: 'event/2026 & demo',
      locationId: 'room A+1',
      stops: [{ id: 'stop #1', label: 'Trạm 1', locationId: 'room B/2' }],
    }

    const ctx = resolveArrivalContext(specialEvent, 'room A+1', 'main')
    expect(ctx.nextStopRoute).toBe(
      '/hanh-trinh?from=room%20A%2B1&to=room%20B%2F2&event=event%2F2026%20%26%20demo&stop=stop%20%231',
    )
  })
})
