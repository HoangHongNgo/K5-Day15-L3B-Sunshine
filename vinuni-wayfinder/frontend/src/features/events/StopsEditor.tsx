import { ArrowDown, ArrowUp, MapPin, Plus, Trash2 } from 'lucide-react'
import type { Place } from '../wayfinder/data'
import type { EventStop } from './events'

const MAX_STOPS = 12

type StopsEditorProps = {
  stops: EventStop[]
  places: Place[]
  onChange: (stops: EventStop[]) => void
}

function makeStopId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `stop_${suffix}`
}

export function StopsEditor({ stops, places, onChange }: StopsEditorProps) {
  const canAdd = stops.length < MAX_STOPS

  function addStop() {
    if (!canAdd) return
    onChange([...stops, { id: makeStopId(), label: '', locationId: '', note: '' }])
  }

  function updateStop(index: number, patch: Partial<EventStop>) {
    onChange(stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)))
  }

  function removeStop(index: number) {
    onChange(stops.filter((_, i) => i !== index))
  }

  function moveStop(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= stops.length) return
    const next = [...stops]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <div className="stops-editor">
      <div className="stops-editor-header">
        <p className="field-hint">
          <MapPin size={14} /> Thêm các trạm dừng phụ, gian hàng hoặc điểm check-in (tối đa {MAX_STOPS} trạm).
        </p>
      </div>

      {stops.length > 0 && (
        <div className="stops-list">
          {stops.map((stop, index) => (
            <div className="stop-item" key={stop.id}>
              <div className="stop-item-head">
                <strong>Trạm {index + 1}</strong>
                <div className="stop-item-controls">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Đưa trạm ${index + 1} lên trên`}
                    disabled={index === 0}
                    onClick={() => moveStop(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Đưa trạm ${index + 1} xuống dưới`}
                    disabled={index === stops.length - 1}
                    onClick={() => moveStop(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Xoá trạm ${index + 1}`}
                    onClick={() => removeStop(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="event-form-pair">
                <label htmlFor={`stop-label-${stop.id}`}>
                  Tên trạm / gian hàng
                  <input
                    id={`stop-label-${stop.id}`}
                    maxLength={80}
                    value={stop.label}
                    onChange={e => updateStop(index, { label: e.target.value })}
                    placeholder="Ví dụ: Bàn check-in / Gian hàng Robotics"
                  />
                </label>

                <label htmlFor={`stop-loc-${stop.id}`}>
                  Phòng / Địa điểm
                  <select
                    id={`stop-loc-${stop.id}`}
                    value={stop.locationId}
                    onChange={e => updateStop(index, { locationId: e.target.value })}
                  >
                    <option value="">Chọn địa điểm</option>
                    {places.map(place => (
                      <option value={place.id} key={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label htmlFor={`stop-note-${stop.id}`}>
                Ghi chú ngắn (tuỳ chọn)
                <input
                  id={`stop-note-${stop.id}`}
                  maxLength={200}
                  value={stop.note ?? ''}
                  onChange={e => updateStop(index, { note: e.target.value })}
                  placeholder="Ví dụ: Nhận vòng tay trước khi vào hội trường"
                />
              </label>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="button button-quiet"
        disabled={!canAdd}
        onClick={addStop}
      >
        <Plus size={16} />
        {canAdd ? `Thêm trạm dừng (${stops.length}/${MAX_STOPS})` : `Đã đạt tối đa ${MAX_STOPS} trạm`}
      </button>
    </div>
  )
}
