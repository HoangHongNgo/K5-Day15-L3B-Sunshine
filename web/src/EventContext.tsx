import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { activeEvent, builtInMascots, defaultMascot, eventStorageKey, isMascot, readEventStore, validateEvent, withEvent, type CampusEvent, type EventStore, type MascotAsset } from './events'

type StoreContext = EventStore & { allMascots: MascotAsset[]; saveEvent: (event: CampusEvent) => string | null; saveMascot: (mascot: MascotAsset) => string | null }
const Context = createContext<StoreContext | null>(null)
export function EventsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => { try { return readEventStore(localStorage.getItem(eventStorageKey)) } catch { return readEventStore(null) } })
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === eventStorageKey) setState(readEventStore(event.newValue)) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function persist(next: EventStore) {
    try { localStorage.setItem(eventStorageKey, JSON.stringify(next)); setState(next); return null }
    catch { return 'Chưa lưu được trên thiết bị. Bộ nhớ có thể đã đầy hoặc bị chặn; nội dung đang nhập vẫn được giữ trên trang.' }
  }
  const allMascots = [...builtInMascots, ...state.mascots]
  function saveEvent(event: CampusEvent) {
    const error = validateEvent(event, event.status === 'published')
    if (error) return error
    if (!allMascots.some(m => m.id === event.mascotId)) return 'Hãy chọn một mascot có trong thư viện.'
    if (!state.events.some(e => e.id === event.id) && state.events.length >= 50) return 'Bản thử hỗ trợ tối đa 50 sự kiện trên thiết bị.'
    return persist({ ...state, events: [event, ...state.events.filter(e => e.id !== event.id)] })
  }
  function saveMascot(mascot: MascotAsset) {
    if (!isMascot(mascot) || mascot.kind !== 'image') return 'Ảnh mascot chưa hợp lệ. Hãy thử ảnh PNG, JPG hoặc WebP khác.'
    if (!state.mascots.some(m => m.id === mascot.id) && state.mascots.length >= 12) return 'Thư viện bản thử đã có 12 mascot. Bạn có thể dùng một mẫu đã lưu.'
    return persist({ ...state, mascots: [...state.mascots.filter(m => m.id !== mascot.id), mascot] })
  }
  return <Context.Provider value={{ ...state, allMascots, saveEvent, saveMascot }}>{children}</Context.Provider>
}
export function useEvents() { const store = useContext(Context); if (!store) throw new Error('Missing EventsProvider'); return store }
export function useEventJourney() {
  const { events, allMascots } = useEvents()
  const { pathname, search } = useLocation()
  const routes = ['/di-den', '/hanh-trinh', '/vi-tri', '/anh', '/anh-mau', '/nhan-dien', '/xac-nhan-vi-tri', '/ghim-anh']
  const event = routes.includes(pathname) ? activeEvent(events, new URLSearchParams(search)) : undefined
  const mascot = allMascots.find(m => m.id === event?.mascotId) ?? defaultMascot
  return { event, mascot, link: (path: string) => withEvent(path, event) }
}
