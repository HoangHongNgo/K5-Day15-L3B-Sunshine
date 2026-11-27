import type { CampusEvent } from './events'

export type EventPhase = 'live' | 'today' | 'upcoming' | 'ended'
export type EventTimeFilter = 'all' | 'live' | 'today' | 'upcoming' | 'ended'

export const eventTimeFilters: { id: EventTimeFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'live', label: 'Đang diễn ra' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'upcoming', label: 'Sắp tới' },
  { id: 'ended', label: 'Đã kết thúc' },
]

const PHASE_LABELS: Record<EventPhase, string> = {
  live: 'Đang diễn ra',
  today: 'Hôm nay',
  upcoming: 'Sắp tới',
  ended: 'Đã kết thúc',
}

const PHASE_PRIORITY: Record<EventPhase, number> = {
  live: 0,
  today: 1,
  upcoming: 2,
  ended: 3,
}

const vnDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function vnDayKey(ms: number): string {
  return vnDayFormatter.format(new Date(ms))
}

function parseTimestamp(value: string, fallback: number): number {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : fallback
}

export function getEventPhase(
  event: Pick<CampusEvent, 'startsAt' | 'endsAt'>,
  now: Date = new Date(),
): EventPhase {
  const start = Date.parse(event.startsAt)
  const end = Date.parse(event.endsAt)
  const nowMs = now.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(nowMs)) {
    return 'upcoming'
  }
  if (start <= nowMs && nowMs <= end) return 'live'
  if (nowMs > end) return 'ended'
  if (start > nowMs && vnDayKey(start) === vnDayKey(nowMs)) return 'today'
  return 'upcoming'
}

export function eventPhaseLabel(phase: EventPhase): string {
  return PHASE_LABELS[phase]
}

export function filterEventsByTime(
  events: CampusEvent[],
  filter: EventTimeFilter,
  now: Date = new Date(),
): CampusEvent[] {
  const annotated = events
    .map(event => ({ event, phase: getEventPhase(event, now) }))
    .filter(({ phase }) => {
      if (filter === 'all') return true
      if (filter === 'today') return phase === 'live' || phase === 'today'
      return phase === filter
    })

  annotated.sort((a, b) => {
    const rankDiff = PHASE_PRIORITY[a.phase] - PHASE_PRIORITY[b.phase]
    if (rankDiff !== 0) return rankDiff
    if (a.phase === 'ended') {
      return (
        parseTimestamp(b.event.endsAt, Number.NEGATIVE_INFINITY) -
        parseTimestamp(a.event.endsAt, Number.NEGATIVE_INFINITY)
      )
    }
    return (
      parseTimestamp(a.event.startsAt, Number.POSITIVE_INFINITY) -
      parseTimestamp(b.event.startsAt, Number.POSITIVE_INFINITY)
    )
  })

  return annotated.map(item => item.event)
}

export function pickFeaturedEvents(
  events: CampusEvent[],
  now: Date = new Date(),
  limit = 3,
): CampusEvent[] {
  if (limit <= 0 || events.length === 0) return []
  const ordered = filterEventsByTime(events, 'all', now)
  const activeOrUpcoming = ordered.filter(event => getEventPhase(event, now) !== 'ended')
  const pool = activeOrUpcoming.length > 0 ? activeOrUpcoming : ordered
  return pool.slice(0, limit)
}
