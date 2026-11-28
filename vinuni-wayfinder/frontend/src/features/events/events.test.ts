import { describe, expect, it } from 'vitest'
import { activeEvent, initialEvents, isMascot, readEventStore, validateEvent, withEvent } from './events'

describe('Event-scoped companions', () => {
  const event = initialEvents[0]
  it('uses an event only when it is explicitly selected, published and matches the destination', () => {
    expect(activeEvent([event], new URLSearchParams({ to: event.locationId }))).toBeUndefined()
    expect(activeEvent([event], new URLSearchParams({ to: event.locationId, event: event.id }))).toEqual(event)
    expect(activeEvent([event], new URLSearchParams({ to: 'i109', event: event.id }))).toBeUndefined()
    expect(activeEvent([{ ...event, status: 'draft' }], new URLSearchParams({ to: event.locationId, event: event.id }))).toBeUndefined()
  })
  it('distinguishes events sharing one venue and preserves photo-flow parameters', () => {
    const second = { ...event, id: 'another-event', mascotId: 'vini' }
    expect(activeEvent([event, second], new URLSearchParams({ to: event.locationId, event: second.id }))?.mascotId).toBe('vini')
    expect(withEvent('/anh?to=startup', event)).toBe('/anh?to=startup&event=robotics-open-lab')
    expect(withEvent('/di-den?to=i109', event)).toBe('/di-den?to=i109')
    expect(withEvent('/di-den?to=startup')).toBe('/di-den?to=startup')
  })
  it('blocks publication without a known venue or a valid chronological schedule', () => {
    expect(validateEvent(event)).toBeNull()
    expect(validateEvent({ ...event, locationId: 'unknown' })).toMatch(/địa điểm/)
    expect(validateEvent({ ...event, endsAt: event.startsAt })).toMatch(/kết thúc/)
    expect(validateEvent({ ...event, startsAt: '' })).toMatch(/thời gian/)
    expect(validateEvent({ ...event, title: 'A draft', locationId: '', startsAt: '', endsAt: '' }, false)).toBeNull()
  })
  it('supports live backend venue IDs when a custom placeLookup is provided', () => {
    const liveEvent = { ...event, id: 'g106-demo', locationId: 'r_g106' }
    const lookup = (id: string | null | undefined) => (id === 'r_g106' ? { id: 'r_g106' } : undefined)
    expect(validateEvent(liveEvent, true, lookup)).toBeNull()
    expect(activeEvent([liveEvent], new URLSearchParams({ to: 'r_g106', event: 'g106-demo' }), lookup)).toEqual(liveEvent)
    expect(validateEvent({ ...liveEvent, locationId: 'missing' }, true, lookup)).toMatch(/địa điểm/)
  })
  it('supports multi-stop events in activeEvent, withEvent, and validation', () => {
    const multiStop = {
      ...event,
      id: 'open-day',
      locationId: 'lobby',
      stops: [
        { id: 'st-1', label: 'Gian hàng Robotics', locationId: 'startup', note: 'Tầng trệt' },
        { id: 'st-2', label: 'Quầy cà phê giao lưu', locationId: 'coffee' },
      ],
    }
    expect(validateEvent(multiStop)).toBeNull()
    expect(activeEvent([multiStop], new URLSearchParams({ to: 'startup', event: 'open-day' }))).toEqual(multiStop)
    expect(activeEvent([multiStop], new URLSearchParams({ to: 'coffee', event: 'open-day' }))).toEqual(multiStop)
    expect(activeEvent([multiStop], new URLSearchParams({ to: 'i109', event: 'open-day' }))).toBeUndefined()
    expect(withEvent('/di-den?to=coffee', multiStop)).toBe('/di-den?to=coffee&event=open-day')
    expect(validateEvent({ ...multiStop, stops: [{ id: 'bad', label: 'Trạm lỗi', locationId: 'nope' }] })).toMatch(/trạm|địa điểm/i)
  })
  it('recovers from malformed storage and rejects external or executable image sources', () => {
    expect(readEventStore('{invalid').events).toEqual(initialEvents)
    expect(readEventStore(JSON.stringify({ version: 1, events: [{ title: 123 }], mascots: [] })).events).toEqual([])
    for (const image of ['https://external.example/image.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=']) expect(isMascot({ id: 'new', name: 'New', kind: 'image', image })).toBe(false)
  })
})
