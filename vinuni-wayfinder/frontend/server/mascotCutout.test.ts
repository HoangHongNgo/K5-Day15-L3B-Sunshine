import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { chooseChromaKey, mascotCutout } from './mascotCutout'

describe('Server-side cutout', () => {
  it('removes either key while preserving opaque white, navy and warm orange', async () => {
    for (const key of ['green', 'magenta'] as const) {
      const backdrop = key === 'green' ? [0, 255, 0, 255] : [255, 0, 255, 255]
      const source = Buffer.from([...backdrop, 255, 255, 255, 255, 40, 55, 90, 255, 240, 130, 40, 255])
      const png = await sharp(source, { raw: { width: 4, height: 1, channels: 4 } }).png().toBuffer()
      const image = await mascotCutout(png, key)
      const raw = await sharp(image).ensureAlpha().raw().toBuffer()
      expect([raw[3], raw[7], raw[11], raw[15]]).toEqual([0, 255, 255, 255])
    }
  })
  it('avoids pink or purple chroma when that color is part of the brief', () => {
    expect(chooseChromaKey('Mèo hồng')).toBe('green')
    expect(chooseChromaKey('Ếch xanh lá')).toBe('magenta')
  })
})
