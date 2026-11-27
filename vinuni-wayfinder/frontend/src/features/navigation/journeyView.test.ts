import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { Brand } from '../../shared/ui'
import { PlanRoutePage } from './PlanRoutePage'
import { JourneyPage } from './JourneyPage'

vi.mock('../events/EventContext', () => ({ useEventJourney: () => ({ link: (path: string) => path }) }))
vi.mock('../events/EventsPages', () => ({ EventJourneyBadge: () => null }))
vi.mock('../mascot/Mascot', () => ({ Mascot: () => null }))

afterEach(() => vi.unstubAllGlobals())

function render(Page: typeof JourneyPage, url: string) {
  vi.stubGlobal('window', {})
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, createElement(Page)))
}

it('offers camera by default and cards before starting a walk', () => {
  const html = render(PlanRoutePage, '/di-den?from=lobby&to=i109')
  expect(html).toContain('Bắt đầu với camera')
  expect(html).toContain('Thẻ chỉ đường')
  expect(html).not.toContain('<video')
})

it('opens camera at the requested waypoint, with the instruction and manual confirmation', () => {
  const html = render(JourneyPage, '/hanh-trinh?from=lobby&to=i109&mode=camera&buoc=1')
  expect(html).toContain('<video')
  expect(html).toContain('Rẽ phải về phía khu tự học mở.')
  expect(html).toContain('Đã tới mốc')
  expect(html).toContain('Thẻ chỉ đường')
})

it('opens cards at the same waypoint and offers switching back', () => {
  const html = render(JourneyPage, '/hanh-trinh?from=lobby&to=i109&mode=card&buoc=1')
  expect(html).toContain('Rẽ phải về phía khu tự học mở.')
  expect(html).not.toContain('<video')
  expect(html).toContain('Camera')
})

it('shows the project logo in the app header', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(Brand)))
  expect(html).toContain('/icons/icon-192.png')
})

it('keeps playback and install controls out of the shared header', async () => {
  const shell = (await import('../../App.tsx?raw')).default
  const header = shell.slice(shell.indexOf('<header'), shell.indexOf('</header>'))
  expect(header).not.toMatch(/Dừng chuyển động|Cài VinUni AR Map/)
})
