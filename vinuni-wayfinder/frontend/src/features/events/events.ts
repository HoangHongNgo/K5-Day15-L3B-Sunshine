import { isMascotRecipe, type MascotRecipe } from '../mascot/mascotRecipe'
import { getPlace } from '../wayfinder/data'

export type MascotAsset = {
  id: string
  name: string
  kind: 'vini' | 'boba' | 'tia' | 'image' | 'model3d'
  recipe?: MascotRecipe
  image?: string
  brief?: string
  ownerId?: string | null
}

export type EventStop = {
  id: string
  label: string
  locationId: string
  note?: string
}

export type EventAnchor = { lat: number; lon: number }
export function isAnchor(value: unknown): value is EventAnchor {
  if (!value || typeof value !== 'object') return false
  const { lat, lon } = value as EventAnchor
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
}
export type CampusEvent = {
  arAnchor?: EventAnchor | null
  id: string
  title: string
  club: string
  description: string
  locationId: string
  startsAt: string
  endsAt: string
  mascotId: string
  status: 'draft' | 'published'
  demo?: boolean
  stops?: EventStop[]
  ownerId?: string | null
  viewsCount?: number
  navigationsCount?: number
}

export type EventStore = { version: 1; events: CampusEvent[]; mascots: MascotAsset[] }
export const eventStorageKey = 'vinuni-ar-map.events.v1'
export const defaultMascot: MascotAsset = { id: 'vini', name: 'Vini', kind: 'vini' }
export const defaultEventMascot: MascotAsset = { id: 'tia3d', name: 'Tia', kind: 'tia' }
export const builtInMascots: MascotAsset[] = [defaultMascot, { id: 'boba', name: 'Boba', kind: 'boba' }, defaultEventMascot]
export function resolveEventMascot(library: MascotAsset[], id: string): MascotAsset {
  return library.find(m => m.id === id && (m.kind === 'model3d' || m.kind === 'tia')) ?? defaultEventMascot
}

export const initialEvents: CampusEvent[] = [{
  id: 'robotics-open-lab',
  title: 'Robotics Open Lab',
  club: 'CLB Robotics (mẫu)',
  description: 'Gặp gỡ những người bạn thích robot, khám phá ý tưởng mới và thử một hành trình tới không gian của CLB. Đây là sự kiện minh hoạ để trải nghiệm sản phẩm, không phải lịch tổ chức thực tế.',
  locationId: 'startup',
  startsAt: '2026-11-28T14:00:00+07:00',
  endsAt: '2026-11-28T16:00:00+07:00',
  mascotId: 'boba',
  status: 'published',
  demo: true,
}]

export function emptyEvent(): CampusEvent {
  return {
    id: crypto.randomUUID(),
    title: '',
    club: '',
    description: '',
    locationId: '',
    startsAt: '',
    endsAt: '',
    mascotId: 'tia3d',
    status: 'draft',
    stops: [],
  }
}

const text = (v: unknown, limit: number) => typeof v === 'string' && v.length <= limit

export function isEventStop(v: unknown): v is EventStop {
  if (!v || typeof v !== 'object') return false
  const s = v as EventStop
  return text(s.id, 80) && /^[\w-]+$/.test(s.id) && text(s.label, 80) && text(s.locationId, 80) && (s.note === undefined || text(s.note, 200))
}

export function isMascot(v: unknown): v is MascotAsset {
  if (!v || typeof v !== 'object') return false
  const m = v as MascotAsset
  if (!(text(m.id, 80) && /^[\w-]+$/.test(m.id) && text(m.name, 40) && m.name.trim() && (m.brief === undefined || text(m.brief, 700)))) return false
  const builtin = builtInMascots.find(asset => asset.id === m.id)
  if (builtin) return m.kind === builtin.kind
  const imageOk = typeof m.image === 'string' && m.image.length <= 800_000 && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(m.image)
  if (m.kind === 'model3d') return isMascotRecipe(m.recipe) && (m.image === undefined || imageOk)
  return m.kind === 'image' && imageOk
}

export function isCustomMascot(value: unknown): value is MascotAsset {
  return isMascot(value) && (value.kind === 'image' || value.kind === 'model3d')
}

export function isEvent(v: unknown): v is CampusEvent {
  if (!v || typeof v !== 'object') return false
  const e = v as CampusEvent
  const stopsOk = e.stops === undefined || (Array.isArray(e.stops) && e.stops.length <= 12 && e.stops.every(isEventStop))
  return (e.arAnchor == null || isAnchor(e.arAnchor)) && stopsOk && text(e.id, 80) && /^[\w-]+$/.test(e.id) && text(e.title, 100) && text(e.club, 80) && text(e.description, 1500) && text(e.locationId, 80) && text(e.startsAt, 40) && text(e.endsAt, 40) && text(e.mascotId, 80) && ['draft', 'published'].includes(e.status)
}

export function eventHasLocation(event: CampusEvent, locationId: string | null | undefined): boolean {
  if (!locationId) return false
  if (event.locationId === locationId) return true
  return (event.stops ?? []).some(s => s.locationId === locationId)
}

export function validateEvent(e: CampusEvent, publish = true, placeLookup: (id: string | null | undefined) => unknown = getPlace): string | null {
  if (!isEvent(e)) return 'Thông tin sự kiện không hợp lệ hoặc quá dài.'
  if (!e.title.trim()) return 'Hãy đặt tên cho sự kiện.'
  if (!publish) return null
  if (!e.club.trim()) return 'Hãy nhập tên câu lạc bộ hoặc đơn vị tổ chức.'
  if (!placeLookup(e.locationId)) return 'Chọn địa điểm trong danh mục để có thể dẫn đường.'
  if (!e.description.trim()) return 'Thêm một mô tả ngắn để người tham dự hiểu sự kiện.'
  const start = Date.parse(e.startsAt), end = Date.parse(e.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Chọn đầy đủ thời gian bắt đầu và kết thúc.'
  if (end <= start) return 'Thời gian kết thúc phải sau thời gian bắt đầu.'
  for (const stop of e.stops ?? []) {
    if (!stop.label.trim()) return 'Mỗi trạm dừng cần có tên hiển thị.'
    if (!placeLookup(stop.locationId)) return `Trạm dừng “${stop.label}” cần chọn địa điểm trong danh mục.`
  }
  return null
}

export function readEventStore(raw: string | null): EventStore {
  const fallback: EventStore = { version: 1, events: initialEvents, mascots: [] }
  if (!raw) return fallback
  try {
    const data = JSON.parse(raw)
    if (data.version !== 1 || !Array.isArray(data.events) || !Array.isArray(data.mascots)) return fallback
    return { version: 1, events: data.events.filter(isEvent).slice(0, 50), mascots: data.mascots.filter(isCustomMascot) }
  } catch { return fallback }
}

export function activeEvent(events: CampusEvent[], params: URLSearchParams, placeLookup: (id: string | null | undefined) => unknown = getPlace) {
  return events.find(e => e.id === params.get('event') && e.status === 'published' && eventHasLocation(e, params.get('to')) && !validateEvent(e, true, placeLookup))
}

export function eventRoute(event: CampusEvent, path = '/di-den', stopId?: string) {
  const stop = stopId ? (event.stops ?? []).find(s => s.id === stopId) : undefined
  const params = new URLSearchParams({ to: stop ? stop.locationId : event.locationId, event: event.id })
  if (stop) params.set('stop', stop.id)
  return `${path}?${params}`
}

export function withEvent(path: string, event?: CampusEvent) {
  if (!event) return path
  const [pathname, query] = path.split('?')
  const params = new URLSearchParams(query)
  if (eventHasLocation(event, params.get('to'))) params.set('event', event.id)
  return `${pathname}?${params}`
}

export function eventDate(value: string) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
    : 'Chưa chọn thời gian'
}
