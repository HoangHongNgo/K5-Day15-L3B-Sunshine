import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ChevronRight, Info, LocateFixed, MapPin, Search, ShieldCheck } from 'lucide-react'
import { BackLink, EmptyState } from '../../shared/ui'
import { useEventJourney } from '../events/EventContext'
import { ApiError, wayfinderApi, type BackendSpot } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'

export function ChooseLocationPage() {
  const { getPlace, searchPlaces, isLive, outdoorGeo } = useWayfinder()
  const { link } = useEventJourney()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const to = getPlace(params.get('to'))?.id ?? ''
  const [query, setQuery] = useState('')
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [gpsMessage, setGpsMessage] = useState('')
  const [spots, setSpots] = useState<BackendSpot[]>([])
  const [spotsError, setSpotsError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    if (!isLive) { setSpots([]); setSpotsError(''); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      wayfinderApi.spotSearch(query, controller.signal)
        .then(res => { if (!controller.signal.aborted) { setSpots(res.spots); setSpotsError('') } })
        .catch(err => {
          if (controller.signal.aborted) return
          setSpots([])
          setSpotsError(err instanceof ApiError ? err.message : 'Không tải được danh sách điểm trong nhà.')
        })
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [isLive, query])

  function locate() {
    if (!navigator.geolocation) { setGpsMessage('Trình duyệt chưa hỗ trợ vị trí. Bạn vẫn có thể chọn một điểm bên dưới.'); return }
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return
      setGpsState('done')
      if (isLive && outdoorGeo) {
        const q = new URLSearchParams({ lat: String(position.coords.latitude), lng: String(position.coords.longitude) })
        if (to) q.set('to', to)
        navigate(link(`/di-den?${q}`))
        return
      }
      setGpsMessage(`Điện thoại báo sai số khoảng ${Math.round(position.coords.accuracy)} m. Chưa thể xác định phòng trong nhà; hãy chọn điểm bạn nhận ra bên dưới.`)
    }, error => {
      if (!alive.current) return
      setGpsState('done')
      setGpsMessage(error.code === 1 ? 'Bạn chưa cấp quyền vị trí. Không sao, hãy chọn điểm bạn nhận ra bên dưới.' : 'Chưa lấy được vị trí điện thoại. Thử lại hoặc chọn một điểm bên dưới.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  const matchedPlaces = searchPlaces(query)
  const hasAny = matchedPlaces.length > 0 || (isLive && spots.length > 0)

  return (
    <div className="narrow-page">
      <BackLink to={link(`/di-den${to ? `?to=${to}` : ''}`)}>Hành trình của bạn</BackLink>
      <h1 tabIndex={-1}>Bắt đầu từ một điểm quen</h1>
      <p className="page-intro">Nhìn biển tên gần bạn, hoặc chọn một cách bên dưới.</p>
      <div className="location-methods">
        <button className="method-button" onClick={locate} disabled={gpsState === 'loading'} aria-busy={gpsState === 'loading'}>
          <LocateFixed size={25} />
          <span><strong>{gpsState === 'loading' ? 'Đang lấy vị trí…' : 'Dùng vị trí điện thoại'}</strong><small>{isLive && outdoorGeo ? 'Tìm lối đi gần nhất khi ở ngoài trời' : 'Phù hợp khi ở ngoài trời'}</small></span>
          <ChevronRight size={20} />
        </button>
        <Link className="method-button" to={link(`/anh${to ? `?to=${to}` : ''}`)}>
          <Camera size={25} />
          <span><strong>Chụp ảnh xung quanh</strong><small>{isLive ? 'Nhận diện vị trí trong nhà qua máy chủ' : 'Thử luồng chụp ảnh trong nhà'}</small></span>
          <ChevronRight size={20} />
        </Link>
      </div>
      {gpsMessage && <p className="inline-feedback" role="status"><Info size={20} />{gpsMessage}</p>}
      <section className="location-list">
        <h2>Hoặc chọn điểm xuất phát</h2>
        <label htmlFor="origin-search" className="visually-hidden">Tìm điểm xuất phát</label>
        <div className="search-box compact-search"><Search size={20} /><input id="origin-search" placeholder="Tìm phòng, sảnh, quầy cà phê…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        {spotsError && <p className="error-message" role="alert">{spotsError}</p>}
        {isLive && spots.length > 0 && spots.map(s => {
          const q = new URLSearchParams({ from: s.spot, fromLabel: s.label })
          if (to) q.set('to', to)
          return <Link className="location-option" key={`spot-${s.spot}`} to={link(`/di-den?${q}`)}><LocateFixed size={19} /><span>{s.label}</span><ChevronRight size={18} /></Link>
        })}
        {matchedPlaces.map(place => <Link className="location-option" key={place.id} to={link(`/di-den?from=${place.id}${to ? `&to=${to}` : ''}`)}><MapPin size={19} /><span>{place.name}</span><ChevronRight size={18} /></Link>)}
        {!hasAny && <EmptyState title="Chưa tìm thấy điểm này" description="Thử một mã phòng khác hoặc xoá từ khoá." action={<button className="button button-quiet" onClick={() => setQuery('')}>Xem tất cả</button>} />}
      </section>
      <p className="privacy-note"><ShieldCheck size={16} />{isLive ? 'Toạ độ GPS chỉ dùng để tìm điểm bắt đầu gần nhất và không được lưu lại.' : 'Vị trí điện thoại không được lưu hoặc gửi đi.'}</p>
    </div>
  )
}
