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
  expect(html).toContain('Đi bộ')
  expect(html).toContain('Mở miệng nói')
  expect(html).toContain('khung xương')
})

it('opens a custom mascot directly via ?mascot= from the club mascot library', async () => {
  const { vi } = await import('vitest')
  const custom: MascotAsset = {
    id: 'fox-club',
    kind: 'model3d',
    name: 'Cáo CLB',
    recipe: {
      version: 1,
      parts: [
        { group: 'body', shape: 'ellipsoid', color: '#efa62e', position: [0, 1, 0], size: [1, 1.4, 0.8], rotation: [0, 0, 0] },
        { group: 'mouth', shape: 'ellipsoid', color: '#202a35', position: [0, 1.3, 0.42], size: [0.2, 0.08, 0.08], rotation: [0, 0, 0] },
        { group: 'rightArm', shape: 'ellipsoid', color: '#efa62e', position: [0.55, 1, 0], size: [0.2, 0.6, 0.2], rotation: [0, 0, 0] },
        { group: 'leftArm', shape: 'ellipsoid', color: '#efa62e', position: [-0.55, 1, 0], size: [0.2, 0.6, 0.2], rotation: [0, 0, 0] },
      ],
    },
  }
  vi.resetModules()
  vi.doMock('../events/EventContext', () => ({
    useEvents: () => ({ events: [], allMascots: [custom] }),
  }))
  try {
    const Demo = (await import('./Mascot3dDemo')).default
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/mascot-3d?mascot=fox-club'] }, createElement(Demo)))
    expect(html).toContain('Chào Cáo CLB')
    expect(html).toContain('href="/clb/mascot"')
    expect(html).toContain('đi bộ')
    expect(html).not.toContain('khung xương')
  } finally {
    vi.doUnmock('../events/EventContext')
  }
})

it('serves the shared 360 viewer URL on direct visits', async () => {
  const { readFileSync } = await import('node:fs')
  const { rewrites } = JSON.parse(readFileSync('vercel.json', 'utf8'))
  expect(rewrites).toContainEqual({ source: '/mascot-3d', destination: '/index.html' })
})
