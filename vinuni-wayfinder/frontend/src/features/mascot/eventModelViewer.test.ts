import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import * as viewer from './Mascot3dDemo'
import type { MascotAsset } from '../events/events'

it('labels the 360 viewer, motion controls and return link for the selected event mascot', () => {
  const mascot: MascotAsset = { id: 'sprout', kind: 'model3d', name: 'Mầm' }
  const html = renderToStaticMarkup(createElement(MemoryRouter, {},
    createElement(viewer.MascotModelViewer, { mascot, eventId: 'demo' })))
  expect(html).toContain('Xem mascot Mầm 3D')
  expect(html).toContain('Động tác của Mầm')
  expect(html).toContain('href="/su-kien/demo"')
  expect(html).toContain('Mở miệng nói')
})

it('serves the shared 360 viewer URL on direct visits', async () => {
  const { readFileSync } = await import('node:fs')
  const { rewrites } = JSON.parse(readFileSync('vercel.json', 'utf8'))
  expect(rewrites).toContainEqual({ source: '/mascot-3d', destination: '/index.html' })
})
