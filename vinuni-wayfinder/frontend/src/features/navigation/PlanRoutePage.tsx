import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Camera, Check, CheckCheck, ChevronDown, ChevronRight, Footprints, LoaderCircle, LocateFixed, MapPin, Mic } from 'lucide-react'
import { BackLink, DemoNote, parseCoord } from '../../shared/ui'
import { useEventJourney } from '../events/EventContext'
import { EventJourneyBadge } from '../events/EventsPages'
import EventVoice from '../events/EventVoice'
import { Mascot } from '../mascot/Mascot'
import { findRoute } from '../wayfinder/data'
import { ApiError, splitRouteSteps, wayfinderApi, type BackendRouteResponse } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import { requestSensorPermission } from '../../shared/lib/sensors.js'
import { JourneyModeButton, preferredJourneyMode, rememberJourneyMode, type JourneyMode } from './JourneyModeButton'

export function PlanRoutePage() {
  const { places, getPlace, isLive } = useWayfinder()
  const { link } = useEventJourney()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState(preferredJourneyMode)
  const [voiceOpen, setVoiceOpen] = useState(false)
  function chooseMode(next: JourneyMode) { setMode(next); rememberJourneyMode(next) }
  const rawFrom = params.get('from') ?? ''
  const fromLabel = params.get('fromLabel') ?? ''
  const lat = parseCoord(params.get('lat'))
  const lng = parseCoord(params.get('lng'))
  const hasGps = isLive && lat !== undefined && lng !== undefined
  const fromPlace = getPlace(rawFrom)
  const from = isLive ? rawFrom : (fromPlace?.id ?? '')
  const to = getPlace(params.get('to'))?.id ?? ''
  const selected = getPlace(to)
  const isCustomSpot = Boolean(isLive && from && !fromPlace)

  const [liveRoute, setLiveRoute] = useState<BackendRouteResponse | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')

  useEffect(() => {
    if (!isLive || !to || (!from && !hasGps)) {
      setLiveRoute(null)
      setRouteError('')
      setRouteLoading(false)
      return
    }
    if (!hasGps && from === to) {
      setLiveRoute(null)
      setRouteError('')
      setRouteLoading(false)
      return
    }
    const controller = new AbortController()
    setRouteLoading(true)
    setRouteError('')
    const reqParams = hasGps ? { to, lat, lng } : { to, start: from }
    wayfinderApi.route(reqParams, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setLiveRoute(data)
          setRouteError('')
        }
      })
      .catch(err => {
        if (controller.signal.aborted) return
        setLiveRoute(null)
        setRouteError(err instanceof ApiError ? err.message : 'Không tìm được tuyến đường. Hãy thử chọn điểm xuất phát khác.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false)
      })
    return () => controller.abort()
  }, [isLive, to, from, hasGps, lat, lng])

  const mockRoute = !isLive && from && to ? findRoute(from, to) : null
  const liveSplit = liveRoute ? splitRouteSteps(liveRoute.steps) : null
  const canSubmit = isLive
    ? Boolean(to && (hasGps || from) && !routeLoading && !routeError && (from === to || liveRoute))
    : Boolean(from && to && mockRoute)

  function change(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.set(key, value)
    if (key === 'from') { next.delete('fromLabel'); next.delete('lat'); next.delete('lng') }
    if (key === 'to') { next.delete('event'); next.delete('stop') }
    const start = next.get('from')
    const destination = next.get('to')
    if (mode === 'camera' && (!to || (!from && !hasGps)) && destination && (start || hasGps)
      && (isLive || (start && findRoute(start, destination)))) {
      next.set('mode', mode)
      navigate(link(`/hanh-trinh?${next}`))
      return
    }
    setParams(next, { replace: true })
  }

  function clearGps() {
    const next = new URLSearchParams(params)
    next.delete('lat'); next.delete('lng')
    setParams(next, { replace: true })
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    // iOS: xin quyền cảm biến trong lần chạm này để đếm bước / la bàn chạy ngay khi vào hành trình.
    void requestSensorPermission().catch(() => {})
    e.preventDefault()
    if (!canSubmit) return
    const q = new URLSearchParams({ to, mode })
    if (params.has('stop')) q.set('stop', params.get('stop')!)
    if (hasGps) {
      q.set('lat', String(lat))
      q.set('lng', String(lng))
    } else if (from) {
      q.set('from', from)
      if (fromLabel) q.set('fromLabel', fromLabel)
    }
    navigate(link(`/hanh-trinh?${q}`))
  }

  return (
    <div className="focused-page">
      <BackLink />
      <div className="journey-layout">
        <section className="plan-form">
          <EventJourneyBadge />
          <h1 tabIndex={-1}>Mình đi từ đâu?</h1>
          <p className="page-intro">{mode === 'camera' ? 'Chọn hai điểm để mở camera dẫn đường.' : 'Chọn điểm xuất phát và điểm đến tại VinUni.'}</p>
          <form onSubmit={submit}>
            <div className="plan-mode"><JourneyModeButton current={mode} onChange={chooseMode} /></div>
            <div className="route-inputs">
              <div className="route-connection" aria-hidden="true"><span /><i /><MapPin size={18} /></div>
              <div className="route-fields">
                <label htmlFor="origin">Điểm xuất phát</label>
                {hasGps ? (
                  <div className="inline-feedback"><LocateFixed size={18} /><span>Vị trí GPS của bạn</span><button type="button" className="text-link" onClick={clearGps}>Đổi</button></div>
                ) : (
                  <div className="select-wrap">
                    <select id="origin" value={from} required onChange={e => change('from', e.target.value)}>
                      <option value="" disabled>Chọn nơi bạn đang đứng</option>
                      {isCustomSpot && <option value={from}>{fromLabel || from}</option>}
                      {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <ChevronDown size={17} />
                  </div>
                )}
                <label htmlFor="destination">Điểm đến</label>
                <div className="select-wrap">
                  <select id="destination" value={to} required onChange={e => change('to', e.target.value)}>
                    <option value="" disabled>Bạn muốn tới đâu?</option>
                    {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown size={17} />
                </div>
              </div>
            </div>
            <Link className="inline-camera" to={link(`/anh${to ? `?to=${to}` : ''}`)}><Camera size={19} />Chụp ảnh để biết mình đang ở đâu<ChevronRight size={17} /></Link>
            {isLive && routeLoading && <p className="inline-feedback" role="status"><LoaderCircle size={18} className="recognition-spinner" />Đang tính đường đi từ backend…</p>}
            {isLive && routeError && <p className="error-message" role="alert">{routeError}</p>}
            {!isLive && from && to && !mockRoute && <p className="error-message" role="alert">Chưa có đường nối hai địa điểm này. Hãy chọn một điểm khác.</p>}
            {!hasGps && from && from === to && <p className="inline-feedback"><CheckCheck size={19} />Bạn đã chọn cùng một địa điểm.</p>}
            <button className="button button-primary full-width" type="submit" disabled={!canSubmit}>
              <Footprints size={20} />{!hasGps && from && from === to ? 'Xác nhận đang ở đây' : mode === 'camera' ? 'Bắt đầu với camera' : 'Xem hành trình'}<ArrowRight size={19} />
            </button>
          </form>
          <button className="button button-quiet full-width walk-voice-toggle" type="button" aria-expanded={voiceOpen} onClick={() => setVoiceOpen(!voiceOpen)}>
            <Mic size={18} />{voiceOpen ? 'Đóng hỏi đường' : 'Hỏi đường bằng giọng nói'}
          </button>
          {voiceOpen && <EventVoice navigation={{ destinationId: to || undefined }} />}
          <DemoNote />
        </section>
        <aside className="journey-preview">
          <div className="preview-heading">
            <span className="preview-mascot"><Mascot mood="wait" size={100} /></span>
            <h2>{selected ? selected.name : 'Một hành trình rõ ràng'}</h2>
            <p>{selected ? (selected.building ?? 'Toà I, tầng trệt') : 'Không cần đọc sơ đồ phức tạp.'}</p>
          </div>
          {isLive && liveRoute && liveSplit ? (
            <>
              <div className="route-summary"><span><strong>{liveSplit.travelSteps.length}</strong> chặng</span><span><strong>{liveRoute.totalMeters}</strong> m</span><span>Đi bộ</span></div>
              <ol className="mini-itinerary"><li>{liveRoute.start}</li>{liveSplit.travelSteps.map((s, idx) => <li key={`${s.target.node}-${idx}`}>{s.text}</li>)}</ol>
            </>
          ) : !isLive && mockRoute && mockRoute.length > 0 ? (
            <>
              <div className="route-summary"><span><strong>{mockRoute.length}</strong> chặng</span><span>Đi bộ</span><span>Tầng trệt</span></div>
              <ol className="mini-itinerary"><li>{getPlace(from)?.name}</li>{mockRoute.map(edge => <li key={edge.to}>{getPlace(edge.to)?.name}</li>)}</ol>
            </>
          ) : (
            <div className="preview-explanation"><span><Check size={19} />Chỉ một chỉ dẫn mỗi lần</span><span><Check size={19} />Có thể đổi điểm xuất phát</span><span><Check size={19} />Tự xác nhận khi qua từng chặng</span></div>
          )}
          <span className="preview-label">{isLive ? 'Tuyến đường từ VinUni Wayfinder' : 'Tuyến mẫu cho bản trải nghiệm'}</span>
        </aside>
      </div>
    </div>
  )
}
