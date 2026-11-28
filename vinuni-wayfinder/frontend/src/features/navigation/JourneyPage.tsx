import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronLeft, DoorOpen, Footprints, LoaderCircle, MapPin, Navigation2, RotateCcw, Volume2, VolumeX, X, type LucideIcon } from 'lucide-react'
import { DemoNote, EmptyState, IconButton, Modal, NotFound, parseCoord } from '../../shared/ui'
import { SaveButton } from '../../shared/FavoritesContext'
import { useEventJourney } from '../events/EventContext'
import { EventWelcome } from './EventWelcome'
import { EventJourneyBadge } from '../events/EventsPages'
import { Mascot } from '../mascot/Mascot'
import { findRoute, type Turn } from '../wayfinder/data'
import { ApiError, splitRouteSteps, stepDirection, wayfinderApi, type BackendRouteResponse, type StepDirection } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import { JourneyCamera } from './JourneyCamera'
import { JourneyModeButton, rememberJourneyMode, type JourneyMode } from './JourneyModeButton'
import { resolveArrivalContext } from './eventArrival'

const turnIcons: Record<Turn, LucideIcon> = { straight: ArrowUp, left: ArrowLeft, right: ArrowRight }
const turnLabels: Record<Turn, string> = { straight: 'Đi thẳng', left: 'Rẽ trái', right: 'Rẽ phải' }
const stepDirIcons: Record<StepDirection, LucideIcon> = { straight: ArrowUp, left: ArrowLeft, right: ArrowRight, back: RotateCcw, door: DoorOpen, arrive: Check }
const stepDirLabels: Record<StepDirection, string> = { straight: 'Đi thẳng', left: 'Rẽ trái', right: 'Rẽ phải', back: 'Quay lại', door: 'Qua cửa', arrive: 'Đã tới nơi' }

export function JourneyPage() {
  const { getPlace, isLive } = useWayfinder()
  const { event, link } = useEventJourney()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'camera' ? 'camera' : 'card'
  function chooseMode(next: JourneyMode) {
    rememberJourneyMode(next)
    setParams(old => { const q = new URLSearchParams(old); q.set('mode', next); return q }, { replace: true })
  }
  const rawFrom = params.get('from') ?? ''
  const fromLabel = params.get('fromLabel') ?? ''
  const rawTo = params.get('to') ?? ''
  const stopParam = params.get('stop')
  const lat = parseCoord(params.get('lat'))
  const lng = parseCoord(params.get('lng'))
  const arrivalCtx = event && rawTo ? resolveArrivalContext(event, rawTo, stopParam) : null
  const hasGps = isLive && lat !== undefined && lng !== undefined
  const fromPlace = getPlace(rawFrom)
  const toPlace = getPlace(rawTo)

  const [liveRoute, setLiveRoute] = useState<BackendRouteResponse | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [speechMessage, setSpeechMessage] = useState('')
  const [showExit, setShowExit] = useState(false)
  const speechAvailable = 'speechSynthesis' in window

  useEffect(() => {
    if (!isLive || !rawTo || (!rawFrom && !hasGps)) {
      setLiveRoute(null); setLiveError(''); setLiveLoading(false)
      return
    }
    if (!hasGps && rawFrom === rawTo) {
      setLiveRoute({
        destination: toPlace?.name ?? rawTo,
        start: fromLabel || fromPlace?.name || rawFrom,
        steps: [{ kind: 'arrive', text: `Bạn đã tới ${toPlace?.name ?? rawTo}`, meters: 0, approx: false, mapKind: 'indoor', building: toPlace?.building ?? null, target: { node: rawTo, label: toPlace?.name ?? rawTo, lat: null, lng: null }, passes: [], side: null }],
        totalMeters: 0,
        estSeconds: 0,
      })
      setLiveError('')
      setLiveLoading(false)
      return
    }
    const controller = new AbortController()
    setLiveLoading(true)
    setLiveError('')
    const reqParams = hasGps ? { to: rawTo, lat, lng } : { to: rawTo, start: rawFrom }
    wayfinderApi.route(reqParams, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setLiveRoute(data); setLiveError('') } })
      .catch(err => {
        if (controller.signal.aborted) return
        setLiveRoute(null)
        setLiveError(err instanceof ApiError ? err.message : 'Không tải được hành trình từ máy chủ.')
      })
      .finally(() => { if (!controller.signal.aborted) setLiveLoading(false) })
    return () => controller.abort()
  }, [isLive, rawTo, rawFrom, fromLabel, hasGps, lat, lng, toPlace?.name, toPlace?.building, fromPlace?.name])

  const stepParam = Number(params.get('buoc') ?? 0)
  useEffect(() => { return () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() } }, [])
  useEffect(() => { setSpeaking(false); if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [stepParam])

  function speakText(text: string) {
    if (!speechAvailable) return
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('vi'))
    if (!voice) { setSpeechMessage('Thiết bị chưa có giọng đọc tiếng Việt. Bạn vẫn có thể theo dõi chỉ dẫn trên màn hình.'); return }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'vi-VN'; utterance.voice = voice
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => { setSpeaking(false); setSpeechMessage('Chưa phát được giọng đọc. Hãy dùng chỉ dẫn trên màn hình.') }
    setSpeechMessage(''); setSpeaking(true); window.speechSynthesis.speak(utterance)
  }

  function goStep(next: number) {
    const q = new URLSearchParams(params)
    q.set('buoc', String(next))
    setParams(q, { replace: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const backQuery = new URLSearchParams(params)
  backQuery.delete('buoc')
  const exitDialog = showExit && <Modal title="Dừng hành trình?" onClose={() => setShowExit(false)}>
    <p>Bạn có thể bắt đầu lại bất kỳ lúc nào.</p>
    <div className="dialog-actions"><button className="button button-quiet" onClick={() => setShowExit(false)}>Tiếp tục đi</button>
      <Link className="button button-primary" to={`/di-den?${backQuery}`}>Dừng hành trình</Link></div>
  </Modal>
  const cameraControls = { onStep: goStep, onMode: chooseMode, onExit: () => setShowExit(true) }
  const modeButton = <div className="card-mode"><JourneyModeButton current="card" onChange={chooseMode} /></div>

  const welcome = event && arrivalCtx && <EventWelcome key={event.id + ':' + rawTo} event={event} arrival={arrivalCtx} mode={mode} place={toPlace} />
  const cardWelcome = <div className="focused-page journey-page">{modeButton}{welcome}</div>

  if (isLive) {
    if (!rawTo || (!rawFrom && !hasGps)) return <NotFound title="Chưa có hành trình này" description="Chọn lại điểm xuất phát và điểm đến để bắt đầu." />
    if (liveLoading) return <div className="narrow-page"><div className="locating-status" role="status"><LoaderCircle size={20} className="recognition-spinner" /><span>Đang tải chỉ dẫn từng bước…</span></div></div>
    if (liveError || !liveRoute) return <div className="narrow-page"><EmptyState title="Không tìm được hành trình" description={liveError || 'Chưa có đường nối phù hợp.'} action={<Link className="button button-primary" to={link(`/di-den?to=${rawTo}`)}>Chọn lại điểm xuất phát</Link>} /></div>

    const { travelSteps, arrivalStep } = splitRouteSteps(liveRoute.steps)
    const step = Math.min(Math.max(Number.isFinite(stepParam) ? Math.floor(stepParam) : 0, 0), travelSteps.length)
    const arrived = step === travelSteps.length
    const curStep = travelSteps[step]
    const dir: StepDirection = curStep ? stepDirection(curStep) : 'arrive'
    const Direction = stepDirIcons[dir]
    const mascotMood = arrived ? 'jump' : dir === 'left' ? 'left' : dir === 'right' ? 'right' : dir === 'back' ? 'wait' : 'walk'
    const progress = travelSteps.length ? Math.round((step / travelSteps.length) * 100) : 100
    const startDisplay = fromLabel || liveRoute.start
    if (arrived && welcome && mode === 'card') return cardWelcome
    if (mode === 'camera' && (!arrived || welcome)) return <><JourneyCamera {...cameraControls} welcome={arrived && welcome} live
      destination={liveRoute.destination} step={step} direction={stepDirLabels[dir]} icon={Direction} mood={mascotMood} instruction={curStep?.text ?? ''}
      waypoints={travelSteps.map(s => ({ label: s.target.label || s.text, meters: s.meters, approx: s.approx }))} />{exitDialog}</>

    return (
      <div className="focused-page journey-page">
        {!arrived && modeButton}
        <EventJourneyBadge />
        <div className="active-journey-layout">
          <section className="active-direction" aria-live="polite">
            <div className="direction-heading"><h1 tabIndex={-1}>{arrived ? 'Tới nơi rồi!' : liveRoute.destination}</h1><p>{arrived ? (arrivalStep?.text || `Bạn đã tới ${liveRoute.destination}.`) : `Chặng ${step + 1} trong ${travelSteps.length} chặng`}</p></div>
            <div className={`direction-stage ${arrived ? 'arrived' : ''}`}>
              <div className="journey-companion"><Mascot mood={mascotMood} size={122} /><span className="companion-arrow"><Direction size={50} strokeWidth={1.5} aria-hidden="true" /></span></div>
              <h2>{arrived ? liveRoute.destination : stepDirLabels[dir]}</h2>
              <p>{arrived ? (arrivalStep?.side ? `Điểm đến ở ${arrivalStep.side}. Đối chiếu biển tên trước khi vào.` : 'Đối chiếu biển tên trước khi vào phòng.') : curStep.text}</p>
              {!arrived && curStep.passes.length > 0 && <p className="helper-text">Đi ngang qua: {curStep.passes.map(p => `${p.name} (${p.side})`).join(', ')}</p>}
              <span className="direction-location"><MapPin size={15} />{arrived ? (arrivalStep?.building || toPlace?.building || 'VinUniversity') : (curStep.building || (curStep.mapKind === 'outdoor' ? 'Ngoài trời' : 'Trong nhà'))}</span>
            </div>
            {speechMessage && <p className="inline-feedback" role="status">{speechMessage}</p>}
            <div className="journey-progress"><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Tiến độ hành trình"><span style={{ transform: `scaleX(${progress / 100})` }} /></div><span>{step}/{travelSteps.length} chặng đã xác nhận</span></div>
            {arrived ? (
              <div className="arrival-actions"><Link to="/" className="button button-primary">Về bản đồ<ArrowRight size={19} /></Link>{toPlace && <SaveButton place={toPlace} />}</div>
            ) : (
              <><button className="button button-primary full-width" onClick={() => goStep(step + 1)}>Đã xong chặng này<Check size={19} /></button><div className="journey-controls"><button disabled={step === 0} onClick={() => goStep(step - 1)}><ChevronLeft size={18} />Chặng trước</button><Link to={link(`/vi-tri?to=${rawTo}`)}><RotateCcw size={16} />Đổi điểm xuất phát</Link></div></>
            )}
          </section>
          <aside className="journey-timeline">
            <div className="section-heading"><h2>Hành trình của bạn</h2><Footprints size={21} /></div>
            <p>Bạn xác nhận sau mỗi chặng.</p>
            <ol className="timeline">
              <li className={step > 0 ? 'complete' : 'current'}><span className="timeline-marker">{step > 0 ? <Check size={15} /> : <Navigation2 size={15} />}</span><div><strong>{startDisplay}</strong><small>Điểm xuất phát</small></div></li>
              {travelSteps.map((s, idx) => {
                const itemIdx = idx + 1
                return <li key={`${s.target.node}-${idx}`} className={itemIdx < step ? 'complete' : itemIdx === step ? 'current' : ''}><span className="timeline-marker">{itemIdx < step ? <Check size={15} /> : itemIdx === step ? <Navigation2 size={15} /> : itemIdx}</span><div><strong>{s.target.label || s.text}</strong><small>{s.meters > 0 ? `${Math.round(s.meters)} m` : s.kind === 'door' ? 'Qua cửa' : 'Chặng đi bộ'}</small></div></li>
              })}
            </ol>
            <p className="timeline-note">Tuyến đường được tính từ đồ thị VinUni Wayfinder.</p>
          </aside>
        </div>
        <div className="journey-top">
          <button className="back-link" onClick={() => setShowExit(true)}><X size={19} />Kết thúc</button>
          <span>{liveRoute.totalMeters > 0 ? `Tổng ${liveRoute.totalMeters} m` : 'VinUni Wayfinder'}</span>
          {speechAvailable && <IconButton label={speaking ? 'Dừng giọng đọc' : 'Đọc chỉ dẫn'} onClick={() => speakText(curStep?.text ?? arrivalStep?.text ?? `Bạn đã tới ${liveRoute.destination}.`)} pressed={speaking}>{speaking ? <VolumeX size={21} /> : <Volume2 size={21} />}</IconButton>}
        </div>
        {exitDialog}
      </div>
    )
  }

  const from = fromPlace
  const to = toPlace
  const route = from && to ? findRoute(from.id, to.id) : null
  const step = route ? Math.min(Math.max(Number.isFinite(stepParam) ? Math.floor(stepParam) : 0, 0), route.length) : 0
  if (!from || !to || !route) return <NotFound title="Chưa có hành trình này" description="Chọn lại điểm xuất phát và điểm đến để bắt đầu." />
  const arrived = step === route.length
  const edge = route[step]
  const Direction = edge ? turnIcons[edge.turn] : Check
  const current = getPlace(step === 0 ? from.id : route[step - 1].to)!
  const progress = route.length ? Math.round((step / route.length) * 100) : 100

  if (arrived && welcome && mode === 'card') return cardWelcome
  if (mode === 'camera' && (!arrived || welcome)) return <><JourneyCamera {...cameraControls} welcome={arrived && welcome} live={false}
    destination={to.name} step={step} direction={edge ? turnLabels[edge.turn] : stepDirLabels.arrive} icon={Direction}
    mood={!edge || edge.turn === 'straight' ? 'walk' : edge.turn} instruction={edge?.instruction ?? ''}
    waypoints={route.map(e => ({ label: getPlace(e.to)?.name || e.to }))} />{exitDialog}</>

  return (
    <div className="focused-page journey-page">
      {!arrived && modeButton}
      <EventJourneyBadge />
      <div className="active-journey-layout">
        <section className="active-direction" aria-live="polite">
          <div className="direction-heading"><h1 tabIndex={-1}>{arrived ? 'Tới nơi rồi!' : to.name}</h1><p>{arrived ? 'Bạn vừa hoàn thành hành trình mẫu.' : `Chặng ${step + 1} trong ${route.length} chặng`}</p></div>
          <div className={`direction-stage ${arrived ? 'arrived' : ''}`}><div className="journey-companion"><Mascot mood={arrived ? 'jump' : edge.turn === 'left' ? 'left' : edge.turn === 'right' ? 'right' : 'walk'} size={122} /><span className="companion-arrow"><Direction size={50} strokeWidth={1.5} aria-hidden="true" /></span></div><h2>{arrived ? to.name : turnLabels[edge.turn]}</h2><p>{arrived ? 'Đối chiếu biển tên trước khi vào phòng.' : edge.instruction}</p><span className="direction-location"><MapPin size={15} />{arrived ? 'Toà I, tầng trệt' : `Từ ${current.short}`}</span></div>
          {speechMessage && <p className="inline-feedback" role="status">{speechMessage}</p>}
          <div className="journey-progress"><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Tiến độ hành trình"><span style={{ transform: `scaleX(${progress / 100})` }} /></div><span>{step}/{route.length} chặng đã xác nhận</span></div>
          {arrived ? (
            <div className="arrival-actions"><Link to="/" className="button button-primary">Về bản đồ<ArrowRight size={19} /></Link><SaveButton place={to} /></div>
          ) : <><button className="button button-primary full-width" onClick={() => goStep(step + 1)}>Đã tới {getPlace(edge.to)?.short}<Check size={19} /></button><div className="journey-controls"><button disabled={step === 0} onClick={() => goStep(step - 1)}><ChevronLeft size={18} />Chặng trước</button><Link to={link(`/vi-tri?to=${to.id}`)}><RotateCcw size={16} />Đổi điểm xuất phát</Link></div></>}
          <DemoNote compact />
        </section>
        <aside className="journey-timeline"><div className="section-heading"><h2>Hành trình của bạn</h2><Footprints size={21} /></div><p>Bạn xác nhận sau mỗi chặng.</p><ol className="timeline">{[from, ...route.map(e => getPlace(e.to)!)].map((place, index) => <li key={place.id} className={index < step ? 'complete' : index === step ? 'current' : ''}><span className="timeline-marker">{index < step ? <Check size={15} /> : index === step ? <Navigation2 size={15} /> : index}</span><div><strong>{place.name}</strong><small>{index === step ? arrived ? 'Đã tới nơi' : 'Mốc đã xác nhận' : index === 0 ? 'Điểm xuất phát' : index === route.length ? 'Điểm đến' : 'Điểm đi qua'}</small></div></li>)}</ol><p className="timeline-note">Tuyến mẫu không theo dõi vị trí trực tiếp.</p></aside>
      </div>
      <div className="journey-top">
        <button className="back-link" onClick={() => setShowExit(true)}><X size={19} />Kết thúc</button>
        <span>Tuyến minh hoạ</span>
        {speechAvailable && <IconButton label={speaking ? 'Dừng giọng đọc' : 'Đọc chỉ dẫn'} onClick={() => speakText(edge?.instruction ?? `Bạn đã tới ${to.name}.`)} pressed={speaking}>{speaking ? <VolumeX size={21} /> : <Volume2 size={21} />}</IconButton>}
      </div>
      {exitDialog}
    </div>
  )
}
