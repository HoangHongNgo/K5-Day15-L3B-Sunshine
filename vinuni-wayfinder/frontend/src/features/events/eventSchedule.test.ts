import { describe, expect, it } from 'vitest'
import type { CampusEvent } from './events'
import {
  eventPhaseLabel,
  eventTimeFilters,
  filterEventsByTime,
  getEventPhase,
  pickFeaturedEvents,
} from './eventSchedule'

function makeEvent(id: string, startsAt: string, endsAt: string): CampusEvent {
  return {
    id,
    title: `Sự kiện ${id}`,
    club: 'CLB Test',
    description: 'Mô tả sự kiện thử nghiệm',
    locationId: 'startup',
    startsAt,
    endsAt,
    mascotId: 'vini',
    status: 'published',
  }
}

describe('eventSchedule', () => {
  // 2026-11-28 15:00:00 +07:00
  const now = new Date('2026-11-28T15:00:00+07:00')

  it('exposes the 5 Vietnamese time filters and phase labels', () => {
    expect(eventTimeFilters).toEqual([
      { id: 'all', label: 'Tất cả' },
      { id: 'live', label: 'Đang diễn ra' },
      { id: 'today', label: 'Hôm nay' },
      { id: 'upcoming', label: 'Sắp tới' },
      { id: 'ended', label: 'Đã kết thúc' },
    ])
    expect(eventPhaseLabel('live')).toBe('Đang diễn ra')
    expect(eventPhaseLabel('today')).toBe('Hôm nay')
    expect(eventPhaseLabel('upcoming')).toBe('Sắp tới')
    expect(eventPhaseLabel('ended')).toBe('Đã kết thúc')
  })

  it('classifies event phases accurately including boundaries and invalid dates', () => {
    expect(
      getEventPhase({ startsAt: '2026-11-28T14:00:00+07:00', endsAt: '2026-11-28T16:00:00+07:00' }, now),
    ).toBe('live')
    // Exact start and end boundaries are still live
    expect(
      getEventPhase({ startsAt: '2026-11-28T15:00:00+07:00', endsAt: '2026-11-28T17:00:00+07:00' }, now),
    ).toBe('live')
    expect(
      getEventPhase({ startsAt: '2026-11-28T13:00:00+07:00', endsAt: '2026-11-28T15:00:00+07:00' }, now),
    ).toBe('live')

    // Ended strictly after endsAt
    expect(
      getEventPhase({ startsAt: '2026-11-28T13:00:00+07:00', endsAt: '2026-11-28T14:59:59+07:00' }, now),
    ).toBe('ended')

    // Later today in Asia/Ho_Chi_Minh
    expect(
      getEventPhase({ startsAt: '2026-11-28T18:30:00+07:00', endsAt: '2026-11-28T20:00:00+07:00' }, now),
    ).toBe('today')

    // Future day
    expect(
      getEventPhase({ startsAt: '2026-11-29T09:00:00+07:00', endsAt: '2026-11-29T11:00:00+07:00' }, now),
    ).toBe('upcoming')

    // Unparseable dates fall back to upcoming
    expect(getEventPhase({ startsAt: '', endsAt: '' }, now)).toBe('upcoming')
    expect(getEventPhase({ startsAt: 'not-a-date', endsAt: '2026-11-28T16:00:00+07:00' }, now)).toBe('upcoming')
  })

  it('uses Asia/Ho_Chi_Minh (UTC+7) day boundary for today vs upcoming', () => {
    // 2026-11-28T16:30:00Z === 2026-11-28T23:30:00+07:00
    const lateNightVN = new Date('2026-11-28T16:30:00Z')
    // 23:45 VN on Nov 28 -> same VN day -> today
    expect(
      getEventPhase({ startsAt: '2026-11-28T16:45:00Z', endsAt: '2026-11-28T17:30:00Z' }, lateNightVN),
    ).toBe('today')
    // 00:15 VN on Nov 29 (still Nov 28 in UTC!) -> next VN day -> upcoming
    expect(
      getEventPhase({ startsAt: '2026-11-28T17:15:00Z', endsAt: '2026-11-28T18:15:00Z' }, lateNightVN),
    ).toBe('upcoming')
  })

  it('filters and sorts events by phase priority and chronological rules', () => {
    const endedOld = makeEvent('ended-old', '2026-11-26T09:00:00+07:00', '2026-11-26T11:00:00+07:00')
    const endedRecent = makeEvent('ended-recent', '2026-11-28T09:00:00+07:00', '2026-11-28T12:00:00+07:00')
    const upcomingLate = makeEvent('up-late', '2026-12-02T10:00:00+07:00', '2026-12-02T12:00:00+07:00')
    const upcomingSoon = makeEvent('up-soon', '2026-11-29T08:00:00+07:00', '2026-11-29T10:00:00+07:00')
    const todayLate = makeEvent('today-late', '2026-11-28T19:00:00+07:00', '2026-11-28T21:00:00+07:00')
    const todaySoon = makeEvent('today-soon', '2026-11-28T16:00:00+07:00', '2026-11-28T18:00:00+07:00')
    const liveSecond = makeEvent('live-2', '2026-11-28T14:30:00+07:00', '2026-11-28T16:30:00+07:00')
    const liveFirst = makeEvent('live-1', '2026-11-28T13:00:00+07:00', '2026-11-28T16:00:00+07:00')

    const input = [endedOld, upcomingLate, todayLate, liveSecond, endedRecent, upcomingSoon, liveFirst, todaySoon]
    const snapshot = [...input]

    expect(filterEventsByTime(input, 'all', now).map(e => e.id)).toEqual([
      'live-1',
      'live-2',
      'today-soon',
      'today-late',
      'up-soon',
      'up-late',
      'ended-recent',
      'ended-old',
    ])
    // Does not mutate input
    expect(input).toEqual(snapshot)

    // 'today' includes both 'live' and 'today'
    expect(filterEventsByTime(input, 'today', now).map(e => e.id)).toEqual([
      'live-1',
      'live-2',
      'today-soon',
      'today-late',
    ])

    expect(filterEventsByTime(input, 'live', now).map(e => e.id)).toEqual(['live-1', 'live-2'])
    expect(filterEventsByTime(input, 'upcoming', now).map(e => e.id)).toEqual(['up-soon', 'up-late'])
    expect(filterEventsByTime(input, 'ended', now).map(e => e.id)).toEqual(['ended-recent', 'ended-old'])
  })

  it('picks featured events preferring active/upcoming and falling back to recent ended', () => {
    const endedRecent = makeEvent('ended-recent', '2026-11-28T09:00:00+07:00', '2026-11-28T12:00:00+07:00')
    const endedOlder = makeEvent('ended-older', '2026-11-27T09:00:00+07:00', '2026-11-27T12:00:00+07:00')
    const endedOldest = makeEvent('ended-oldest', '2026-11-25T09:00:00+07:00', '2026-11-25T12:00:00+07:00')
    const live = makeEvent('live', '2026-11-28T14:00:00+07:00', '2026-11-28T16:00:00+07:00')
    const today = makeEvent('today', '2026-11-28T18:00:00+07:00', '2026-11-28T20:00:00+07:00')
    const up1 = makeEvent('up-1', '2026-11-29T09:00:00+07:00', '2026-11-29T11:00:00+07:00')
    const up2 = makeEvent('up-2', '2026-11-30T09:00:00+07:00', '2026-11-30T11:00:00+07:00')

    // Prioritizes live -> today -> upcoming and caps at default 3
    expect(pickFeaturedEvents([endedRecent, up2, today, up1, live], now).map(e => e.id)).toEqual([
      'live',
      'today',
      'up-1',
    ])

    // Does not include ended when at least one non-ended exists
    expect(pickFeaturedEvents([endedRecent, endedOlder, up1], now, 3).map(e => e.id)).toEqual(['up-1'])

    // Respects custom limit
    expect(pickFeaturedEvents([live, today, up1], now, 2).map(e => e.id)).toEqual(['live', 'today'])
    expect(pickFeaturedEvents([live, today], now, 0)).toEqual([])

    // Falls back to most recently ended when all events are ended
    expect(pickFeaturedEvents([endedOldest, endedRecent, endedOlder], now, 2).map(e => e.id)).toEqual([
      'ended-recent',
      'ended-older',
    ])

    expect(pickFeaturedEvents([], now)).toEqual([])
  })
})
