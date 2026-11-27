import { describe, expect, it, vi } from 'vitest'
import { assessEncounterLocation, captureEncounterPhoto, submitEncounterPhoto } from './eventEncounterMedia'

const anchor = { lat: 21, lon: 105 }
const fix = { latitude: 21, longitude: 105, accuracy: 6 }

describe('mở khóa mascot tại sự kiện', () => {
  it('accepts an accurate fix at the event', () => {
    expect(assessEncounterLocation(anchor, fix)).toMatchObject({ status: 'near', meters: 0 })
  })

  it('gives the distance when the attendee is outside the radius', () => {
    expect(assessEncounterLocation(anchor, { ...fix, latitude: 21.001 })).toMatchObject({ status: 'far', meters: 111 })
  })

  it('keeps the camera locked for missing anchors or uncertain fixes', () => {
    expect(assessEncounterLocation(null, fix).status).toBe('missing')
    expect(assessEncounterLocation({ lat: -91, lon: 105 }, fix).status).toBe('missing')
    for (const accuracy of [100, NaN, -1]) {
      expect(assessEncounterLocation(anchor, { ...fix, accuracy }).status).toBe('uncertain')
    }
    expect(assessEncounterLocation(anchor, { ...fix, latitude: Infinity }).status).toBe('uncertain')
  })
})

describe('ảnh ghép camera và mô hình', () => {
  it.each([true, false])('draws the centered camera crop behind the full overlay, selfie mode %s', (selfie) => {
    const ops: unknown[][] = []
    const ctx = Object.fromEntries(['save', 'translate', 'scale', 'drawImage', 'restore'].map(method =>
      [method, (...args: unknown[]) => ops.push([method, ...args])]))
    const output = { width: 0, height: 0, getContext: () => ctx, toDataURL: vi.fn(() => 'data:image/jpeg;base64,abcd') }
    const video = { videoWidth: 1600, videoHeight: 900 }
    const overlay = { width: 600, height: 800 }
    const image = captureEncounterPhoto(video as HTMLVideoElement, overlay as HTMLCanvasElement, selfie, output as unknown as HTMLCanvasElement)
    expect([output.width, output.height]).toEqual([600, 800])
    expect(ops.filter(([op]) => op === 'drawImage')).toEqual([
      ['drawImage', video, 462.5, 0, 675, 900, 0, 0, 600, 800],
      ['drawImage', overlay, 0, 0, 600, 800],
    ])
    if (selfie) {
      expect(ops.indexOf(ops.find(([op]) => op === 'restore')!)).toBeGreaterThan(ops.findIndex(([op]) => op === 'drawImage'))
      expect(ops.slice(0, 3)).toEqual([['save'], ['translate', 600, 0], ['scale', -1, 1]])
    } else expect(ops.some(([op]) => op === 'scale')).toBe(false)
    expect(image).toMatch(/^data:image\/jpeg;/)
  })

  it('only sends the reviewed photo after consent and reports server rejection', async () => {
    const image = 'data:image/jpeg;base64,aGVsbG8='
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
    await expect(submitEncounterPhoto('id/t', image, false, send)).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    await expect(submitEncounterPhoto('id/t', image, true, send)).rejects.toThrow()
    expect(send.mock.calls[0][0]).toBe('/api/events/id%2Ft/photos')
    expect(send.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toEqual({ image })
    send.mockResolvedValue(Response.json({ detail: 'Album đã đầy.' }, { status: 409 }))
    await expect(submitEncounterPhoto('id/t', image, true, send)).rejects.toThrow('Album đã đầy.')
    send.mockResolvedValue(new Response('<html>Offline</html>'))
    await expect(submitEncounterPhoto('id/t', image, true, send)).rejects.toThrow()
    send.mockResolvedValue(Response.json({ id: 'photo-1', status: 'pending' }, { status: 201 }))
    await expect(submitEncounterPhoto('id/t', image, true, send)).resolves.toBeUndefined()
  })
})
