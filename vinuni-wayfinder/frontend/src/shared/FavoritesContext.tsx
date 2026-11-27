import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Bookmark } from 'lucide-react'
import type { Place } from '../features/wayfinder/data'
import { useWayfinder } from '../features/wayfinder/WayfinderContext'
import { legacySavedPlacesKey, savedPlacesKey } from './brand'

type FavoritesState = {
  saved: string[]
  toggle: (id: string) => void
  storageError: boolean
  visibleCount: number
}

const FavoritesContext = createContext<FavoritesState>({
  saved: [],
  toggle: () => {},
  storageError: false,
  visibleCount: 0,
})

function readSavedRaw(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(savedPlacesKey) ?? localStorage.getItem(legacySavedPlacesKey) ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && Boolean(id)))] : []
  } catch {
    return []
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { getPlace } = useWayfinder()
  const [saved, setSaved] = useState(readSavedRaw)
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(savedPlacesKey, JSON.stringify(saved))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [saved])

  function toggle(id: string) {
    if (getPlace(id)) {
      setSaved(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id]))
    }
  }

  const visibleCount = saved.filter(id => Boolean(getPlace(id))).length

  return (
    <FavoritesContext.Provider value={{ saved, toggle, storageError, visibleCount }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  return useContext(FavoritesContext)
}

export function SaveButton({ place }: { place: Place }) {
  const { saved, toggle } = useFavorites()
  const isSaved = saved.includes(place.id)
  return (
    <button
      className={`icon-button ${isSaved ? 'is-saved' : ''}`}
      aria-label={`${isSaved ? 'Bỏ lưu' : 'Lưu'} ${place.name}`}
      title={`${isSaved ? 'Bỏ lưu' : 'Lưu'} ${place.name}`}
      aria-pressed={isSaved}
      onClick={() => toggle(place.id)}
    >
      <Bookmark size={20} aria-hidden="true" fill={isSaved ? 'currentColor' : 'none'} />
    </button>
  )
}
