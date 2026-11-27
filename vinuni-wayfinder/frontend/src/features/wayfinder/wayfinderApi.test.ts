import { describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createWayfinderApi,
  mapBackendRoomToPlace,
  searchCatalog,
  splitRouteSteps,
  stepDirection,
  type BackendRoom,
  type BackendRouteResponse,
  type BackendStep,
} from './wayfinderApi'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Wayfinder API client', () => {
  it('calls health, destinations, and spots search endpoints with expected query params', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, indexSize: 240, model: 'MegaLoc', modelLoaded: true, storage: 'supabase' }))
      .mockResolvedValueOnce(jsonResponse({
        rooms: [{ id: 'g106', code: 'G106', name: 'Phòng G106', aliases: ['lab'], building: 'Tòa G' }],
        outdoorGeo: true,
      }))
      .mockResolvedValueOnce(jsonResponse({ spots: [{ spot: 'n1', label: 'Hành lang trước phòng I109' }] }))

    const client = createWayfinderApi(fetchMock)
    const health = await client.health()
    expect(health.indexSize).toBe(240)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/health', expect.objectContaining({ signal: undefined }))

    const dest = await client.destinations()
    expect(dest.outdoorGeo).toBe(true)
    expect(dest.rooms[0].id).toBe('g106')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/destinations', expect.anything())

    const spots = await client.spotSearch('I109')
    expect(spots.spots).toEqual([{ spot: 'n1', label: 'Hành lang trước phòng I109' }])
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/spots/search?q=I109', expect.anything())
  })

  it('sends multipart image and optional previous photoId to /api/locate', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      photoId: 'p_abc123',
      spot: 'n_i109',
      label: 'Hành lang trước phòng I109',
      confidence: 0.8,
      tier: 'auto',
      topSim: 0.72,
      top3: [{ spot: 'n_i109', label: 'Hành lang trước phòng I109', votes: 8 }],
      combined: true,
      ms: 85,
    }))
    const client = createWayfinderApi(fetchMock)
    const blob = new Blob(['fake-jpg'], { type: 'image/jpeg' })
    const result = await client.locate(blob, 'p_first')

    expect(result.tier).toBe('auto')
    expect(result.combined).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/locate')
    expect(init?.method).toBe('POST')
    const fd = init?.body as FormData
    expect(fd.get('previous')).toBe('p_first')
    expect(fd.get('image')).toBeInstanceOf(Blob)
  })

  it('sends JSON body to /api/correct only when called', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, indexSize: 241 }))
    const client = createWayfinderApi(fetchMock)
    const res = await client.correct('p_abc123', 'n_i109')
    expect(res.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/correct')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ photoId: 'p_abc123', trueSpot: 'n_i109' })
  })

  it('builds /api/route query for both spot start and GPS coordinates', async () => {
    const sampleRoute: BackendRouteResponse = {
      destination: 'Phòng I109',
      start: 'Cổng chính',
      steps: [
        { kind: 'walk', text: 'Đi 40 m tới Cửa Tòa I', meters: 40, approx: false, mapKind: 'outdoor', building: null, target: { node: 'i_west', label: 'Cửa Tòa I', lat: 21, lng: 105 }, passes: [], side: null },
        { kind: 'arrive', text: 'Bạn đã tới Phòng I109', meters: 0, approx: false, mapKind: 'indoor', building: 'Tòa I', target: { node: 'r_i109', label: 'Phòng I109', lat: null, lng: null }, passes: [], side: 'bên trái' },
      ],
      totalMeters: 40,
      estSeconds: 33,
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(sampleRoute))
      .mockResolvedValueOnce(jsonResponse(sampleRoute))

    const client = createWayfinderApi(fetchMock)
    await client.route({ to: 'i109', start: 'gate_main' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/route?to=i109&start=gate_main')

    await client.route({ to: 'i109', lat: 20.9885, lng: 105.9441 })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/route?to=i109&lat=20.9885&lng=105.9441')
  })

  it('parses FastAPI { detail: { code, message } } errors without swallowing them', async () => {
    const cases: Array<[number, string, string]> = [
      [409, 'no_index', 'Chưa có dữ liệu ảnh.'],
      [400, 'bad_image', 'Không đọc được ảnh'],
      [404, 'no_dest', 'Không tìm thấy điểm đến'],
      [409, 'too_far', 'Bạn đang cách campus khoảng 500 m'],
      [409, 'no_path', 'Chưa có đường nối tới điểm đến này'],
    ]
    for (const [status, code, message] of cases) {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ detail: { code, message } }, status))
      const client = createWayfinderApi(fetchMock)
      await expect(client.route({ to: 'x', start: 'y' })).rejects.toMatchObject({
        name: 'ApiError',
        code,
        message,
        status,
      })
    }
  })

  it('converts network failure to ApiError(offline) and rethrows AbortError as-is', async () => {
    const offlineClient = createWayfinderApi(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(offlineClient.health()).rejects.toBeInstanceOf(ApiError)
    await expect(offlineClient.health()).rejects.toMatchObject({ code: 'offline', status: 0 })

    const abortErr = new DOMException('Aborted', 'AbortError')
    const abortClient = createWayfinderApi(vi.fn<typeof fetch>().mockRejectedValue(abortErr))
    await expect(abortClient.health()).rejects.toBe(abortErr)
  })
})

describe('Backend room & route adapters', () => {
  it('maps backend rooms into Places keeping canonical backend IDs and building fallbacks', () => {
    const rooms: BackendRoom[] = [
      { id: 'r_g106', code: 'G106', name: 'Phòng thực hành G106', aliases: ['superlab', 'lab G'], building: 'Tòa G' },
      { id: 'r_cafe', code: '', name: 'Quầy cà phê', aliases: ['coffee'], building: 'Tòa I' },
      { id: 'r_gate', code: '', name: 'Cổng chính', aliases: ['Main Gate'], building: null },
    ]
    const mapped = rooms.map(mapBackendRoomToPlace)
    expect(mapped[0].id).toBe('r_g106')
    expect(mapped[0].building).toBe('Tòa G')
    expect(mapped[0].short).toBe('G106')
    expect(mapped[0].icon).toBe('room')
    expect(mapped[1].icon).toBe('coffee')
    expect(mapped[1].category).toBe('relax')
    expect(mapped[2].icon).toBe('door')
    expect(mapped[2].building).toBe('Khuôn viên VinUni')

    expect(searchCatalog(mapped, 'superlab').map(p => p.id)).toEqual(['r_g106'])
    expect(searchCatalog(mapped, 'toa g').map(p => p.id)).toEqual(['r_g106'])
    expect(searchCatalog(mapped, 'ca phe', 'relax').map(p => p.id)).toEqual(['r_cafe'])
    expect(searchCatalog(mapped, 'ca phe', 'study')).toEqual([])
  })

  it('derives turn direction and splits travel steps from trailing arrival step', () => {
    const steps: BackendStep[] = [
      { kind: 'walk', text: 'Đi 25 m tới Cửa phía Tây', meters: 25, approx: false, mapKind: 'outdoor', building: null, target: { node: 'n1', label: 'Cửa phía Tây', lat: null, lng: null }, passes: [], side: null },
      { kind: 'door', text: 'Vào Tòa I qua cửa phía Tây', meters: 0, approx: false, mapKind: 'indoor', building: 'Tòa I', target: { node: 'n2', label: 'Cửa phía Tây', lat: null, lng: null }, passes: [], side: null },
      { kind: 'walk', text: 'Rẽ trái và đi khoảng 14 m — Phòng I109 ở bên phải', meters: 14, approx: true, mapKind: 'indoor', building: 'Tòa I', target: { node: 'n3', label: 'Phòng I109', lat: null, lng: null }, passes: [{ name: 'Quầy cà phê', side: 'bên trái' }], side: 'bên phải' },
      { kind: 'walk', text: 'Rẽ phải và đi 10 m', meters: 10, approx: false, mapKind: 'indoor', building: 'Tòa I', target: { node: 'n4', label: 'Ngã rẽ', lat: null, lng: null }, passes: [], side: null },
      { kind: 'walk', text: 'Quay lại và đi 8 m', meters: 8, approx: false, mapKind: 'indoor', building: 'Tòa I', target: { node: 'n5', label: 'Sảnh', lat: null, lng: null }, passes: [], side: null },
      { kind: 'arrive', text: 'Bạn đã tới Phòng I109', meters: 0, approx: false, mapKind: 'indoor', building: 'Tòa I', target: { node: 'n3', label: 'Phòng I109', lat: null, lng: null }, passes: [], side: 'bên phải' },
    ]

    expect(stepDirection(steps[0])).toBe('straight')
    expect(stepDirection(steps[1])).toBe('door')
    expect(stepDirection(steps[2])).toBe('left')
    expect(stepDirection(steps[3])).toBe('right')
    expect(stepDirection(steps[4])).toBe('back')
    expect(stepDirection(steps[5])).toBe('arrive')

    const { travelSteps, arrivalStep } = splitRouteSteps(steps)
    expect(travelSteps).toHaveLength(5)
    expect(arrivalStep?.kind).toBe('arrive')
    expect(arrivalStep?.side).toBe('bên phải')
  })
})
