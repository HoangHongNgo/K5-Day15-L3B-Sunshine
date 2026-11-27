import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ArrowUp, Camera, Hand, LocateFixed, MessageCircle, Music2, RefreshCw, ScanLine, Send, SwitchCamera, X } from 'lucide-react'
import { MotionContext } from '../mascot/Mascot'
import { isAnchor, type CampusEvent, type EventAnchor, type MascotAsset } from './events'
import EventVoice from './EventVoice'
import { ApiError, prepPhotoBlob, wayfinderApi } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import { matchesIndoorVenue } from './indoorEncounter'
import { createEncounterStage, type EncounterMotion } from './encounterStage'
import { assessEncounterLocation, captureEncounterPhoto, encounterAccuracy, encounterRadius, submitEncounterPhoto } from './eventEncounterMedia'
import './eventEncounter.css'

type EncounterProps = { event: CampusEvent; mascot: MascotAsset; anchor: EventAnchor | null }

export default function EventEncounter(props: EncounterProps) {
  return <Encounter key={JSON.stringify([props.event.id, props.event.demo, props.event.locationId, props.mascot.id, props.anchor?.lat, props.anchor?.lon])} {...props} />
}

function Encounter({ event, mascot, anchor }: EncounterProps) {
  const { isLive, health } = useWayfinder()
  const [mockEnabled, setMockEnabled] = useState(event.demo === true)
  // Offset toward the equator to keep the demo fix valid even at the poles.
  const mockFix = mockEnabled && isAnchor(anchor) ? assessEncounterLocation(anchor, {
    latitude: anchor.lat + (anchor.lat > 0 ? -1 : 1) * 20 / 111195,
    longitude: anchor.lon, accuracy: 5,
  }) : null
  const demoNearby = mockFix?.status === 'near'
  const [phase, setPhase] = useState<'entry' | 'unlocked' | 'camera' | 'review' | 'sent'>(demoNearby ? 'unlocked' : 'entry')
  const [checking, setChecking] = useState<'gps' | 'photo' | null>(null)
  const indoorRequest = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [photo, setPhoto] = useState('')
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const checkedAt = useRef(0)
  const request = useRef(0)
  const submitting = useRef(false)
  useEffect(() => () => { request.current++; indoorRequest.current?.abort() }, [])

  async function checkIndoor(file: File) {
    if (file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Chọn ảnh JPG, PNG hoặc WebP tối đa 10 MB.')
      return
    }
    indoorRequest.current?.abort()
    const ctrl = new AbortController()
    indoorRequest.current = ctrl
    setChecking('photo')
    setMessage('')
    try {
      const photo = await prepPhotoBlob(file, 512)
      if (ctrl.signal.aborted) return
      const result = await wayfinderApi.locate(photo, undefined, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (matchesIndoorVenue(event.locationId, result)) {
        checkedAt.current = Date.now()
        setPhase('unlocked')
        setMessage('Đã nhận diện khu vực tổ chức sự kiện qua ảnh.')
      } else {
        setMessage(result.tier === 'auto' ? 'Ảnh chưa khớp địa điểm sự kiện. Hãy chụp tại cửa phòng tổ chức.' :
          'Chưa nhận ra vị trí đủ chắc chắn. Hãy chụp lại biển phòng và khu vực xung quanh.')
      }
    } catch (err) {
      if (!ctrl.signal.aborted) setMessage(err instanceof ApiError && err.code === 'no_index'
        ? 'Wayfinder chưa có ảnh tham chiếu cho định vị trong nhà.' : 'Chưa định vị được qua ảnh. Hãy thử lại.')
    } finally {
      if (!ctrl.signal.aborted) setChecking(null)
    }
  }

  function checkPosition() {
    if (!navigator.geolocation) { setMessage('Thiết bị chưa hỗ trợ GPS. Hãy mở trang trên điện thoại có định vị.'); return }
    setPhase('entry')
    setChecking('gps')
    setMessage('')
    const id = ++request.current
    navigator.geolocation.getCurrentPosition(position => {
      if (id !== request.current) return
      setChecking(null)
      const result = assessEncounterLocation(anchor, position.coords)
      if (result.status === 'near') {
        checkedAt.current = Date.now()
        setPhase('unlocked')
        setMessage('Bạn đã đến điểm gặp mascot.')
      } else if (result.status === 'far') {
        setMessage(`Bạn cách điểm gặp khoảng ${result.meters} m. Hãy đến trong bán kính ${encounterRadius} m rồi kiểm tra lại.`)
      } else {
        setMessage(`Tín hiệu GPS chưa đủ chính xác. Hãy thử gần cửa sổ hoặc ngoài trời, với sai số tối đa ${encounterAccuracy} m.`)
      }
    }, error => {
      if (id !== request.current) return
      setChecking(null)
      setMessage(error.code === 1 ? 'Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí cho trang này rồi thử lại.' :
        'Chưa lấy được tín hiệu GPS. Hãy kiểm tra định vị trên điện thoại rồi thử lại.')
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  }
  function openCamera() {
    if (!demoNearby && Date.now() - checkedAt.current > 60000) {
      setPhase('entry')
      setMessage('Hãy xác nhận lại vị trí trước khi mở camera.')
      return
    }
    setMessage('')
    setPhoto('')
    setConsent(false)
    setPhase('camera')
  }
  function exitCamera() {
    setMessage('')
    setPhase(demoNearby ? 'unlocked' : 'entry')
  }
  async function submit() {
    if (submitting.current || !consent || !photo) return
    submitting.current = true
    setSending(true)
    setMessage('')
    try {
      await submitEncounterPhoto(event.id, photo, consent)
      setPhoto('')
      setPhase('sent')
    } catch (reason) {
      setMessage(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : 'Chưa kết nối được máy chủ. Ảnh vẫn ở đây để bạn thử lại.')
    }
    finally { submitting.current = false; setSending(false) }
  }
  return <section className="event-encounter" aria-label="Gặp mascot tại sự kiện">
    <header className="encounter-heading"><span className="encounter-heading-icon"><ScanLine size={23}/></span>
      <div><h2>Gặp {mascot.name} trong AR</h2><p>{event.title}</p></div>
    </header>
    {demoNearby && <p>GPS mô phỏng · Bạn đang cách điểm gặp {mockFix.meters} m.</p>}
    {phase === 'entry' && (isAnchor(anchor) ? <>
      <p>Đến trong bán kính {encounterRadius} m quanh điểm sự kiện để đặt {mascot.name} vào khung hình và chụp ảnh cùng nhau. Vị trí được kiểm tra trên thiết bị.</p>
      <button type="button" className="button button-primary" disabled={!!checking} onClick={checkPosition}>
        <LocateFixed size={17}/>{checking === 'gps' ? 'Đang kiểm tra GPS…' : 'Kiểm tra vị trí'}
      </button>
      {import.meta.env.DEV && <button type="button" className="button button-quiet" disabled={!!checking}
        onClick={() => { setMockEnabled(true); setMessage(''); setPhase('unlocked') }}>Dùng vị trí mô phỏng</button>}
    </> : <p>Địa điểm này chưa có tọa độ GPS.</p>)}
    {phase === 'entry' && isLive && (health?.indexSize === 0
      ? <p>Định vị trong nhà cần ảnh tham chiếu. Máy chủ này chưa có dữ liệu ảnh.</p>
      : <div>
        <p>Trong nhà, bạn có thể gửi ảnh biển phòng và khu vực cửa cho Wayfinder để nhận diện địa điểm.</p>
        <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment"
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void checkIndoor(file) }} />
        <button type="button" className="button button-quiet" disabled={!!checking} onClick={() => fileInput.current?.click()}>
          <Camera size={17}/>{checking === 'photo' ? 'Đang nhận diện địa điểm…' : 'Định vị trong nhà bằng ảnh'}
        </button>
      </div>)}
    {phase === 'unlocked' && <button type="button" className="button button-primary" onClick={openCamera}><Camera size={17}/>Mở camera AR</button>}
    {phase === 'camera' && <EncounterCamera eventId={event.id} mascot={mascot} onClose={exitCamera}
      onCapture={image => { setPhoto(image); setConsent(false); setMessage(''); setPhase('review') }} />}
    {phase === 'review' && <>
      <img className="encounter-preview" src={photo} alt={`Ảnh vừa chụp cùng ${mascot.name}`}/>
      <label className="encounter-consent"><input type="checkbox" checked={consent} disabled={sending} onChange={e => setConsent(e.target.checked)}/>
        Tôi đồng ý gửi ảnh này cho {event.club}. CLB có thể duyệt và hiển thị ảnh trong album công khai của sự kiện.</label>
      <div className="encounter-actions">
        <button type="button" className="button button-primary" disabled={!consent || sending} onClick={() => void submit()}><Send size={16}/>{sending ? 'Đang gửi…' : 'Gửi ảnh cho CLB'}</button>
        <button type="button" className="button button-quiet" disabled={sending} onClick={openCamera}><RefreshCw size={16}/>Chụp lại</button>
        <button type="button" className="button button-quiet" disabled={sending} onClick={() => { setPhoto(''); setConsent(false); exitCamera() }}>Bỏ ảnh</button>
      </div>
    </>}
    {phase === 'sent' && <><p role="status">Đã gửi ảnh cho {event.club} chờ duyệt.</p>
      <button className="button button-quiet" type="button" onClick={openCamera}><Camera size={16}/>Chụp ảnh khác</button></>}
    {message && <p role="status">{message}</p>}
  </section>
}

type CameraProps = { eventId: string; mascot: MascotAsset; onClose: () => void; onCapture: (image: string) => void }

function EncounterCamera({ eventId, mascot, onClose, onCapture }: CameraProps) {
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const stage = useRef<ReturnType<typeof createEncounterStage> | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [selfie, setSelfie] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [placed, setPlaced] = useState(false)
  const [talk, setTalk] = useState(false)
  const [error, setError] = useState('')
  const { paused } = useContext(MotionContext)
  const animatingSpeech = useRef(false)
  const onSpeakingChange = useCallback((speaking: boolean) => {
    if (speaking && !paused) {
      animatingSpeech.current = true
      stage.current?.play('talk')
    } else if (animatingSpeech.current) {
      animatingSpeech.current = false
      stage.current?.play(null)
    }
  }, [paused])
  useEffect(() => { if (paused) stage.current?.play(null) }, [paused])

  useEffect(() => {
    const player = video.current!, canvas = overlay.current!
    let cancelled = false
    let stream: MediaStream | undefined
    function release() {
      stream?.getTracks().forEach(track => track.stop())
      player.srcObject = null
      if (stage.current) { stage.current.dispose(); stage.current = null }
    }
    function fail(message: string) {
      if (cancelled) return
      release()
      setStatus('failed')
      setTalk(false)
      setError(message)
    }
    const lost = (e: Event) => {
      e.preventDefault()
      fail('Đã mất kết nối với bộ dựng hình 3D. Hãy đóng camera và mở lại.')
    }
    const ended = () => fail('Camera đã ngắt kết nối. Hãy đổi camera hoặc đóng và mở lại.')
    async function start() {
      setStatus('loading')
      setPlaced(false)
      setTalk(false)
      setError('')
      if (!navigator.mediaDevices?.getUserMedia) { fail('Camera cần HTTPS hoặc localhost và trình duyệt hỗ trợ camera.'); return }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 } } })
        if (cancelled) { media.getTracks().forEach(track => track.stop()); return }
        stream = media
        const track = media.getVideoTracks()[0]
        track?.addEventListener('ended', ended)
        setSelfie((track?.getSettings().facingMode || facing) === 'user')
        player.srcObject = media
        await player.play()
        if (cancelled || !track || track.readyState === 'ended') { if (!cancelled) ended(); return }
      } catch (reason) {
        fail(reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? 'Bạn chưa cấp quyền camera. Hãy bật quyền trong trình duyệt rồi mở lại camera.'
          : 'Chưa mở được camera. Hãy kiểm tra camera trên thiết bị rồi thử lại.')
        return
      }
      try {
        stage.current = createEncounterStage(canvas, mascot)
        canvas.addEventListener('webglcontextlost', lost)
        setStatus('ready')
      } catch { fail('Trình duyệt chưa dựng được mascot 3D. Hãy thử thiết bị hỗ trợ WebGL 2.') }
    }
    // React StrictMode can cancel the first mount before a permission request is needed.
    void Promise.resolve().then(() => { if (!cancelled) return start() })
    return () => {
      cancelled = true
      canvas.removeEventListener('webglcontextlost', lost)
      stream?.getVideoTracks()[0]?.removeEventListener('ended', ended)
      release()
    }
  }, [facing, mascot])
  useEffect(() => {
    if (status === 'ready') stage.current?.setZoom(zoomPercent / 100)
  }, [zoomPercent, status])

  function place(px: number, py: number) {
    if (status !== 'ready') return
    stage.current?.place(px, py)
    setPlaced(true)
  }
  function capture() {
    if (!stage.current || !overlay.current || !video.current || !placed) return
    try {
      stage.current.render()
      onCapture(captureEncounterPhoto(video.current, overlay.current, selfie))
    } catch { setError('Chưa chụp được khung hình. Hãy đợi camera sẵn sàng rồi thử lại.') }
  }
  function play(motion: EncounterMotion) {
    animatingSpeech.current = false
    setTalk(false)
    stage.current?.play(motion)
  }
  return <div className="encounter-camera">
    <div className="encounter-viewport">
      <video ref={video} muted playsInline aria-label="Hình ảnh trực tiếp từ camera" className={selfie ? 'mirrored' : ''} />
      <canvas key={facing} ref={overlay} aria-hidden="true" />
      {status === 'ready' && <button type="button" className="encounter-placement" aria-label={`Đặt ${mascot.name} trong khung hình`}
        onClick={e => {
          if (!e.detail) { place(.5, .78); return }
          const rect = e.currentTarget.getBoundingClientRect()
          place((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
        }}/>}
      {status !== 'failed' && (!placed || status === 'loading') &&
        <span className="encounter-hint">{status === 'loading' ? 'Đang mở camera…' : 'Chạm vào khung hình để đặt mascot'}</span>}
    </div>
    <div className="encounter-actions">
      <button type="button" className="button button-quiet" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}><SwitchCamera size={16}/>Đổi camera</button>
      <button type="button" className="button button-quiet" onClick={onClose}><X size={16}/>Đóng camera</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {placed && status === 'ready' && <>
      <label className="encounter-size">Kích thước mascot <span aria-hidden="true">{zoomPercent}%</span>
        <input type="range" min={60} max={140} step={10} value={zoomPercent} aria-valuetext={zoomPercent + '%'}
          onChange={e => setZoomPercent(e.currentTarget.valueAsNumber)} />
      </label>
      <div className="encounter-actions">
        <button type="button" className="button button-quiet" aria-expanded={talk} onClick={() => setTalk(!talk)}><MessageCircle size={16}/>Nói chuyện</button>
        <button type="button" className="button button-quiet" disabled={paused} onClick={() => play('wave')}><Hand size={16}/>Vẫy tay</button>
        <button type="button" className="button button-quiet" disabled={paused} onClick={() => play('jump')}><ArrowUp size={16}/>Nhảy</button>
        <button type="button" className="button button-quiet" disabled={paused} onClick={() => play('dance')}><Music2 size={16}/>Nhảy múa</button>
      </div>
      {talk && <EventVoice eventId={eventId} onSpeakingChange={onSpeakingChange}/>}
      <button type="button" className="button button-primary" onClick={capture}><Camera size={17}/>Chụp ảnh cùng {mascot.name}</button>
    </>}
  </div>
}
