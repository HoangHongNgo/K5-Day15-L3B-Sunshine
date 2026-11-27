import sharp from 'sharp'

const source = 'public/images/logo.JPG'
for (const [name, size] of [['favicon-48', 48], ['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512], ['maskable-512', 512]]) {
  const maskable = name === 'maskable-512'
  const inner = maskable ? 384 : size
  const margin = (size - inner) / 2
  await sharp(source).rotate().resize(inner, inner, { fit: 'cover' })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: '#ffffff' })
    .png().toFile(`public/icons/${name}.png`)
}
