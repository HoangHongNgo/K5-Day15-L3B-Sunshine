import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { expect, it } from 'vitest'
import { defaultMascot, initialEvents } from './events'
import EventEncounter from './EventEncounter'

it('offers a GPS check before showing the camera', () => {
  const html = renderToStaticMarkup(createElement(EventEncounter, { event: { ...initialEvents[0], demo: false }, mascot: defaultMascot, anchor: { lat: 21, lon: 105 } }))
  expect(html).toContain('Kiểm tra vị trí')
  expect(html).not.toContain('<video')
})

it('explains why an event without coordinates cannot open an encounter', () => {
  const html = renderToStaticMarkup(createElement(EventEncounter, { event: { ...initialEvents[0], demo: false }, mascot: defaultMascot, anchor: null }))
  expect(html).toContain('chưa có tọa độ')
  expect(html).not.toContain('Kiểm tra vị trí')
  expect(html).not.toContain('<video')
})

it('unlocks a simulated 20 m position only for a demo event with an anchor', () => {
  const html = renderToStaticMarkup(createElement(EventEncounter, {
    event: { ...initialEvents[0], demo: true }, mascot: defaultMascot, anchor: { lat: 90, lon: 180 },
  }))
  expect(html).toContain('GPS mô phỏng')
  expect(html).toContain('20 m')
  expect(html).toContain('Mở camera AR')
  expect(html).not.toContain('<video')
})

it('keeps real GPS as the default and offers an explicit mock for a new local test event', () => {
  const html = renderToStaticMarkup(createElement(EventEncounter, {
    event: { ...initialEvents[0], demo: false }, mascot: defaultMascot, anchor: { lat: 10, lon: 20 },
  }))
  expect(html).toContain('Dùng vị trí mô phỏng')
  expect(html).not.toContain('Mở camera AR')
})

it('unlocks one-tap check-in CTA after the walker arrives by route, without auto-opening a second camera or GPS check', () => {
  const html = renderToStaticMarkup(createElement(EventEncounter, {
    event: { ...initialEvents[0], demo: false }, mascot: defaultMascot, anchor: { lat: 21, lon: 105 }, arrived: true,
  }))
  expect(html).toContain(`Chụp ảnh check-in cùng ${defaultMascot.name}`)
  expect(html).not.toContain('<video')
  expect(html).not.toContain('Kiểm tra vị trí')
})
