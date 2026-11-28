import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronRight, Clock3, Compass, ExternalLink, Eye, FilePenLine, Info, LogOut, MapPin, Navigation, Plus, QrCode, Save, Search, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react'
import { Modal } from '../../shared/ui'
import { normalize } from '../wayfinder/data'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import { Mascot } from '../mascot/Mascot'
import { MascotCreator, MascotPicker } from '../mascot/MascotStudio'
import { useAuth } from './AuthContext'
import { ClubLoginGate } from './ClubLoginGate'
import { DeleteEventDialog } from './DeleteEventDialog'
import { useEvents, useEventJourney } from './EventContext'
import { EventQrCard } from './EventQrCard'
import { defaultEventMascot, resolveEventMascot, emptyEvent, eventDate, eventRoute, isAnchor, validateEvent, type CampusEvent } from './events'
import { eventPhaseLabel, eventTimeFilters, filterEventsByTime, getEventPhase, type EventTimeFilter } from './eventSchedule'
import { eventShareUrl } from './qrCode'
import { QuickRoomControl } from './QuickRoomControl'
import { StopsEditor } from './StopsEditor'

import EventAlbum from './EventAlbum'
const EventEncounter = lazy(() => import('./EventEncounter'))

export function EventJourneyBadge() {
  const { event, mascot } = useEventJourney()
  if (!event) return null
  return (
    <Link to={`/su-kien/${event.id}`} className="event-journey-badge">
      <CalendarDays size={18} />
      <span><strong>{event.title}</strong><small>{mascot.name} đang đồng hành cùng bạn</small></span>
      <ChevronRight size={18} />
    </Link>
  )
}

function LocalNote() {
  const { storage, syncError } = useEvents()
  return (
    <p className="local-note">
      <Info size={16} />
      <span>
        {syncError
          ? syncError
          : storage === 'supabase'
            ? 'Sự kiện và mascot đang đồng bộ trực tiếp trên Supabase cho cả nhóm.'
            : storage === 'server' ? 'Sự kiện và mascot được lưu trên máy chủ Wayfinder.'
            : 'Bản thử lưu trên trình duyệt này. Chưa đăng công khai hoặc đồng bộ với thiết bị khác.'}
      </span>
    </p>
  )
}

function EventFacts({ event }: { event: CampusEvent }) {
  const { getPlace } = useWayfinder()
  const stopsCount = event.stops?.length ?? 0
  return (
    <div className="event-facts">
      <span><CalendarDays size={17} />{eventDate(event.startsAt)}</span>
      <span><MapPin size={17} />{getPlace(event.locationId)?.name || 'Chưa chọn địa điểm'}</span>
      {stopsCount > 0 && <span><Compass size={16} />+{stopsCount} trạm dừng</span>}
    </div>
  )
}

function ClubShell({ children }: { children: ReactNode }) {
  const { account, logout } = useAuth()
  return (
    <ClubLoginGate>
      <div className="club-shell">
        <aside className="club-sidebar">
          <Link className="studio-brand" to="/clb">
            <span><Users size={23} /></span>
            <div>Không gian BTC<small>VinUni Wayfinder</small></div>
          </Link>
          {account && (
            <div className="club-account-card">
              <div className="club-account-head">
                <ShieldCheck size={16} aria-hidden="true" />
                <strong>{account.displayName}</strong>
              </div>
              <small>{account.role === 'admin_truong' ? 'Admin trường' : (account.clubName || `@${account.username}`)}</small>
              <button type="button" className="text-link club-logout-btn" onClick={() => void logout()}>
                <LogOut size={14} />Đăng xuất
              </button>
            </div>
          )}
          <nav aria-label="Quản lý câu lạc bộ">
            <NavLink to="/clb" end><CalendarDays size={19} />Sự kiện của bạn</NavLink>
            <NavLink to="/clb/mascot"><Sparkles size={19} />Thư viện mascot</NavLink>
          </nav>
          <Link className="club-visitor-link" to="/su-kien"><ExternalLink size={17} />Xem phía người tham dự</Link>
          <LocalNote />
        </aside>
        <div className="club-content">{children}</div>
      </div>
    </ClubLoginGate>
  )
}

export function ClubDashboard() {
  const { events, saveEventAsync, deleteEvent } = useEvents()
  const { places } = useWayfinder()
  const { canManage } = useAuth()
  const [filter, setFilter] = useState('all')
  const [qrEvent, setQrEvent] = useState<CampusEvent | null>(null)
  const [deleting, setDeleting] = useState<CampusEvent | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const list = events.filter(e => filter === 'all' || e.status === filter)
  const totalViews = events.reduce((acc, e) => acc + (e.viewsCount ?? 0), 0)
  const totalNavs = events.reduce((acc, e) => acc + (e.navigationsCount ?? 0), 0)

  async function handleQuickRoom(ev: CampusEvent, newLocationId: string) {
    return saveEventAsync({ ...ev, locationId: newLocationId, arAnchor: null })
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError('')
    const err = await deleteEvent(deleting.id)
    setDeleteBusy(false)
    if (err) {
      setDeleteError(err)
      return
    }
    setDeleting(null)
  }

  return (
    <ClubShell>
      <div className="studio-heading">
        <div>
          <p className="studio-kicker">Dành cho Ban Tổ Chức &amp; CLB</p>
          <h1 tabIndex={-1}>Hẹn nhau ở VinUni.</h1>
          <p>Thêm địa điểm tổ chức sự kiện, in mã QR poster và cập nhật phòng tức thì cho sinh viên.</p>
        </div>
        <Link to="/clb/su-kien/moi" className="button button-primary"><Plus size={18} />Thêm sự kiện</Link>
      </div>

      <div className="studio-banner">
        <div>
          <span className="studio-icon"><Sparkles size={22} /></span>
          <h2>Mỗi sự kiện, một người dẫn đường.</h2>
          <p>Chọn nơi tổ chức, thêm trạm dừng và mascot. Người tham dự chỉ cần quét QR và bắt đầu đi.</p>
          <div className="analytics-summary" aria-label="Thống kê ẩn danh toàn bộ sự kiện">
            <span><BarChart3 size={15} /><strong>{events.length}</strong> sự kiện</span>
            <span><Eye size={15} /><strong>{totalViews}</strong> lượt xem</span>
            <span><Navigation size={15} /><strong>{totalNavs}</strong> lượt dẫn đường</span>
          </div>
          <Link to="/clb/mascot" className="text-link">Khám phá thư viện mascot<ArrowUpRight size={17} /></Link>
        </div>
        <Mascot asset={defaultEventMascot} mood="wave" size={170} />
      </div>

      <div className="event-list-heading">
        <h2>Sự kiện của bạn <span>{events.length}</span></h2>
        <select aria-label="Lọc trạng thái sự kiện" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">Bản nháp</option>
          <option value="published">Đã công bố</option>
        </select>
      </div>

      <div className="managed-events">
        {list.length ? list.map(event => {
          const editable = canManage(event.ownerId)
          const phase = getEventPhase(event)
          return (
            <article className="managed-event" key={event.id}>
              <div className="event-date-tile">
                <CalendarDays size={23} />
                <span>{event.startsAt ? eventDate(event.startsAt).split(' ')[1] || 'Lịch' : 'Nháp'}</span>
              </div>
              <div className="managed-event-copy">
                <div className="event-labels">
                  <span className={`event-status ${event.status}`}>{event.status === 'draft' ? 'Bản nháp' : 'Đã công bố'}</span>
                  {event.status === 'published' && <span className={`phase-badge phase-${phase}`}>{eventPhaseLabel(phase)}</span>}
                  {event.demo && <span className="event-demo">Dữ liệu mẫu</span>}
                  {!editable && <span className="event-demo">CLB khác quản lý</span>}
                </div>
                <h3>{event.title}</h3>
                <p>{event.club || 'Chưa thêm đơn vị tổ chức'}</p>
                <EventFacts event={event} />
                <div className="event-metrics">
                  <span><Eye size={14} />{event.viewsCount ?? 0} lượt xem</span>
                  <span><Navigation size={14} />{event.navigationsCount ?? 0} lượt dẫn đường</span>
                </div>
                {editable && places.length > 0 && (
                  <QuickRoomControl event={event} places={places} onChangeRoom={handleQuickRoom} />
                )}
              </div>
              <div className="managed-event-actions">
                {event.status === 'published' && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Mã QR cho ${event.title}`}
                    title="Lấy mã QR poster"
                    onClick={() => setQrEvent(event)}
                  >
                    <QrCode size={19} />
                  </button>
                )}
                {editable && (
                  <Link to={`/clb/su-kien/${event.id}/chinh-sua`} aria-label={`Chỉnh sửa ${event.title}`} className="button button-quiet">
                    <FilePenLine size={16} /><span>Chỉnh sửa</span>
                  </Link>
                )}
                {editable && (
                  <button
                    type="button"
                    className="icon-button danger-action"
                    aria-label={`Xoá ${event.title}`}
                    title="Xoá sự kiện"
                    onClick={() => { setDeleteError(''); setDeleting(event) }}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                {event.status === 'published' && (
                  <Link to={`/su-kien/${event.id}`} className="icon-button" aria-label={`Xem ${event.title}`}>
                    <ArrowUpRight size={20} />
                  </Link>
                )}
              </div>
            </article>
          )
        }) : (
          <div className="events-empty">
            <CalendarDays size={32} />
            <h3>Chưa có sự kiện ở đây</h3>
            <p>Tạo lời hẹn đầu tiên cho CLB của bạn.</p>
            <Link to="/clb/su-kien/moi" className="button button-quiet"><Plus size={17} />Thêm sự kiện</Link>
          </div>
        )}
      </div>

      {qrEvent && (
        <Modal title={`Mã QR · ${qrEvent.title}`} onClose={() => setQrEvent(null)}>
          <EventQrCard
            value={eventShareUrl(qrEvent.id)}
            title={qrEvent.title}
            subtitle="Dán lên poster hoặc gửi email mời. Nếu bạn đổi phòng trên trang quản lý, mã QR này tự động dẫn tới phòng mới."
            filename={`vinuni-event-${qrEvent.id}`}
          />
        </Modal>
      )}

      {deleting && (
        <DeleteEventDialog
          event={deleting}
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </ClubShell>
  )
}

export function EventEditor() {
  const { id } = useParams()
  const { events } = useEvents()
  const found = id ? events.find(e => e.id === id) : undefined
  if (id && !found) return <EventMissing management />
  return <EditorForm key={id || 'new'} initial={found} />
}

function EditorForm({ initial }: { initial?: CampusEvent }) {
  const { places, getPlace, isLive } = useWayfinder()
  const { account } = useAuth()
  const [draft, setDraft] = useState<CampusEvent>(() => {
    if (initial) return { ...initial, stops: initial.stops ?? [] }
    const fresh = emptyEvent()
    if (account?.clubName) fresh.club = account.clubName
    return fresh
  })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [lat, setLat] = useState(initial?.arAnchor?.lat.toString() ?? '')
  const [lon, setLon] = useState(initial?.arAnchor?.lon.toString() ?? '')
  const [locating, setLocating] = useState(false)
  function locateVenue() {
    if (!navigator.geolocation) { setError('Thiết bị chưa hỗ trợ GPS. Hãy nhập toạ độ địa điểm.'); return }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(({coords}) => {
      setLat(coords.latitude.toFixed(6).replace(/\.?0+$/, '') || '0')
      setLon(coords.longitude.toFixed(6).replace(/\.?0+$/, '') || '0')
      setLocating(false)
    }, () => { setLocating(false); setError('Chưa lấy được GPS. Hãy nhập toạ độ của địa điểm.') },
    {enableHighAccuracy:true, timeout:15000})
  }
  const { allMascots, saveEventAsync } = useEvents()
  const [saving,setSaving] = useState(false)
  const navigate = useNavigate()
  const mascot = resolveEventMascot(allMascots, draft.mascotId)

  function update<K extends keyof CampusEvent>(key: K, value: CampusEvent[K]) {
    setDraft(d => ({ ...d, [key]: value }))
    setMessage('')
    setError('')
  }

  async function save(status: CampusEvent['status']) {
    if (saving || locating) return
    const arAnchor = lat.trim() || lon.trim() ? {lat:Number(lat),lon:Number(lon)} : null
    if (arAnchor && (!lat.trim() || !lon.trim() || !isAnchor(arAnchor))) {
      setError('Nhập đủ vĩ độ (−90 đến 90) và kinh độ (−180 đến 180) của điểm gặp.')
      return
    }
    const cleanedStops = (draft.stops ?? [])
      .map(s => ({ ...s, label: s.label.trim(), note: s.note?.trim() || undefined }))
      .filter(s => s.label || s.locationId)
    const event: CampusEvent = {
      ...draft, mascotId: mascot.id, arAnchor,
      title: draft.title.trim(),
      club: draft.club.trim(),
      description: draft.description.trim(),
      stops: cleanedStops,
      status,
    }
    setSaving(true)
    const problem = validateEvent(event, status === 'published', getPlace) || await saveEventAsync(event)
    setSaving(false)
    if (problem) { setError(problem); return }
    setDraft(event)
    setError('')
    if (status === 'published') navigate(`/su-kien/${event.id}`)
    else {
      setMessage(isLive ? 'Đã lưu bản nháp.' : 'Đã lưu bản nháp trên thiết bị này.')
      if (!initial) navigate(`/clb/su-kien/${event.id}/chinh-sua`, { replace: true })
    }
  }

  function submit(e: FormEvent) { e.preventDefault(); save('published') }

  return (
    <ClubShell>
      <Link to="/clb" className="back-link"><ArrowLeft size={17} />Sự kiện của bạn</Link>
      <div className="studio-heading editor-heading">
        <div>
          <h1 tabIndex={-1}>{initial ? 'Chỉnh sửa sự kiện' : 'Tạo một cuộc hẹn mới'}</h1>
          <p>Thông tin rõ ràng. Địa điểm dễ tìm. Một mascot đáng nhớ.</p>
        </div>
        <span className="event-status draft">{draft.status === 'published' ? 'Đã công bố' : 'Bản nháp'}</span>
      </div>
      <form className="event-editor-layout" onSubmit={submit} noValidate>
        <div className="event-form">
          <section className="editor-section">
            <div className="editor-section-title"><span>01</span><div><h2>Thông tin sự kiện</h2><p>Người tham dự cần biết điều gì?</p></div></div>
            <label htmlFor="event-title">Tên sự kiện<input id="event-title" maxLength={100} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Ví dụ: Music Under the Stars" required /></label>
            <label htmlFor="event-club">Câu lạc bộ / đơn vị tổ chức<input id="event-club" maxLength={80} value={draft.club} onChange={e => update('club', e.target.value)} placeholder="Tên câu lạc bộ của bạn" required /></label>
            <label htmlFor="event-description">Mô tả<textarea id="event-description" maxLength={1500} rows={4} value={draft.description} onChange={e => update('description', e.target.value)} placeholder="Giới thiệu hoạt động, ai có thể tham gia và cần chuẩn bị gì…" required /></label>
            <div className="event-form-pair">
              <label htmlFor="event-start">Bắt đầu<input id="event-start" type="datetime-local" value={draft.startsAt.slice(0, 16)} onChange={e => update('startsAt', e.target.value ? `${e.target.value}:00+07:00` : '')} required /></label>
              <label htmlFor="event-end">Kết thúc<input id="event-end" type="datetime-local" value={draft.endsAt.slice(0, 16)} onChange={e => update('endsAt', e.target.value ? `${e.target.value}:00+07:00` : '')} required /></label>
            </div>
            <p className="field-hint">Thời gian Việt Nam (UTC+7).</p>
          </section>

          <section className="editor-section">
            <div className="editor-section-title"><span>02</span><div><h2>Địa điểm tổ chức &amp; trạm dừng</h2><p>Các địa điểm để Vini dẫn đường cho người tham dự.</p></div></div>
            <label htmlFor="event-location">Địa điểm chính tại VinUni
              <select id="event-location" value={draft.locationId} onChange={e => { if (draft.locationId) { setLat(''); setLon('') }; update('locationId', e.target.value) }} required>
                <option value="">Chọn địa điểm</option>
                {places.map(place => <option value={place.id} key={place.id}>{place.name}</option>)}
              </select>
            </label>
            <p className="location-hint"><MapPin size={18} />{isLive ? 'Danh mục địa điểm đang đồng bộ từ máy chủ VinUni Wayfinder.' : 'Danh mục và tuyến đi hiện là dữ liệu mô phỏng của Toà I.'}</p>
            <fieldset className="event-anchor"><legend>Điểm gặp mascot AR</legend>
              <p>Đặt toạ độ công khai của địa điểm tổ chức để người ở gần có thể gặp mascot.</p>
              <div className="event-form-pair">
                <label>Vĩ độ điểm gặp<input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} /></label>
                <label>Kinh độ điểm gặp<input type="number" step="any" value={lon} onChange={e => setLon(e.target.value)} /></label>
              </div>
              <button type="button" className="button button-quiet" disabled={locating} onClick={locateVenue}>{locating ? 'Đang lấy GPS…' : 'Đặt điểm gặp tại vị trí hiện tại'}</button>
            </fieldset>
            <StopsEditor stops={draft.stops ?? []} places={places} onChange={stops => update('stops', stops)} />
          </section>

          <section className="editor-section">
            <div className="editor-section-title"><span>03</span><div><h2>Người bạn đồng hành</h2><p>Người tham dự có thể gặp và trò chuyện với nhân vật tại điểm AR.</p></div></div>
            <MascotPicker selected={mascot.id} onChange={id => update('mascotId', id)} />
            <button type="button" className="create-mascot-toggle" onClick={() => setCreating(!creating)} aria-expanded={creating}><Sparkles size={18} />{creating ? 'Thu gọn phần tạo mascot' : 'Tạo mascot riêng cho CLB'}<Plus size={18} /></button>
            {creating && <MascotCreator club={draft.club} onUse={id => update('mascotId', id)} />}
          </section>

          {error && <p className="error-message" role="alert">{error}</p>}
          {message && <p className="inline-feedback" role="status"><Check size={18} />{message}</p>}
          <div className="editor-actions">
            <button type="button" className="button button-quiet" onClick={() => save('draft')}><Save size={18} />Lưu bản nháp</button>
            <button type="submit" disabled={saving || locating} className="button button-primary">{draft.status === 'published' ? 'Cập nhật trang sự kiện' : 'Đăng thử sự kiện'}<ArrowUpRight size={18} /></button>
          </div>
          <LocalNote />
        </div>
        <aside className="event-preview">
          <span className="preview-title">Góc nhìn người tham dự</span>
          <div className="event-preview-art"><Mascot asset={mascot} mood="wave" size={190} /><span>{mascot.name}</span></div>
          <div className="event-preview-copy">
            <span>{draft.club || 'Câu lạc bộ của bạn'}</span>
            <h2>{draft.title || 'Sự kiện sắp tới của bạn'}</h2>
            <EventFacts event={draft} />
            <div className="preview-route"><Navigation size={18} />Dẫn đường tới sự kiện<ArrowUpRight size={18} /></div>
          </div>
          <p>Vini dẫn đường. {mascot.name} đón khách tại sự kiện.</p>
        </aside>
      </form>
    </ClubShell>
  )
}

export function ClubMascots() {
  const [selected, setSelected] = useState('vini')
  return (
    <ClubShell>
      <div className="studio-heading">
        <div>
          <p className="studio-kicker">Dành cho câu lạc bộ</p>
          <h1 tabIndex={-1}>Những người bạn của CLB.</h1>
          <p>Tạo một lần, dùng lại cho những cuộc hẹn sau.</p>
        </div>
      </div>
      <section className="library-section"><h2>Thư viện của bạn</h2><MascotPicker selected={selected} onChange={setSelected} /></section>
      <MascotCreator onUse={setSelected} />
      <Link to="/clb/su-kien/moi" className="button button-quiet library-next">Tạo sự kiện và chọn mascot<ArrowRight size={18} /></Link>
    </ClubShell>
  )
}

export function EventsList() {
  const { events, allMascots } = useEvents()
  const { getPlace } = useWayfinder()
  const [query, setQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState<EventTimeFilter>('all')
  const now = new Date()

  const published = events.filter(e =>
    e.status === 'published' &&
    !validateEvent(e, true, getPlace) &&
    normalize(`${e.title} ${e.club}`).includes(normalize(query)),
  )
  const visible = filterEventsByTime(published, timeFilter, now)

  return (
    <div className="events-page">
      <Link to="/" className="back-link"><ArrowLeft size={17} />Bản đồ</Link>
      <div className="events-page-heading">
        <div>
          <p className="studio-kicker">Gặp nhau trong khuôn viên</p>
          <h1 tabIndex={-1}>Có hẹn ở VinUni.</h1>
          <p>Chọn một sự kiện. Gặp mascot. Bắt đầu hành trình.</p>
        </div>
        <Link to="/clb" className="button button-quiet"><Users size={18} />Dành cho BTC / CLB</Link>
      </div>

      <form className="search-box events-search" role="search" onSubmit={e => e.preventDefault()}>
        <Search size={21} />
        <input aria-label="Tìm sự kiện hoặc câu lạc bộ" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm sự kiện hoặc câu lạc bộ…" />
      </form>

      <div className="time-filter-bar" role="tablist" aria-label="Lọc sự kiện theo thời gian">
        {eventTimeFilters.map(f => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={timeFilter === f.id}
            className={`time-filter-chip ${timeFilter === f.id ? 'active' : ''}`}
            onClick={() => setTimeFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="event-cards">
        {visible.map(event => {
          const mascot = resolveEventMascot(allMascots, event.mascotId)
          const phase = getEventPhase(event, now)
          return (
            <Link to={`/su-kien/${event.id}`} className="event-card" key={event.id}>
              <div className="event-card-art">
                <span className={`phase-badge phase-${phase}`}>{eventPhaseLabel(phase)}</span>
                <Mascot asset={mascot} size={170} mood="wave" />
                <span className="event-mascot-label">Gặp {mascot.name}</span>
              </div>
              <div className="event-card-copy">
                <p>{event.club}</p>
                <h2>{event.title}</h2>
                <EventFacts event={event} />
                <span className="event-card-action">Khám phá sự kiện<ArrowUpRight size={18} /></span>
              </div>
            </Link>
          )
        })}
      </div>

      {!visible.length && (
        <div className="events-empty">
          <CalendarDays size={36} />
          <h2>Chưa tìm thấy cuộc hẹn này</h2>
          <p>Thử đổi bộ lọc thời gian, nhập tên khác hoặc thêm sự kiện trong khu BTC.</p>
          {timeFilter !== 'all' ? (
            <button type="button" className="button button-quiet" onClick={() => setTimeFilter('all')}>Xem tất cả thời gian</button>
          ) : (
            <Link to="/clb" className="button button-quiet">Mở khu BTC / CLB<ArrowRight size={18} /></Link>
          )}
        </div>
      )}
      <LocalNote />
    </div>
  )
}

function EventMissing({ management = false }: { management?: boolean }) {
  return (
    <div className="narrow-page events-empty">
      <CalendarDays size={36} />
      <h1 tabIndex={-1}>Chưa có sự kiện này</h1>
      <p>Sự kiện có thể đang ở bản nháp hoặc được tạo trên thiết bị khác.</p>
      <Link className="button button-primary" to={management ? '/clb' : '/su-kien'}>Về danh sách sự kiện<ArrowLeft size={18} /></Link>
    </div>
  )
}

export function EventDetail() {
  const [params] = useSearchParams()
  const { id } = useParams()
  const { events, allMascots, trackMetric } = useEvents()
  const { getPlace, isLive } = useWayfinder()
  const [encounter,setEncounter] = useState(false)
  const trackedRef = useRef<string | null>(null)
  const event = events.find(e => e.id === id && e.status === 'published' && !validateEvent(e, true, getPlace))

  useEffect(() => {
    if (!event || trackedRef.current === event.id) return
    trackedRef.current = event.id
    trackMetric(event.id, 'view')
  }, [event, trackMetric])

  if (!event) return <EventMissing />
  const mascot = resolveEventMascot(allMascots, event.mascotId)
  if (params.get('chup-anh') === '1') return <div className="events-page narrow-page">
    <Link className="back-link" to={`/su-kien/${event.id}`}><ArrowLeft size={17}/>Về sự kiện</Link>
    <h1>Chụp ảnh cùng {mascot.name}</h1>
    <Suspense fallback={<p role="status">Đang mở trải nghiệm AR…</p>}><EventEncounter key={event.id} event={event} mascot={mascot} anchor={event.arAnchor ?? null} /></Suspense>
  </div>
  const phase = getEventPhase(event)
  const stops = event.stops ?? []

  return (
    <div className="events-page event-detail">
      <Link to="/su-kien" className="back-link"><ArrowLeft size={17} />Các sự kiện</Link>
      <div className="event-detail-layout">
        <div className="event-detail-art">
          <span className={`phase-badge phase-${phase}`}>{eventPhaseLabel(phase)}</span>
          <Mascot asset={mascot} mood="wave" size={290} />
          <div><span>Xin chào, mình là</span><strong>{mascot.name}.</strong><p>Hẹn gặp bạn ở sự kiện!</p>
            <Link to={'/mascot-3d?event=' + encodeURIComponent(event.id)} className="text-link">Xem mascot 360°</Link>
          </div>
        </div>
        <section className="event-detail-copy">
          <p className="studio-kicker">{event.club}</p>
          <h1 tabIndex={-1}>{event.title}</h1>
          <EventFacts event={event} />
          <p className="event-end-time"><Clock3 size={17} />Kết thúc: {eventDate(event.endsAt)}</p>
          <Link
            to={eventRoute(event)}
            className="button button-primary event-go"
            onClick={() => trackMetric(event.id, 'navigation')}
          >
            <Navigation size={20} />Dẫn đường tới sự kiện<ArrowUpRight size={19} />
          </Link>
          <p className="field-hint">Vini sẽ dẫn đường cho bạn. {isLive ? 'Tuyến đi lấy trực tiếp từ backend Wayfinder.' : 'Các tuyến hiện là mô phỏng.'}</p>
          <p className="event-description">{event.description}</p>
          <button className="button button-primary" aria-expanded={encounter} onClick={() => setEncounter(!encounter)}>{encounter ? 'Đóng trải nghiệm AR' : 'Gặp mascot trong AR'}</button>
          {encounter && <Suspense fallback={<p role="status">Đang mở trải nghiệm AR…</p>}><EventEncounter key={event.id} event={event} mascot={mascot} anchor={event.arAnchor ?? null} /></Suspense>}

          {stops.length > 0 && (
            <section className="event-stops-section" aria-label="Các trạm dừng trong sự kiện">
              <h2>Các trạm / gian hàng trong sự kiện ({stops.length})</h2>
              <ol className="event-stops-list">
                {stops.map((stop, idx) => (
                  <li key={stop.id} className="event-stop-card">
                    <span className="stop-order">{String(idx + 1).padStart(2, '0')}</span>
                    <div className="stop-copy">
                      <strong>{stop.label}</strong>
                      <small>{getPlace(stop.locationId)?.name || stop.locationId}{stop.note ? ` · ${stop.note}` : ''}</small>
                    </div>
                    <Link
                      to={eventRoute(event, '/di-den', stop.id)}
                      className="button button-quiet"
                      onClick={() => trackMetric(event.id, 'navigation')}
                    >
                      <Navigation size={15} />Đi tới trạm
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <EventAlbum key={event.id} event={event} />
          <EventQrCard
            value={eventShareUrl(event.id)}
            title="Mã QR chia sẻ sự kiện"
            subtitle="Quét mã hoặc sao chép liên kết để mời bạn bè cùng đi tới sự kiện."
            filename={`vinuni-event-${event.id}`}
          />

          <div className="event-organizer">
            <Users size={21} />
            <div><strong>{event.club}</strong><span>Đơn vị tổ chức sự kiện</span></div>
            <Link to={`/clb/su-kien/${event.id}/chinh-sua`} aria-label="Chỉnh sửa sự kiện" className="icon-button"><FilePenLine size={19} /></Link>
          </div>
          <LocalNote />
        </section>
      </div>
    </div>
  )
}
