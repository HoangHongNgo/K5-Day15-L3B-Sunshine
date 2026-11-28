import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { PhotoLocationPage } from './PhotoLocationPage'

vi.mock('../events/EventContext', () => ({ useEventJourney: () => ({ link: (path: string) => path }) }))
vi.mock('./MascotCamera', () => ({ default: () => null }))

it('is a single shutter: no upload step, manual room choice kept as a fallback', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(PhotoLocationPage)))
  expect(html).toContain('Chụp để định vị')
  expect(html).toContain('Chọn bằng tên phòng')
  expect(html).not.toContain('Chọn ảnh có sẵn')
  expect(html).not.toContain('type="file"')
  expect(html).not.toContain('/anh-mau')
})
