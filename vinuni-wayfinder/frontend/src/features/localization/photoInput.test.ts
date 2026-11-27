import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { PhotoLocationPage } from './PhotoLocationPage'

vi.mock('../events/EventContext', () => ({ useEventJourney: () => ({ link: (path: string) => path }) }))
vi.mock('./MascotCamera', () => ({ default: () => null }))

it('offers the user’s own image and manual location without sample images', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(PhotoLocationPage)))
  expect(html).toContain('Chọn ảnh có sẵn')
  expect(html).toContain('Chọn vị trí bằng tên phòng')
  expect(html).not.toContain('/anh-mau')
})
