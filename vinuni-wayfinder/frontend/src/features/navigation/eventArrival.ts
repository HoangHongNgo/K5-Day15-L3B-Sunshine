import type { CampusEvent, EventStop } from '../events/events'

export type ArrivalStopInfo = {
  id: string
  label: string
  locationId: string
  note?: string
}

export type ArrivalContext = {
  checkinCode: string
  currentStop: ArrivalStopInfo | null
  nextStop: ArrivalStopInfo | null
  nextStopRoute: string | null
  stopIndex: number
  totalStops: number
}

function toStopInfo(stop: EventStop): ArrivalStopInfo {
  return stop.note !== undefined
    ? { id: stop.id, label: stop.label, locationId: stop.locationId, note: stop.note }
    : { id: stop.id, label: stop.label, locationId: stop.locationId }
}

export function resolveArrivalContext(
  event: CampusEvent,
  currentTo: string,
  stopId?: string | null,
): ArrivalContext {
  const checkinCode = `SUNSHINE-CHECKIN:${event.id}`
  const extraStops = event.stops ?? []

  if (extraStops.length === 0) {
    return {
      checkinCode,
      currentStop: null,
      nextStop: null,
      nextStopRoute: null,
      stopIndex: 0,
      totalStops: 1,
    }
  }

  const ordered: ArrivalStopInfo[] = [
    { id: 'main', label: event.title, locationId: event.locationId },
    ...extraStops.map(toStopInfo),
  ]

  let idx = stopId ? ordered.findIndex(stop => stop.id === stopId) : -1
  if (idx === -1) {
    idx = ordered.findIndex(stop => stop.locationId === currentTo)
  }

  if (idx === -1) {
    return {
      checkinCode,
      currentStop: null,
      nextStop: null,
      nextStopRoute: null,
      stopIndex: -1,
      totalStops: ordered.length,
    }
  }

  const currentStop = ordered[idx]
  const nextStop = ordered[idx + 1] ?? null
  const nextStopRoute = nextStop
    ? `/hanh-trinh?from=${encodeURIComponent(currentTo)}&to=${encodeURIComponent(nextStop.locationId)}&event=${encodeURIComponent(event.id)}&stop=${encodeURIComponent(nextStop.id)}`
    : null

  return {
    checkinCode,
    currentStop,
    nextStop,
    nextStopRoute,
    stopIndex: idx,
    totalStops: ordered.length,
  }
}
