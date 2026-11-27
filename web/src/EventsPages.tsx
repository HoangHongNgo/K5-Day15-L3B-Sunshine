import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Clock3, ExternalLink, FilePenLine, Info, MapPin, Navigation, Plus, Save, Search, Sparkles, Users } from 'lucide-react'
import { places, getPlace, normalize } from './data'
import { useEvents, useEventJourney } from './EventContext'
import { defaultMascot, emptyEvent, eventDate, eventRoute, validateEvent, type CampusEvent } from './events'
import { Mascot } from './Mascot'
import { MascotCreator, MascotPicker } from './MascotStudio'

export function EventJourneyBadge() {
  const { event, mascot } = useEventJourney()
  if (!event) return null
  return <Link to={`/su-kien/${event.id}`} className="event-journey-badge"><CalendarDays size={18} /><span><strong>{event.title}</strong><small>{mascot.name} đang đồng hành cùng bạn</small></span><ChevronRight size={18} /></Link>
}
function LocalNote() { return <p className="local-note"><Info size={16} /><span>Bản thử lưu trên trình duyệt này. Chưa đăng công khai hoặc đồng bộ với thiết bị khác.</span></p> }
function EventFacts({ event }: { event: CampusEvent }) {
  return <div className="event-facts"><span><CalendarDays size={17} />{eventDate(event.startsAt)}</span><span><MapPin size={17} />{getPlace(event.locationId)?.name || 'Chưa chọn địa điểm'}</span></div>
}
function ClubShell({ children }: { children: ReactNode }) {
  return <div className="club-shell"><aside className="club-sidebar"><Link className="studio-brand" to="/clb"><span><Users size={23} /></span><div>Không gian CLB<small>VinUni AR Map</small></div></Link><nav aria-label="Quản lý câu lạc bộ"><NavLink to="/clb" end><CalendarDays size={19} />Sự kiện của bạn</NavLink><NavLink to="/clb/mascot"><Sparkles size={19} />Thư viện mascot</NavLink></nav><Link className="club-visitor-link" to="/su-kien"><ExternalLink size={17} />Xem phía người tham dự</Link><LocalNote /></aside><div className="club-content">{children}</div></div>
}
export function ClubDashboard() {
  const { events } = useEvents()
  const [filter, setFilter] = useState('all')
  const list = events.filter(e => filter === 'all' || e.status === filter)
  return <ClubShell><div className="studio-heading"><div><p className="studio-kicker">Dành cho câu lạc bộ</p><h1 tabIndex={-1}>Hẹn nhau ở VinUni.</h1><p>Đưa sự kiện và người bạn của CLB đến gần mọi người.</p></div><Link to="/clb/su-kien/moi" className="button button-primary"><Plus size={18} />Thêm sự kiện</Link></div>
    <div className="studio-banner"><div><span className="studio-icon"><Sparkles size={22} /></span><h2>Mỗi sự kiện, một người dẫn đường.</h2><p>Chọn nơi tổ chức, thêm mascot. Người tham dự chỉ cần mở sự kiện và bắt đầu đi.</p><Link to="/clb/mascot" className="text-link">Khám phá thư viện mascot<ArrowUpRight size={17} /></Link></div><Mascot asset={defaultMascot} mood="wave" size={170} /></div>
    <div className="event-list-heading"><h2>Sự kiện của bạn <span>{events.length}</span></h2><select aria-label="Lọc trạng thái sự kiện" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả trạng thái</option><option value="draft">Bản nháp</option><option value="published">Đã đăng thử</option></select></div>
    <div className="managed-events">{list.length ? list.map(event => <article className="managed-event" key={event.id}><div className="event-date-tile"><CalendarDays size={23} /><span>{event.startsAt ? eventDate(event.startsAt).split(' ')[1] || 'Lịch' : 'Nháp'}</span></div><div className="managed-event-copy"><div className="event-labels"><span className={`event-status ${event.status}`}>{event.status === 'draft' ? 'Bản nháp' : 'Đã đăng thử'}</span>{event.demo && <span className="event-demo">Dữ liệu mẫu</span>}</div><h3>{event.title}</h3><p>{event.club || 'Chưa thêm đơn vị tổ chức'}</p><EventFacts event={event} /></div><div className="managed-event-actions"><Link to={`/clb/su-kien/${event.id}/chinh-sua`} aria-label={`Chỉnh sửa ${event.title}`} className="button button-quiet"><FilePenLine size={16} /><span>Chỉnh sửa</span></Link>{event.status === 'published' && <Link to={`/su-kien/${event.id}`} className="icon-button" aria-label={`Xem ${event.title}`}><ArrowUpRight size={20} /></Link>}</div></article>) : <div className="events-empty"><CalendarDays size={32} /><h3>Chưa có sự kiện ở đây</h3><p>Tạo lời hẹn đầu tiên cho CLB của bạn.</p><Link to="/clb/su-kien/moi" className="button button-quiet"><Plus size={17} />Thêm sự kiện</Link></div>}</div>
  </ClubShell>
}

export function EventEditor() {
  const { id } = useParams()
  const { events } = useEvents()
  const found = id ? events.find(e => e.id === id) : undefined
  if (id && !found) return <EventMissing management />
  return <EditorForm key={id || 'new'} initial={found} />
}
function EditorForm({ initial }: { initial?: CampusEvent }) {
  const [draft, setDraft] = useState<CampusEvent>(() => initial ? { ...initial } : emptyEvent())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const { allMascots, saveEvent } = useEvents()
  const navigate = useNavigate()
  const mascot = allMascots.find(m => m.id === draft.mascotId) ?? defaultMascot
  function update<K extends keyof CampusEvent>(key: K, value: CampusEvent[K]) { setDraft(d => ({ ...d, [key]: value })); setMessage(''); setError('') }
  function save(status: CampusEvent['status']) {
    const event = { ...draft, title: draft.title.trim(), club: draft.club.trim(), description: draft.description.trim(), status }
    const problem = validateEvent(event, status === 'published') || saveEvent(event)
    if (problem) { setError(problem); return }
    setDraft(event); setError('')
    if (status === 'published') navigate(`/su-kien/${event.id}`)
    else { setMessage('Đã lưu bản nháp trên thiết bị này.'); if (!initial) navigate(`/clb/su-kien/${event.id}/chinh-sua`, { replace: true }) }
  }
  function submit(e: FormEvent) { e.preventDefault(); save('published') }
  return <ClubShell><Link to="/clb" className="back-link"><ArrowLeft size={17} />Sự kiện của bạn</Link><div className="studio-heading editor-heading"><div><h1 tabIndex={-1}>{initial ? 'Chỉnh sửa sự kiện' : 'Tạo một cuộc hẹn mới'}</h1><p>Thông tin rõ ràng. Địa điểm dễ tìm. Một mascot đáng nhớ.</p></div><span className="event-status draft">{draft.status === 'published' ? 'Đã đăng thử' : 'Bản nháp'}</span></div>
    <form className="event-editor-layout" onSubmit={submit} noValidate><div className="event-form">
      <section className="editor-section"><div className="editor-section-title"><span>01</span><div><h2>Thông tin sự kiện</h2><p>Người tham dự cần biết điều gì?</p></div></div><label htmlFor="event-title">Tên sự kiện<input id="event-title" maxLength={100} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Ví dụ: Music Under the Stars" required /></label><label htmlFor="event-club">Câu lạc bộ / đơn vị tổ chức<input id="event-club" maxLength={80} value={draft.club} onChange={e => update('club', e.target.value)} placeholder="Tên câu lạc bộ của bạn" required /></label><label htmlFor="event-description">Mô tả<textarea id="event-description" maxLength={1500} rows={4} value={draft.description} onChange={e => update('description', e.target.value)} placeholder="Giới thiệu hoạt động, ai có thể tham gia và cần chuẩn bị gì…" required /></label><div className="event-form-pair"><label htmlFor="event-start">Bắt đầu<input id="event-start" type="datetime-local" value={draft.startsAt.slice(0, 16)} onChange={e => update('startsAt', e.target.value ? `${e.target.value}:00+07:00` : '')} required /></label><label htmlFor="event-end">Kết thúc<input id="event-end" type="datetime-local" value={draft.endsAt.slice(0, 16)} onChange={e => update('endsAt', e.target.value ? `${e.target.value}:00+07:00` : '')} required /></label></div><p className="field-hint">Thời gian Việt Nam (UTC+7).</p></section>
      <section className="editor-section"><div className="editor-section-title"><span>02</span><div><h2>Địa điểm tổ chức</h2><p>Nơi mascot sẽ đưa người tham dự đến.</p></div></div><label htmlFor="event-location">Địa điểm tại VinUni<select id="event-location" value={draft.locationId} onChange={e => update('locationId', e.target.value)} required><option value="">Chọn địa điểm</option>{places.map(place => <option value={place.id} key={place.id}>{place.name}</option>)}</select></label><p className="location-hint"><MapPin size={18} />Danh mục và tuyến đi hiện là dữ liệu mô phỏng của Toà I.</p></section>
      <section className="editor-section"><div className="editor-section-title"><span>03</span><div><h2>Người bạn đồng hành</h2><p>Xuất hiện khi người tham dự chọn dẫn đường tới sự kiện.</p></div></div><MascotPicker selected={draft.mascotId} onChange={id => update('mascotId', id)} /><button type="button" className="create-mascot-toggle" onClick={() => setCreating(!creating)} aria-expanded={creating}><Sparkles size={18} />{creating ? 'Thu gọn phần tạo mascot' : 'Tạo mascot riêng cho CLB'}<Plus size={18} /></button>{creating && <MascotCreator club={draft.club} onUse={id => update('mascotId', id)} />}</section>
      {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="inline-feedback" role="status"><Check size={18} />{message}</p>}
      <div className="editor-actions"><button type="button" className="button button-quiet" onClick={() => save('draft')}><Save size={18} />Lưu bản nháp</button><button type="submit" className="button button-primary">{draft.status === 'published' ? 'Cập nhật trang sự kiện' : 'Đăng thử sự kiện'}<ArrowUpRight size={18} /></button></div><LocalNote />
    </div><aside className="event-preview"><span className="preview-title">Góc nhìn người tham dự</span><div className="event-preview-art"><Mascot asset={mascot} mood="wave" size={190} /><span>{mascot.name}</span></div><div className="event-preview-copy"><span>{draft.club || 'Câu lạc bộ của bạn'}</span><h2>{draft.title || 'Sự kiện sắp tới của bạn'}</h2><EventFacts event={draft} /><div className="preview-route"><Navigation size={18} />Dẫn đường tới sự kiện<ArrowUpRight size={18} /></div></div><p>Đi bình thường dùng Vini. Chọn sự kiện này sẽ đi cùng {mascot.name}.</p></aside></form>
  </ClubShell>
}

export function ClubMascots() {
  const [selected, setSelected] = useState('vini')
  return <ClubShell><div className="studio-heading"><div><p className="studio-kicker">Dành cho câu lạc bộ</p><h1 tabIndex={-1}>Những người bạn của CLB.</h1><p>Tạo một lần, dùng lại cho những cuộc hẹn sau.</p></div></div><section className="library-section"><h2>Thư viện của bạn</h2><MascotPicker selected={selected} onChange={setSelected} /></section><MascotCreator onUse={setSelected} /><Link to="/clb/su-kien/moi" className="button button-quiet library-next">Tạo sự kiện và chọn mascot<ArrowRight size={18} /></Link></ClubShell>
}

export function EventsList() {
  const { events, allMascots } = useEvents()
  const [query, setQuery] = useState('')
  const visible = events.filter(e => e.status === 'published' && !validateEvent(e) && normalize(`${e.title} ${e.club}`).includes(normalize(query)))
  return <div className="events-page"><Link to="/" className="back-link"><ArrowLeft size={17} />Bản đồ</Link><div className="events-page-heading"><div><p className="studio-kicker">Gặp nhau trong khuôn viên</p><h1 tabIndex={-1}>Có hẹn ở VinUni.</h1><p>Chọn một sự kiện. Gặp mascot. Bắt đầu hành trình.</p></div><Link to="/clb" className="button button-quiet"><Users size={18} />Dành cho CLB</Link></div><form className="search-box events-search" role="search" onSubmit={e => e.preventDefault()}><Search size={21} /><input aria-label="Tìm sự kiện hoặc câu lạc bộ" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm sự kiện hoặc câu lạc bộ…" /></form>
    <div className="event-cards">{visible.map(event => { const mascot = allMascots.find(m => m.id === event.mascotId) ?? defaultMascot; return <Link to={`/su-kien/${event.id}`} className="event-card" key={event.id}><div className="event-card-art"><span className="event-demo">{event.demo ? 'Sự kiện mẫu' : 'Đăng thử trên thiết bị'}</span><Mascot asset={mascot} size={170} mood="wave" /><span className="event-mascot-label">Đi cùng {mascot.name}</span></div><div className="event-card-copy"><p>{event.club}</p><h2>{event.title}</h2><EventFacts event={event} /><span className="event-card-action">Khám phá sự kiện<ArrowUpRight size={18} /></span></div></Link> })}</div>
    {!visible.length && <div className="events-empty"><CalendarDays size={36} /><h2>Chưa tìm thấy cuộc hẹn này</h2><p>Thử tên khác hoặc thêm sự kiện trong khu CLB.</p><Link to="/clb" className="button button-quiet">Mở khu CLB<ArrowRight size={18} /></Link></div>}<LocalNote />
  </div>
}

function EventMissing({ management = false }: { management?: boolean }) { return <div className="narrow-page events-empty"><CalendarDays size={36} /><h1 tabIndex={-1}>Chưa có sự kiện này</h1><p>Sự kiện có thể đang ở bản nháp hoặc được tạo trên thiết bị khác.</p><Link className="button button-primary" to={management ? '/clb' : '/su-kien'}>Về danh sách sự kiện<ArrowLeft size={18} /></Link></div> }
export function EventDetail() {
  const { id } = useParams()
  const { events, allMascots } = useEvents()
  const event = events.find(e => e.id === id && e.status === 'published' && !validateEvent(e))
  if (!event) return <EventMissing />
  const mascot = allMascots.find(m => m.id === event.mascotId) ?? defaultMascot
  return <div className="events-page event-detail"><Link to="/su-kien" className="back-link"><ArrowLeft size={17} />Các sự kiện</Link><div className="event-detail-layout"><div className="event-detail-art"><span className="event-demo">{event.demo ? 'Sự kiện minh hoạ' : 'Sự kiện đăng thử'}</span><Mascot asset={mascot} mood="wave" size={290} /><div><span>Xin chào, mình là</span><strong>{mascot.name}.</strong><p>Mình sẽ đồng hành cùng bạn đến sự kiện.</p></div></div><section className="event-detail-copy"><p className="studio-kicker">{event.club}</p><h1 tabIndex={-1}>{event.title}</h1><EventFacts event={event} /><p className="event-end-time"><Clock3 size={17} />Kết thúc: {eventDate(event.endsAt)}</p><Link to={eventRoute(event)} className="button button-primary event-go"><Navigation size={20} />Dẫn đường tới sự kiện<ArrowUpRight size={19} /></Link><p className="field-hint">Bạn sẽ đi cùng {mascot.name}. Các tuyến hiện là mô phỏng.</p><p className="event-description">{event.description}</p><div className="event-organizer"><Users size={21} /><div><strong>{event.club}</strong><span>Đơn vị tổ chức do người tạo nhập</span></div><Link to={`/clb/su-kien/${event.id}/chinh-sua`} aria-label="Chỉnh sửa sự kiện" className="icon-button"><FilePenLine size={19} /></Link></div><LocalNote /></section></div></div>
}
