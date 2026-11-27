import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, ChevronLeft, Coffee, DoorOpen, Info, Leaf, Lightbulb, MapPin, Search, X, type LucideIcon } from 'lucide-react'
import type { Place } from '../features/wayfinder/data'
import { useWayfinder } from '../features/wayfinder/WayfinderContext'
import { brand } from './brand'
import { SaveButton } from './FavoritesContext'

export const PlaceIcons: Record<Place['icon'], LucideIcon> = {
  room: DoorOpen,
  book: BookOpen,
  coffee: Coffee,
  leaf: Leaf,
  lightbulb: Lightbulb,
  door: MapPin,
}

export function parseCoord(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label={`${brand.name}, về Bản đồ`}>
      <img className="brand-mark" src="/icons/icon-192.png" width={42} height={42} alt="" />
      <span>VinUni <span className="brand-product">AR Map</span><span className="brand-tagline">Khám phá khuôn viên</span></span>
    </Link>
  )
}

export function IconButton({ children, label, onClick, className = '', pressed }: { children: ReactNode; label: string; onClick: () => void; className?: string; pressed?: boolean }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} aria-pressed={pressed}>
      {children}
    </button>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const focused = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => { dialog.close(); focused?.focus() }
  }, [])
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog-content">
        <div className="section-heading">
          <h2 id="dialog-title">{title}</h2>
          <IconButton label="Đóng" onClick={onClose}><X size={22} /></IconButton>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export function DemoNote({ compact = false }: { compact?: boolean }) {
  const { isLive } = useWayfinder()
  if (isLive) return null
  return (
    <div className={`demo-note ${compact ? 'compact' : ''}`}>
      <Info size={16} aria-hidden="true" />
      <span>{compact ? 'Tuyến minh hoạ, chưa dùng để đi thực tế.' : 'Bạn đang thử giao diện. Các tuyến đường là minh hoạ, chưa dùng để đi thực tế.'}</span>
    </div>
  )
}

export function BackLink({ to = '/', children = 'Bản đồ' }: { to?: string; children?: ReactNode }) {
  return <Link to={to} className="back-link"><ChevronLeft size={18} aria-hidden="true" />{children}</Link>
}

export function PlaceRow({ place, index, showSave = true }: { place: Place; index?: number; showSave?: boolean }) {
  const Icon = PlaceIcons[place.icon]
  return (
    <div className="place-row">
      <Link className="place-row-link" to={`/dia-diem/${place.id}`}>
        <span className={`place-symbol tone-${place.category}`}><Icon size={24} strokeWidth={1.65} aria-hidden="true" /></span>
        <span className="place-row-copy">
          <strong>{place.name}</strong>
          <span>{place.building ? place.building : <>Toà I <span className="meta-divider" /> Tầng trệt</>}</span>
        </span>
        {index !== undefined && <span className="row-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}
      </Link>
      {showSave && <SaveButton place={place} />}
      <Link className="icon-button row-direction" to={`/di-den?to=${place.id}`} aria-label={`Dẫn đường tới ${place.name}`}>
        <ArrowUpRight size={21} aria-hidden="true" />
      </Link>
    </div>
  )
}

export function EmptyState({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {children ?? <Search size={36} strokeWidth={1.4} aria-hidden="true" />}
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function NotFound({ title = 'Chưa tìm thấy trang này', description = 'Quay lại Bản đồ để chọn một địa điểm trong bản thử.' }: { title?: string; description?: string }) {
  return (
    <div className="narrow-page">
      <EmptyState title={title} description={description} action={<Link className="button button-primary" to="/">Về bản đồ</Link>} />
    </div>
  )
}
