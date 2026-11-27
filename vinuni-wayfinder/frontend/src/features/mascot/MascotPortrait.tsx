import { useEffect, useState } from 'react'
import { Box } from 'lucide-react'
import type { MascotAsset } from '../events/events'

export function MascotPortrait({ asset, angle = 0 }: { asset: MascotAsset; angle?: number }) {
  const [photo, setPhoto] = useState<{ asset: MascotAsset; angle: number; url: string }>()
  useEffect(() => {
    if (angle === 0 && asset.image) return
    let active = true
    import('./renderPortrait').then(({ mascotPortrait }) => {
      if (active) setPhoto({ asset, angle, url: mascotPortrait(asset, angle) })
    }).catch(() => { /* The named library card stays usable without WebGL. */ })
    return () => { active = false }
  }, [asset, angle])
  const url = photo?.asset === asset && photo.angle === angle ? photo.url : asset.image
  return url
    ? <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    : <Box aria-hidden="true" style={{ width: '40%', height: '40%', margin: '30%' }} />
}
