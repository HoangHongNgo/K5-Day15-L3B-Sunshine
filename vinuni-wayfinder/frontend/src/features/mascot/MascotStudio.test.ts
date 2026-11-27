import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { MascotCreator, MascotPicker } from './MascotStudio'
import { builtInMascots } from '../events/events'

vi.mock('../events/EventContext', () => ({
  useEvents: () => ({ allMascots: [...builtInMascots, { id: 'old', name: 'Ảnh cũ', kind: 'image' }] }),
  useEventJourney: () => ({ mascot: builtInMascots[0] }),
}))
vi.mock('../events/AuthContext', () => ({ useAuth: () => ({ token: 'test' }) }))

it('offers real 3D companions for new events and keeps legacy images out of the picker', () => {
  vi.stubGlobal('document', { hidden: false })
  try {
    const html = renderToStaticMarkup(createElement(MascotPicker, { selected: 'tia3d', onChange() {} }))
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Tia')
    expect(html).not.toContain('Ảnh cũ')
    expect(html).not.toContain('data-mascot="vini"')
  } finally { vi.unstubAllGlobals() }
})

it('lets an organizer describe a 3D character and preview it before selecting it', () => {
  const html = renderToStaticMarkup(createElement(MascotCreator, { club: 'Robotics', onUse() {} }))
  expect(html).toContain('Tạo mascot 3D')
  expect(html).not.toContain('Tải ảnh lên')
  expect(html).not.toContain('type="file"')
})
