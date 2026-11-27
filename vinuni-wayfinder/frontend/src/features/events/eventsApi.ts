import { ApiError } from '../wayfinder/wayfinderApi'
import { authHeaders } from './authApi'
import type { CampusEvent, MascotAsset } from './events'

export type RemoteEventsResponse = {
  events: CampusEvent[]
  mascots: MascotAsset[]
  storage: 'supabase' | 'local'
}

export type EventMetricKind = 'view' | 'navigation'

export type EventMetricsResponse = {
  ok: boolean
  viewsCount: number
  navigationsCount: number
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function createEventsApi(fetchFn: typeof fetch = fetch) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetchFn(path, init)
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError('offline', 'Không kết nối được máy chủ sự kiện.', 0)
    }
    if (res.ok) return res.json() as Promise<T>
    let body: { detail?: { code?: string; message?: string } | string } | null = null
    try {
      body = await res.json() as { detail?: { code?: string; message?: string } | string }
    } catch { /* non-JSON */ }
    const detail = body?.detail
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      throw new ApiError(detail.code || `http_${res.status}`, detail.message, res.status)
    }
    throw new ApiError(`http_${res.status}`, `Máy chủ lỗi (${res.status}).`, res.status)
  }

  return {
    list(signal?: AbortSignal) {
      return request<RemoteEventsResponse>('/api/events', { signal })
    },
    saveEvent(event: CampusEvent, token?: string | null, signal?: AbortSignal) {
      return request<{ ok: boolean; event: CampusEvent; storage: string }>(
        `/api/events/${encodeURIComponent(event.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify(event),
          signal,
        },
      )
    },
    deleteEvent(id: string, token?: string | null, signal?: AbortSignal) {
      return request<{ ok: boolean }>(`/api/events/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
        signal,
      })
    },
    saveMascot(mascot: MascotAsset, token?: string | null, signal?: AbortSignal) {
      return request<{ ok: boolean; mascot: MascotAsset; storage: string }>(
        `/api/club-mascots/${encodeURIComponent(mascot.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify(mascot),
          signal,
        },
      )
    },
    deleteMascot(id: string, token?: string | null, signal?: AbortSignal) {
      return request<{ ok: boolean }>(`/api/club-mascots/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
        signal,
      })
    },
    trackMetric(id: string, metric: EventMetricKind, signal?: AbortSignal) {
      return request<EventMetricsResponse>(`/api/events/${encodeURIComponent(id)}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric }),
        signal,
      })
    },
  }
}

export const eventsApi = createEventsApi()
