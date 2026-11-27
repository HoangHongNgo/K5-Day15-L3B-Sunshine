import { describe, expect, it, vi } from 'vitest'
import { createEventsApi } from './eventsApi'
import type { CampusEvent, MascotAsset } from './events'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const sampleMascot: MascotAsset = {
  id: 'momo-1',
  name: 'Momo',
  kind: 'image',
  image: 'data:image/png;base64,AAAA',
  brief: 'Chim cánh cụt',
}

const sampleEvent: CampusEvent = {
  id: 'ev-1',
  title: 'Robotics Open Lab',
  club: 'CLB Robotics',
  description: 'Gặp gỡ CLB.',
  locationId: 'bA',
  startsAt: '2026-12-01T14:00:00+07:00',
  endsAt: '2026-12-01T16:00:00+07:00',
  mascotId: 'momo-1',
  status: 'published',
}

describe('Club Events & Mascots API client', () => {
  it('loads, saves, and deletes events and mascots via backend endpoints', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ events: [sampleEvent], mascots: [sampleMascot], storage: 'supabase' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, event: sampleEvent }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, mascot: sampleMascot }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const api = createEventsApi(fetchMock)
    const loaded = await api.list()
    expect(loaded.storage).toBe('supabase')
    expect(loaded.events[0].id).toBe('ev-1')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/events', expect.anything())

    await api.saveEvent(sampleEvent, 'tok-abc')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/events/ev-1')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PUT')
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer tok-abc' })

    await api.saveMascot(sampleMascot, 'tok-abc')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/club-mascots/momo-1')
    expect(fetchMock.mock.calls[2][1]?.method).toBe('PUT')

    await api.deleteEvent('ev-1', 'tok-abc')
    expect(fetchMock.mock.calls[3][0]).toBe('/api/events/ev-1')
    expect(fetchMock.mock.calls[3][1]?.method).toBe('DELETE')
  })

  it('tracks anonymous view and navigation metrics via POST /api/events/:id/metrics', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true, viewsCount: 5, navigationsCount: 2 }),
    )
    const api = createEventsApi(fetchMock)
    const res = await api.trackMetric('ev-1', 'view')
    expect(res.viewsCount).toBe(5)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/events/ev-1/metrics')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ metric: 'view' })
  })

  it('surfaces FastAPI validation errors cleanly', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ detail: { code: 'invalid_event', message: 'Chọn địa điểm trong danh mục.' } }, 422),
    )
    const api = createEventsApi(fetchMock)
    await expect(api.saveEvent(sampleEvent)).rejects.toMatchObject({
      code: 'invalid_event',
      message: 'Chọn địa điểm trong danh mục.',
      status: 422,
    })
  })
})
