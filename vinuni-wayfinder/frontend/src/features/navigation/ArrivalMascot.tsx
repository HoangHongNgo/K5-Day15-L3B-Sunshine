import { useContext, useEffect, useEffectEvent, useRef, useState } from 'react'
import { defaultMascot, type MascotAsset } from '../events/events'
import type { createEncounterStage } from '../events/encounterStage'
import { Mascot, MotionContext } from '../mascot/Mascot'
import './arrivalMascot.css'

export function ArrivalMascot({ mascot, className = '' }: { mascot: MascotAsset; className?: string }) {
  const { paused } = useContext(MotionContext)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<ReturnType<typeof createEncounterStage> | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const jump = useEffectEvent(() => { if (!paused) stage.current?.play('jump') })

  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    let cancelled = false
    import('../events/encounterStage').then(({ createEncounterStage }) => {
      if (cancelled) return
      stage.current = createEncounterStage(surface, mascot)
      stage.current.place(.5, .88)
      jump()
      setUnavailable(false)
    }).catch(() => { if (!cancelled) setUnavailable(true) })
    return () => {
      cancelled = true
      stage.current?.dispose()
      stage.current = null
    }
  }, [mascot])

  useEffect(() => { if (paused) stage.current?.play(null) }, [paused])

  return <div className={`arrival-mascot ${className}`}>
    <canvas ref={canvas} role="img" aria-label={`Mascot 3D ${mascot.name}`} hidden={unavailable} />
    {unavailable && <div className={`arrival-mascot-fallback${paused ? '' : ' arrival-mascot-hop'}`}>
      {mascot.image ? <img src={mascot.image} alt={mascot.name} /> : <Mascot asset={defaultMascot} size={104} />}
    </div>}
  </div>
}
