import { getPlace as getFixturePlace, normalize, places as fixturePlaces, type Category, type Place } from './data'

export type BackendHealth = {
  ok: boolean
  indexSize: number
  model: string
  modelLoaded: boolean
  storage: string
}

export type BackendRoom = {
  id: string
  code?: string
  name: string
  aliases?: string[]
  building?: string | null
}

export type BackendDestinationsResponse = {
  rooms: BackendRoom[]
  outdoorGeo: boolean
}

export type BackendSpot = {
  spot: string
  label: string
}

export type BackendLocateCandidate = {
  spot: string
  label: string
  votes: number
}

export type LocateTier = 'auto' | 'picker' | 'second'

export type BackendLocateResponse = {
  photoId: string
  spot: string
  label: string
  confidence: number
  tier: LocateTier
  roomIds?: string[]
  topSim?: number
  top3: BackendLocateCandidate[]
  combined: boolean
  ms: number
}

export type BackendStepPass = {
  name: string
  side: string
}

export type BackendStepTarget = {
  node: string
  label: string
  lat: number | null
  lng: number | null
}

export type BackendStep = {
  kind: 'walk' | 'door' | 'arrive' | string
  text: string
  meters: number
  approx: boolean
  mapKind: string
  building: string | null
  target: BackendStepTarget
  passes: BackendStepPass[]
  side: string | null
}

export type BackendRouteResponse = {
  destination: string
  start: string
  steps: BackendStep[]
  totalMeters: number
  estSeconds: number
}

export type RouteParams = {
  to: string
  start?: string
  lat?: number
  lng?: number
}

export type StepDirection = 'straight' | 'left' | 'right' | 'back' | 'door' | 'arrive'

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function createWayfinderApi(fetchFn: typeof fetch = fetch) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetchFn(path, init)
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError('offline', 'Không kết nối được máy chủ chỉ đường. Kiểm tra backend đang chạy.', 0)
    }
    if (res.ok) return res.json() as Promise<T>
    let body: { detail?: { code?: string; message?: string } | string } | null = null
    try {
      body = await res.json() as { detail?: { code?: string; message?: string } | string }
    } catch { /* non-JSON error body */ }
    const detail = body?.detail
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      throw new ApiError(detail.code || `http_${res.status}`, detail.message, res.status)
    }
    throw new ApiError(`http_${res.status}`, `Máy chủ lỗi (${res.status}). Hãy thử lại sau.`, res.status)
  }

  return {
    health(signal?: AbortSignal) {
      return request<BackendHealth>('/api/health', { signal })
    },
    destinations(signal?: AbortSignal) {
      return request<BackendDestinationsResponse>('/api/destinations', { signal })
    },
    spotSearch(q: string, signal?: AbortSignal) {
      const qs = new URLSearchParams({ q })
      return request<{ spots: BackendSpot[] }>(`/api/spots/search?${qs}`, { signal })
    },
    locate(blob: Blob, previous?: string, signal?: AbortSignal) {
      const fd = new FormData()
      fd.append('image', blob, 'photo.jpg')
      if (previous) fd.append('previous', previous)
      return request<BackendLocateResponse>('/api/locate', { method: 'POST', body: fd, signal })
    },
    correct(photoId: string, trueSpot: string, signal?: AbortSignal) {
      return request<{ ok: boolean; indexSize: number; duplicate?: boolean }>('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, trueSpot }),
        signal,
      })
    },
    route(params: RouteParams, signal?: AbortSignal) {
      const qs = new URLSearchParams({ to: params.to })
      if (params.start) qs.set('start', params.start)
      else if (params.lat !== undefined && params.lng !== undefined) {
        qs.set('lat', String(params.lat))
        qs.set('lng', String(params.lng))
      }
      return request<BackendRouteResponse>(`/api/route?${qs}`, { signal })
    },
  }
}

export const wayfinderApi = createWayfinderApi()

function inferRoomMeta(room: BackendRoom): Pick<Place, 'category' | 'icon'> {
  const hay = normalize([room.code ?? '', room.name, ...(room.aliases ?? [])].join(' '))
  if (/(ca phe|coffee|cafe|tra|canteen|nha an)/.test(hay)) return { category: 'relax', icon: 'coffee' }
  if (/(vuon|garden|san|cong vien|quang truong)/.test(hay)) return { category: 'relax', icon: 'leaf' }
  if (/(khoi nghiep|startup|entrepreneur)/.test(hay)) return { category: 'service', icon: 'lightbulb' }
  if (/(tu hoc|thu vien|library|doc sach)/.test(hay)) return { category: 'study', icon: 'book' }
  if (/(cong|sanh|cua|bai xe|parking|wc|ve sinh|thang|y te|van phong|office|tien ich|store)/.test(hay)) {
    return { category: 'service', icon: /(cong|sanh|cua|bai xe|parking)/.test(hay) ? 'door' : 'room' }
  }
  return { category: 'study', icon: 'room' }
}

function findMatchingFixture(room: BackendRoom): Place | undefined {
  const byId = getFixturePlace(room.id)
  if (byId) return byId
  const codeNorm = normalize(room.code ?? '')
  const nameNorm = normalize(room.name)
  return fixturePlaces.find(p =>
    (codeNorm && normalize(p.id) === codeNorm) ||
    normalize(p.name) === nameNorm,
  )
}

export function mapBackendRoomToPlace(room: BackendRoom): Place {
  const matched = findMatchingFixture(room)
  const inferred = inferRoomMeta(room)
  const building = room.building?.trim() || 'Khuôn viên VinUni'
  const code = room.code?.trim() || undefined
  const aliases = room.aliases ?? []
  const short = code || matched?.short || room.name
  const keywords = [...new Set([
    ...(code ? [code] : []),
    ...aliases,
    building,
    ...(matched?.keywords ?? []),
  ].filter(Boolean))]

  return {
    id: room.id,
    name: room.name,
    short,
    category: matched?.category ?? inferred.category,
    icon: matched?.icon ?? inferred.icon,
    description: matched?.description ?? (code ? `${room.name} (${building}).` : `Điểm đến tại ${building}.`),
    keywords,
    detail: matched?.detail ?? `Điểm đến được đồng bộ từ máy chủ VinUni Wayfinder (${building}).`,
    building,
    code,
    fromBackend: true,
  }
}

export function searchCatalog(catalog: Place[], query: string, category: Category = 'all'): Place[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  return catalog.filter(p =>
    (category === 'all' || p.category === category) &&
    terms.every(term => normalize([p.name, p.code ?? '', p.building ?? '', ...p.keywords].join(' ')).includes(term)),
  )
}

export function stepDirection(step: BackendStep): StepDirection {
  if (step.kind === 'arrive') return 'arrive'
  if (step.kind === 'door') return 'door'
  const t = normalize(step.text)
  if (t.startsWith('quay lai')) return 'back'
  if (t.startsWith('re trai')) return 'left'
  if (t.startsWith('re phai')) return 'right'
  return 'straight'
}

export function splitRouteSteps(steps: BackendStep[]): { travelSteps: BackendStep[]; arrivalStep: BackendStep | null } {
  if (!steps.length) return { travelSteps: [], arrivalStep: null }
  const last = steps[steps.length - 1]
  if (last.kind === 'arrive') {
    return { travelSteps: steps.slice(0, -1), arrivalStep: last }
  }
  return { travelSteps: steps, arrivalStep: null }
}

/**
 * Thu nhỏ ảnh về cạnh dài <= 512px và vẽ lại qua canvas để xóa EXIF/GPS/metadata trước khi gửi tới /api/locate.
 */
export async function prepPhotoBlob(source: File | Blob | string, maxSide = 512): Promise<Blob> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source
  let width: number
  let height: number
  let drawable: CanvasImageSource
  let cleanup: () => void = () => {}

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      width = bmp.width
      height = bmp.height
      drawable = bmp
      cleanup = () => bmp.close()
    } catch {
      const loaded = await loadHtmlImage(blob)
      width = loaded.img.naturalWidth || loaded.img.width
      height = loaded.img.naturalHeight || loaded.img.height
      drawable = loaded.img
      cleanup = loaded.cleanup
    }
  } else {
    const loaded = await loadHtmlImage(blob)
    width = loaded.img.naturalWidth || loaded.img.width
    height = loaded.img.naturalHeight || loaded.img.height
    drawable = loaded.img
    cleanup = loaded.cleanup
  }

  try {
    const scale = Math.min(1, maxSide / Math.max(width, height, 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Không khởi tạo được canvas xử lý ảnh')
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height)
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!out) throw new Error('Không nén được ảnh')
    return out
  } finally {
    cleanup()
  }
}

function loadHtmlImage(blob: Blob): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => resolve({ img, cleanup: () => URL.revokeObjectURL(url) })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Không đọc được ảnh'))
    }
    img.src = url
  })
}
