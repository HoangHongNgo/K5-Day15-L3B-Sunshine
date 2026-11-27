import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { places as demoPlaces, type Category, type Place } from './data'
import { mapBackendRoomToPlace, searchCatalog, wayfinderApi, type BackendHealth } from './wayfinderApi'

export type BackendMode = 'checking' | 'live' | 'offline'

type WayfinderState = {
  mode: BackendMode
  isLive: boolean
  places: Place[]
  outdoorGeo: boolean
  health: BackendHealth | null
  getPlace: (id: string | null | undefined) => Place | undefined
  searchPlaces: (query: string, category?: Category) => Place[]
  refresh: () => void
}

const Context = createContext<WayfinderState | null>(null)

export function WayfinderProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BackendMode>('checking')
  const [livePlaces, setLivePlaces] = useState<Place[] | null>(null)
  const [outdoorGeo, setOutdoorGeo] = useState(false)
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 5000)

    async function probe() {
      try {
        const dest = await wayfinderApi.destinations(controller.signal)
        if (controller.signal.aborted) return
        const mapped = Array.isArray(dest.rooms) ? dest.rooms.map(mapBackendRoomToPlace) : []
        if (mapped.length > 0) {
          setLivePlaces(mapped)
          setOutdoorGeo(Boolean(dest.outdoorGeo))
          setMode('live')
          wayfinderApi.health(controller.signal).then(h => {
            if (!controller.signal.aborted) setHealth(h)
          }).catch(() => {})
        } else {
          setLivePlaces(null)
          setOutdoorGeo(false)
          setMode('offline')
        }
      } catch {
        if (!controller.signal.aborted) {
          setLivePlaces(null)
          setOutdoorGeo(false)
          setHealth(null)
          setMode('offline')
        }
      } finally {
        window.clearTimeout(timer)
      }
    }

    void probe()
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [nonce])

  const activePlaces = livePlaces ?? demoPlaces
  const value = useMemo<WayfinderState>(() => ({
    mode,
    isLive: mode === 'live',
    places: activePlaces,
    outdoorGeo,
    health,
    getPlace: (id) => activePlaces.find(p => p.id === id),
    searchPlaces: (query, category = 'all') => searchCatalog(activePlaces, query, category),
    refresh,
  }), [mode, activePlaces, outdoorGeo, health, refresh])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useWayfinder(): WayfinderState {
  const ctx = useContext(Context)
  if (!ctx) {
    return {
      mode: 'offline',
      isLive: false,
      places: demoPlaces,
      outdoorGeo: false,
      health: null,
      getPlace: (id) => demoPlaces.find(p => p.id === id),
      searchPlaces: (query, category = 'all') => searchCatalog(demoPlaces, query, category),
      refresh: () => {},
    }
  }
  return ctx
}
