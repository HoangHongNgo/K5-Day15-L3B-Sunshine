import { lazy, Suspense, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SaveButton } from '../../shared/FavoritesContext'
import { useEvents } from '../events/EventContext'
import { EventQrCard } from '../events/EventQrCard'
import { resolveEventMascot, type CampusEvent } from '../events/events'
import type { createEncounterStage } from '../events/encounterStage'
import { MotionContext } from '../mascot/Mascot'
import type { Place } from '../wayfinder/data'
import type { JourneyMode } from './JourneyModeButton'
import type { ArrivalContext } from './eventArrival'
import './eventWelcome.css'

const EventEncounter = lazy(() => import('../events/EventEncounter'))

type Props = {
  event: CampusEvent
  arrival: ArrivalContext
  mode: JourneyMode
  place?: Place
  onCameraActiveChange?: (active: boolean) => void
}

export function EventWelcome({ event, arrival, mode, place, onCameraActiveChange }: Props) {
  const { allMascots } = useEvents()
  const mascot = resolveEventMascot(allMascots, event.mascotId)
  const { paused } = useContext(MotionContext)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    let cancelled = false
    let stage: ReturnType<typeof createEncounterStage> | undefined
    setUnavailable(false)
    import('../events/encounterStage').then(({ createEncounterStage }) => {
      if (cancelled) return
      stage = createEncounterStage(surface, mascot)
      stage.place(.5, .88)
      if (!paused) stage.play('jump')
    }).catch(() => { if (!cancelled) setUnavailable(true) })
    return () => { cancelled = true; stage?.dispose() }
  }, [mascot, paused])

  return <section className="event-welcome" aria-labelledby="welcome-title">
    <div className="welcome-stage">
      <canvas ref={canvas} role="img" aria-label={`Mascot 3D ${mascot.name}`} hidden={unavailable} />
      {unavailable && (mascot.image ? <img src={mascot.image} alt={mascot.name} /> : <p role="status">Thiết bị chưa hiển thị được mascot 3D.</p>)}
    </div>
    <div className="welcome-sheet">
      <h1 id="welcome-title" aria-live="polite">{mascot.name} chào bạn!</h1>
      <p>Chào mừng bạn đến với {event.title}.</p>
      {arrival.currentStop && arrival.currentStop.id !== 'main' && <p>{arrival.currentStop.label}</p>}
      {arrival.nextStop && arrival.nextStopRoute && <Link className="button button-primary" to={`${arrival.nextStopRoute}&mode=${mode}`}>Đi tiếp tới {arrival.nextStop.label}</Link>}
      <Suspense fallback={<p role="status">Đang tải chụp ảnh check-in…</p>}>
        <EventEncounter event={event} mascot={mascot} anchor={event.arAnchor ?? null} arrived onCameraActiveChange={onCameraActiveChange} />
      </Suspense>
      <Link className="button button-quiet" to={`/su-kien/${event.id}`}>Xem sự kiện</Link>
      <details>
        <summary>Mã QR Check-in tại cửa</summary>
        <EventQrCard compact size={180} value={arrival.checkinCode} title="Mã check-in của sự kiện"
          subtitle="Đưa mã này cho ban tổ chức quét tại cửa." copyLabel="Sao chép mã check-in" filename={`checkin-${event.id}`} />
      </details>
      <div className="arrival-actions"><Link to="/">Về bản đồ</Link>{place && <SaveButton place={place} />}</div>
    </div>
  </section>
}
