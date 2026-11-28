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
  expect(html).toContain('Bạn đã đến Trung tâm Khởi nghiệp rồi!')
  expect(html).toContain('Robotics Open Lab')
  expect(html).toContain('<canvas')
  expect(html.includes('<video')).toBe(mode === 'camera')
  expect(html).toContain('/su-kien/robotics-open-lab')
  // Tới nơi: giữ nguyên màn chào với camera dẫn đường hiện tại và nút mở check-in một chạm, không tự mở modal đè lên.
  expect(html).not.toContain('?chup-anh=1')
  expect(html).not.toContain('Đang mở camera check-in')
  expect(html).toContain('Mã QR Check-in tại cửa')
  expect(html).not.toContain('Tới nơi rồi!')
})
it('reserves the greeting for the last waypoint', () => {
  const html = journey('camera', false)
  expect(html).not.toContain('Tia chào bạn!')
  expect(html).not.toContain('Bạn đã đến Trung tâm Khởi nghiệp rồi!')
})

it('tracks navigation camera suspension cleanly across encounter open, review, close, mode change and unmount', async () => {
  const { shouldSuspendJourneyCamera } = await import('./JourneyCamera')
  expect(shouldSuspendJourneyCamera({ mode: 'camera', arrived: true, hasWelcome: true, encounterCameraActive: false })).toBe(false)
  expect(shouldSuspendJourneyCamera({ mode: 'camera', arrived: true, hasWelcome: true, encounterCameraActive: true })).toBe(true)
  expect(shouldSuspendJourneyCamera({ mode: 'card', arrived: true, hasWelcome: true, encounterCameraActive: true })).toBe(false)
  expect(shouldSuspendJourneyCamera({ mode: 'camera', arrived: false, hasWelcome: true, encounterCameraActive: true })).toBe(false)
  expect(shouldSuspendJourneyCamera({ mode: 'camera', arrived: true, hasWelcome: false, encounterCameraActive: true })).toBe(false)
})
