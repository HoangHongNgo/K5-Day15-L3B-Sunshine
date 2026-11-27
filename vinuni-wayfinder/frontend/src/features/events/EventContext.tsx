import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { activeEvent, builtInMascots, defaultMascot, eventStorageKey, isEvent, isMascot, readEventStore, validateEvent, withEvent, type CampusEvent, type EventStore, type MascotAsset } from './events'
import { eventsApi, type EventMetricKind } from './eventsApi'
import { useAuth } from './AuthContext'
import { ApiError } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'

type SyncMode = 'local' | 'supabase'
type StoreContext = EventStore & {
  allMascots: MascotAsset[]
  storage: SyncMode
  syncError: string | null
  saveEvent: (event: CampusEvent) => string | null
  saveEventAsync: (event: CampusEvent) => Promise<string | null>
  deleteEvent: (id: string) => Promise<string | null>
  saveMascot: (mascot: MascotAsset) => string | null
  trackMetric: (id: string, metric: EventMetricKind) => void
}

const Context = createContext<StoreContext | null>(null)

export function EventsProvider({ children }: { children: ReactNode }) {
  const { getPlace, isLive } = useWayfinder()
  const { account, token } = useAuth()
  const [state, setState] = useState(() => {
    try { return readEventStore(localStorage.getItem(eventStorageKey)) }
    catch { return readEventStore(null) }
  })
  const [storage, setStorage] = useState<SyncMode>('local')
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === eventStorageKey) setState(readEventStore(event.newValue))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    if (!isLive) {
      setStorage('local')
      return
    }
    const controller = new AbortController()
    eventsApi.list(controller.signal)
      .then(res => {
        if (controller.signal.aborted) return
        setStorage(res.storage === 'supabase' ? 'supabase' : 'local')
        setSyncError(null)
        const remoteEvents = (res.events || []).filter(isEvent).slice(0, 50)
        const remoteMascots = (res.mascots || []).filter(m => isMascot(m) && m.kind === 'image').slice(0, 12)
        if (remoteEvents.length > 0 || remoteMascots.length > 0) {
          const next: EventStore = { version: 1, events: remoteEvents, mascots: remoteMascots }
          setState(next)
          try { localStorage.setItem(eventStorageKey, JSON.stringify(next)) } catch { /* ignore quota */ }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStorage('local')
      })
    return () => controller.abort()
  }, [isLive])

  function persist(next: EventStore) {
    try { localStorage.setItem(eventStorageKey, JSON.stringify(next)); setState(next); return null }
    catch { return 'Chưa lưu được trên thiết bị. Bộ nhớ có thể đã đầy hoặc bị chặn; nội dung đang nhập vẫn được giữ trên trang.' }
  }

  const allMascots = [...builtInMascots, ...state.mascots]

  function validateBeforeSave(event: CampusEvent): string | null {
    const error = validateEvent(event, event.status === 'published', getPlace)
    if (error) return error
    if (!allMascots.some(m => m.id === event.mascotId)) return 'Hãy chọn một mascot có trong thư viện.'
    if (!state.events.some(e => e.id === event.id) && state.events.length >= 50) return 'Bản thử hỗ trợ tối đa 50 sự kiện trên thiết bị.'
    return null
  }

  function saveEvent(event: CampusEvent) {
    const problem = validateBeforeSave(event)
    if (problem) return problem
    const enriched: CampusEvent = {
      ...event,
      ownerId: event.ownerId ?? account?.id ?? null,
    }
    const localErr = persist({ ...state, events: [enriched, ...state.events.filter(e => e.id !== enriched.id)] })
    if (localErr) return localErr
    if (isLive) {
      eventsApi.saveEvent(enriched, token)
        .then(res => {
          setSyncError(null)
          if (res.storage === 'supabase') setStorage('supabase')
          setState(prev => {
            const next: EventStore = {
              ...prev,
              events: [res.event, ...prev.events.filter(e => e.id !== res.event.id)],
            }
            try { localStorage.setItem(eventStorageKey, JSON.stringify(next)) } catch { /* ignore */ }
            return next
          })
        })
        .catch(err => {
          setSyncError(err instanceof ApiError ? err.message : 'Chưa đồng bộ được sự kiện lên Supabase.')
        })
    }
    return null
  }

  async function saveEventAsync(event: CampusEvent): Promise<string | null> {
    const problem = validateBeforeSave(event)
    if (problem) return problem
    const enriched: CampusEvent = {
      ...event,
      ownerId: event.ownerId ?? account?.id ?? null,
    }
    if (isLive) {
      try {
        const res = await eventsApi.saveEvent(enriched, token)
        setSyncError(null)
        if (res.storage === 'supabase') setStorage('supabase')
        const next: EventStore = { ...state, events: [res.event, ...state.events.filter(e => e.id !== res.event.id)] }
        persist(next)
        return null
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Chưa đồng bộ được sự kiện lên Supabase.'
        setSyncError(msg)
        return msg
      }
    }
    return persist({ ...state, events: [enriched, ...state.events.filter(e => e.id !== enriched.id)] })
  }

  async function deleteEvent(id: string): Promise<string | null> {
    if (isLive) {
      try {
        await eventsApi.deleteEvent(id, token)
        setSyncError(null)
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Không xoá được sự kiện trên máy chủ.'
        setSyncError(msg)
        return msg
      }
    }
    const next: EventStore = { ...state, events: state.events.filter(e => e.id !== id) }
    return persist(next)
  }

  function saveMascot(mascot: MascotAsset) {
    if (!isMascot(mascot) || mascot.kind !== 'image') return 'Ảnh mascot chưa hợp lệ. Hãy thử ảnh PNG, JPG hoặc WebP khác.'
    if (!state.mascots.some(m => m.id === mascot.id) && state.mascots.length >= 12) return 'Thư viện bản thử đã có 12 mascot. Bạn có thể dùng một mẫu đã lưu.'
    const enriched: MascotAsset = { ...mascot, ownerId: mascot.ownerId ?? account?.id ?? null }
    const localErr = persist({ ...state, mascots: [...state.mascots.filter(m => m.id !== enriched.id), enriched] })
    if (localErr) return localErr
    if (isLive) {
      eventsApi.saveMascot(enriched, token)
        .then(res => {
          setSyncError(null)
          if (res.storage === 'supabase') setStorage('supabase')
        })
        .catch(err => {
          setSyncError(err instanceof ApiError ? err.message : 'Chưa đồng bộ được mascot lên Supabase.')
        })
    }
    return null
  }

  const trackMetric = useCallback((id: string, metric: EventMetricKind) => {
    if (!isLive) return
    eventsApi.trackMetric(id, metric)
      .then(res => {
        setState(prev => ({
          ...prev,
          events: prev.events.map(e => (e.id === id ? { ...e, viewsCount: res.viewsCount, navigationsCount: res.navigationsCount } : e)),
        }))
      })
      .catch(() => { /* silent: analytics must never disrupt user journey */ })
  }, [isLive])

  return (
    <Context.Provider value={{ ...state, allMascots, storage, syncError, saveEvent, saveEventAsync, deleteEvent, saveMascot, trackMetric }}>
      {children}
    </Context.Provider>
  )
}

export function useEvents() {
  const store = useContext(Context)
  if (!store) throw new Error('Missing EventsProvider')
  return store
}

export function useEventJourney() {
  const { events, allMascots } = useEvents()
  const { getPlace } = useWayfinder()
  const { pathname, search } = useLocation()
  const routes = ['/di-den', '/hanh-trinh', '/vi-tri', '/anh', '/anh-mau', '/nhan-dien', '/xac-nhan-vi-tri', '/ghim-anh']
  const event = routes.includes(pathname) ? activeEvent(events, new URLSearchParams(search), getPlace) : undefined
  const mascot = allMascots.find(m => m.id === event?.mascotId) ?? defaultMascot
  return { event, mascot, link: (path: string) => withEvent(path, event) }
}
