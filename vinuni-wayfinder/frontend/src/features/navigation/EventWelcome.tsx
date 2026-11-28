import { lazy, Suspense, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SaveButton } from '../../shared/FavoritesContext'
import { useEvents } from '../events/EventContext'
import { EventQrCard } from '../events/EventQrCard'
import { resolveEventMascot, type CampusEvent } from '../events/events'
import type { Place } from '../wayfinder/data'
import { ArrivalMascot } from './ArrivalMascot'
import type { JourneyMode } from './JourneyModeButton'
import type { ArrivalContext } from './eventArrival'
import './eventWelcome.css'

const EventEncounter = lazy(() => import('../events/EventEncounter'))

type Props = {
  event: CampusEvent
  arrival: ArrivalContext
  mode: JourneyMode
  greeting: ReactNode
  place?: Place
  onCameraActiveChange?: (active: boolean) => void
}

export function EventWelcome({ event, arrival, mode, greeting, place, onCameraActiveChange }: Props) {
  const { allMascots } = useEvents()
  const mascot = resolveEventMascot(allMascots, event.mascotId)
  return <section className="event-welcome" aria-labelledby="welcome-title">
    <ArrivalMascot mascot={mascot} className="welcome-stage" />
    <div className="welcome-sheet">
      <h1 id="welcome-title" aria-live="polite">{mascot.name} chào bạn!</h1>
      {greeting}
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
