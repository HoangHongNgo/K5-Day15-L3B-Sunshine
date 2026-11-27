import { createContext, useContext, useEffect, useState } from 'react'
import { useEventJourney } from '../events/EventContext'
import type { MascotAsset } from '../events/events'

export const MotionContext = createContext({ paused: false, toggle: () => {} })
export type MascotMood = 'idle' | 'right' | 'left' | 'walk' | 'wave' | 'jump' | 'wait'

// Six generated poses in a 3 × 2 atlas. Both directions share the pointing
// pose; mirroring happens outside the animated element so it never flips back.
const poses: Record<MascotMood, readonly [number, number]> = {
  idle: [0, 0], wave: [1, 0], right: [2, 0], left: [2, 0],
  wait: [0, 1], walk: [1, 1], jump: [2, 1],
}

/** Vini is a 2D cutout with CSS motion, not a rigged 3D character. */
export function Mascot({ mood = 'idle', size = 96, className = '', asset: override }: { mood?: MascotMood; size?: number; className?: string; asset?: MascotAsset }) {
  const { paused } = useContext(MotionContext)
  const { mascot } = useEventJourney()
  const asset = override ?? mascot
  const [hidden, setHidden] = useState(document.hidden)
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  const [column, row] = poses[mood]
  const bobaRow = { idle: 0, wave: 3, right: 1, left: 1, wait: 6, walk: 1, jump: 4 }[mood]
  const height = asset.kind === 'boba' ? size * 208 / 192 : size
  return <span aria-hidden="true" data-mascot={asset.id} data-mood={mood} data-motion={paused || hidden ? 'paused' : 'running'} className={`mascot-sprite ${className}`} style={{ width: size, height }}>
    <span className="mascot-facing" style={{ transform: mood === 'left' ? 'scaleX(-1)' : undefined }}>
      {asset.kind === 'image' ? <img className="mascot-art custom-mascot-art" src={asset.image} alt="" draggable={false} /> : <span className="mascot-art" style={asset.kind === 'boba' ? { backgroundImage: 'url(/pets/boba/spritesheet.webp)', backgroundSize: `${size * 8}px ${height * 11}px`, backgroundPosition: `0px ${-bobaRow * height}px`, imageRendering: 'pixelated' } : { backgroundSize: `${size * 3}px ${size * 2}px`, backgroundPosition: `${-column * size}px ${-row * size}px` }} />}
    </span>
  </span>
}
