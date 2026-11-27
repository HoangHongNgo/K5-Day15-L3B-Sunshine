import { expect, it } from 'vitest'
import { emptyEvent, isEvent, isAnchor, defaultMascot } from './events'
it('keeps 2D navigation independent from the event mascot', () => {
  expect(defaultMascot.id).toBe('vini')
  expect(emptyEvent().mascotId).toBe('tia3d')
})
it('keeps legacy events and rejects invalid geographic anchors', () => {
  const event = emptyEvent()
  expect(isEvent(event)).toBe(true)
  expect(isAnchor({lat:0,lon:0})).toBe(true)
  for (const arAnchor of [{lat:91,lon:10},{lat:0,lon:null},{lat:12,lon:Infinity}]) {
    expect(isEvent({...event,arAnchor})).toBe(false)
  }
})

it('uses Tia at legacy events and the selected model at new events', async () => {
  const { resolveEventMascot, builtInMascots } = await import('./events')
  const model = {id: 'robot-leaf', name: 'Mầm', kind: 'model3d' as const}
  const library = [...builtInMascots, model]
  expect(resolveEventMascot(library, 'boba').id).toBe('tia3d')
  expect(resolveEventMascot(library, 'removed').id).toBe('tia3d')
  expect(resolveEventMascot(library, model.id)).toBe(model)
})

it('retains a saved mascot for each club when more than twelve are cached', async () => {
  const { readEventStore } = await import('./events')
  const mascots = Array.from({ length: 15 }, (_, i) => ({
    id: 'club-' + i, name: 'Tên mẫu ' + i, kind: 'image', image: 'data:image/png;base64,AAAA',
  }))
  expect(readEventStore(JSON.stringify({version: 1, events: [], mascots})).mascots).toEqual(mascots)
})
