import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, MapPin, Navigation } from 'lucide-react'
import { useEvents } from './EventContext'
import { eventDate, eventRoute, validateEvent } from './events'
import { eventPhaseLabel, getEventPhase, pickFeaturedEvents } from './eventSchedule'
import { useWayfinder } from '../wayfinder/WayfinderContext'

export function FeaturedEventsStrip() {
  const { events } = useEvents()
  const { getPlace } = useWayfinder()
  const now = new Date()
  const published = events.filter(e => e.status === 'published' && !validateEvent(e, true, getPlace))
  const featured = pickFeaturedEvents(published, now, 3)

  if (!featured.length) return null

  return (
    <section className="featured-events" aria-label="Sự kiện tại VinUni">
      <div className="featured-events-head">
        <h2>
          <CalendarDays size={16} aria-hidden="true" />
          Sự kiện tại VinUni
        </h2>
        <Link to="/su-kien" className="featured-events-all">
          Xem tất cả
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <div className="featured-event-list">
        {featured.map(event => {
          const phase = getEventPhase(event, now)
          const placeName = getPlace(event.locationId)?.name || 'VinUni'
          return (
            <article className="featured-event-item" key={event.id}>
              <Link to={`/su-kien/${event.id}`} className="featured-event-link">
                <span className={`phase-badge phase-${phase}`}>{eventPhaseLabel(phase)}</span>
                <strong>{event.title}</strong>
                <span className="featured-event-meta">
                  <MapPin size={13} aria-hidden="true" />
                  <span>
                    {placeName} · {eventDate(event.startsAt)}
                  </span>
                </span>
              </Link>
              <Link
                to={eventRoute(event)}
                className="featured-event-go icon-button"
                aria-label={`Dẫn đường tới ${event.title}`}
                title={`Dẫn đường tới ${event.title}`}
              >
                <Navigation size={16} aria-hidden="true" />
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default FeaturedEventsStrip
