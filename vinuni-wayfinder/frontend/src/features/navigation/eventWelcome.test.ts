import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { JourneyPage } from './JourneyPage'
import { initialEvents, defaultEventMascot } from '../events/events'

const event = { ...initialEvents[0], mascotId: 'tia3d' }
vi.mock('../events/EventContext', () => ({
  useEventJourney: () => ({ event, link: (url: string) => url }),
  useEvents: () => ({ allMascots: [defaultEventMascot] }),
}))
vi.mock('../events/EventsPages', () => ({ EventJourneyBadge: () => null }))
vi.mock('../mascot/Mascot', async importOriginal => ({ ...await importOriginal<object>(), Mascot: () => null }))
vi.mock('../../shared/FavoritesContext', () => ({ SaveButton: () => null }))
afterEach(() => vi.unstubAllGlobals())
function journey(mode: string, arrived: boolean) {
  vi.stubGlobal('window', {})
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [
    '/hanh-trinh?from=lobby&to=startup&event=robotics-open-lab&mode=' + mode + '&buoc=' + Number(arrived),
  ] }, createElement(JourneyPage)))
}

it.each(['camera', 'card'])('shows the event mascot at the confirmed venue in %s mode', mode => {
  const html = journey(mode, true)
  expect(html).toContain('Tia chào bạn!')
  expect(html).toContain('Robotics Open Lab')
  expect(html).toContain('<canvas')
  expect(html.includes('<video')).toBe(mode === 'camera')
  expect(html).toContain('/su-kien/robotics-open-lab')
  expect(html).toContain('/su-kien/robotics-open-lab?chup-anh=1')
  expect(html).toContain('Chụp ảnh cùng Tia')
  expect(html).toContain('Mã QR Check-in tại cửa')
  expect(html).not.toContain('Tới nơi rồi!')
})
it('reserves the greeting for the last waypoint', () => {
  expect(journey('camera', false)).not.toContain('Tia chào bạn!')
})
