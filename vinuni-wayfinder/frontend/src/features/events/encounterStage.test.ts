import { describe, expect, it } from 'vitest'
import { frameMascot } from './encounterStage'

describe('AR camera framing', () => {
  it('uses 65% of a phone frame for a standing mascot and supports a smaller or larger photo composition', () => {
    const frame = (zoom = 1) => frameMascot(360, 450, 1.5, 3, .5, .9, zoom)
    expect(frame().scale * 3).toBeCloseTo(450 * .65)
    expect(frame(.6).scale).toBeLessThan(frame().scale)
    expect(frame(1.4).scale).toBeGreaterThan(frame().scale)
  })

  it('keeps the resting model inside the camera when enlarged and tapped near an edge', () => {
    const w = 320, h = 400, modelWidth = 4, modelHeight = 2
    for (const x of [0, 1]) {
      for (const y of [0, 1]) {
        const p = frameMascot(w, h, modelWidth, modelHeight, x, y, 1.4)
        const halfWidth = p.scale * modelWidth / 2
        expect(p.x - halfWidth).toBeGreaterThanOrEqual(-w / 2)
        expect(p.x + halfWidth).toBeLessThanOrEqual(w / 2)
        expect(p.y).toBeGreaterThanOrEqual(-h / 2)
        expect(p.y + p.scale * modelHeight).toBeLessThanOrEqual(h / 2)
      }
    }
  })
})
