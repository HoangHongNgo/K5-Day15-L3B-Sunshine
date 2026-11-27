import sharp from 'sharp'

export type ChromaKey = 'green' | 'magenta'
export function chooseChromaKey(brief: string): ChromaKey { return /hồng|tím|pink|purple|magenta/i.test(brief) ? 'green' : 'magenta' }
/** Convert the deliberately flat key background into real alpha, then resize.
 * This runs only on the server; uploads are never sent here or to OpenAI. */
export async function mascotCutout(input: Buffer, key: ChromaKey): Promise<Buffer> {
  const { data, info } = await sharp(input, { limitInputPixels: 4_194_304 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const color = key === 'green' ? [0, 255, 0] : [255, 0, 255]
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const anchor = key === 'green' ? Math.max(r, b) : g
    const dominance = (key === 'green' ? g : Math.min(r, b)) - anchor
    const distance = Math.max(Math.abs(r - color[0]), Math.abs(g - color[1]), Math.abs(b - color[2]))
    if (dominance <= 16 && distance > 32) continue
    const ramp = Math.max(0, Math.min(1, (distance - 90) / 120))
    const alpha = Math.min(ramp * ramp * (3 - 2 * ramp), 1 - Math.max(0, dominance) / Math.max(1, 255 - anchor))
    data[i + 3] = alpha < .04 ? 0 : Math.round(data[i + 3] * alpha)
    if (data[i + 3] < 252) {
      if (key === 'green') data[i + 1] = Math.min(g, anchor)
      else { data[i] = Math.min(r, anchor); data[i + 2] = Math.min(b, anchor) }
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp({ quality: 92 }).toBuffer()
}
