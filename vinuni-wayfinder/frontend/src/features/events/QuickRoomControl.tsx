import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { Place } from '../wayfinder/data'
import type { CampusEvent } from './events'

export type QuickRoomControlProps = {
  event: CampusEvent
  places: Place[]
  disabled?: boolean
  onChangeRoom: (event: CampusEvent, newLocationId: string) => Promise<string | null> | string | null
}

type Status = 'idle' | 'saving' | 'saved' | 'error'

export function QuickRoomControl({ event, places, disabled = false, onChangeRoom }: QuickRoomControlProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const newLocationId = e.target.value
    if (!newLocationId || newLocationId === event.locationId) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    setPendingLocationId(newLocationId)
    setStatus('saving')
    setError('')

    try {
      const problem = await onChangeRoom(event, newLocationId)
      if (!mountedRef.current) return
      setPendingLocationId(null)
      if (problem) {
        setStatus('error')
        setError(problem)
        return
      }
      setStatus('saved')
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) setStatus('idle')
      }, 3000)
    } catch (err) {
      if (!mountedRef.current) return
      setPendingLocationId(null)
      setStatus('error')
      setError(err instanceof Error && err.message ? err.message : 'Không thể đổi phòng lúc này.')
    }
  }

  const currentValue = pendingLocationId ?? event.locationId
  const hasCurrentInPlaces = places.some(place => place.id === currentValue)

  return (
    <div className="quick-room-control">
      <select
        aria-label={`Đổi phòng nhanh cho ${event.title}`}
        value={currentValue}
        disabled={disabled || status === 'saving'}
        onChange={handleChange}
      >
        {!hasCurrentInPlaces && (
          <option value={currentValue} disabled>
            {currentValue ? currentValue : 'Chọn địa điểm'}
          </option>
        )}
        {places.map(place => (
          <option key={place.id} value={place.id}>
            {place.name}
          </option>
        ))}
      </select>
      {status === 'saving' && (
        <span className="quick-room-status" role="status">
          Đang lưu…
        </span>
      )}
      {status === 'saved' && (
        <span className="quick-room-status" role="status">
          Đã đổi phòng
        </span>
      )}
      {status === 'error' && error && (
        <span className="quick-room-status error-message" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
