import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Camera, Download, Footprints, Hand, LocateFixed, MessageCircle, Music2, RefreshCw, ScanLine, Send, SlidersHorizontal, SwitchCamera, X } from 'lucide-react'
import { MotionContext } from '../mascot/Mascot'
import { isAnchor, type CampusEvent, type EventAnchor, type MascotAsset } from './events'
import EventVoice from './EventVoice'
import { ApiError, prepPhotoBlob, wayfinderApi } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import { matchesIndoorVenue } from './indoorEncounter'
import { createEncounterStage, toggleEncounterMotion, type EncounterMotion } from './encounterStage'
import {
  canCaptureEncounter,
  encounterCameraHint,
  initialEncounterPhase,
  isFootVisible,
  toggleCameraPanel,
  type CameraPanel,
  type CameraStatus,
  type EncounterPhase,
} from './encounterControls'
import { useGroundAnchor } from './useGroundAnchor'
import { dataUrlToBlob, savePhoto } from './photoSave'
import { ArMascotButton } from './ArMascot'
import { requestSensorPermission } from '../../shared/lib/sensors.js'
import { assessEncounterLocation, captureEncounterPhoto, encounterAccuracy, encounterRadius, submitEncounterPhoto } from './eventEncounterMedia'
import './eventEncounter.css'

type EncounterProps = {
  event: CampusEvent; mascot: MascotAsset; anchor: EventAnchor | null
  /** Đã tới nơi theo tuyến dẫn đường: mở khoá sẵn check-in một chạm mà không cần kiểm tra GPS lại. */
  arrived?: boolean
  /** Thông báo khi trải nghiệm check-in/AR cần dùng phần cứng camera để camera dẫn đường nhường trước. */
  onCameraActiveChange?: (active: boolean) => void
}

export default function EventEncounter(props: EncounterProps) {
  return <Encounter key={JSON.stringify([props.event.id, props.event.demo, props.event.locationId, props.mascot.id, props.anchor?.lat, props.anchor?.lon])} {...props} />
}

function Encounter({ event, mascot, anchor, arrived = false, onCameraActiveChange }: EncounterProps) {
  const { isLive, health } = useWayfinder()
  const [mockEnabled, setMockEnabled] = useState(event.demo === true)
  // Offset toward the equator to keep the demo fix valid even at the poles.
  const mockFix = mockEnabled && isAnchor(anchor) ? assessEncounterLocation(anchor, {
    latitude: anchor.lat + (anchor.lat > 0 ? -1 : 1) * 20 / 111195,
    longitude: anchor.lon, accuracy: 5,
  }) : null
  const demoNearby = mockFix?.status === 'near'
  const atVenue = arrived || demoNearby
  const [phase, setPhase] = useState<EncounterPhase>(() => initialEncounterPhase({ arrived, demoNearby }))
  const [checking, setChecking] = useState<'gps' | 'photo' | null>(null)
  const indoorRequest = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [photo, setPhoto] = useState<{ src: string; filename: string } | null>(null)
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const checkedAt = useRef(0)
  const request = useRef(0)
  const submitting = useRef(false)
  const cameraActiveCallback = useRef(onCameraActiveChange)
  cameraActiveCallback.current = onCameraActiveChange
  useEffect(() => () => {
    request.current++
    indoorRequest.current?.abort()
    cameraActiveCallback.current?.(false)
  }, [])

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
    // iOS chỉ cho xin quyền con quay trong lần chạm này; cần để mascot đứng trên mặt sàn.
    void requestSensorPermission().catch(() => {})
    if (!atVenue && Date.now() - checkedAt.current > 60000) {
      setPhase('entry')
      setMessage('Hãy xác nhận lại vị trí trước khi mở camera.')
      return
    }
    setMessage('')
    setPhoto(null)
    setConsent(false)
    onCameraActiveChange?.(true)
    setPhase('camera')
  }
  function exitCamera() {
    setPhoto(null)
    setConsent(false)
    setMessage('')
    onCameraActiveChange?.(false)
    setPhase(atVenue ? 'unlocked' : 'entry')
  }
  function reviewPhoto(src: string) {
    const filename = `wayfinder-${event.id}-${Date.now()}.jpg`
    setPhoto({ src, filename })
    setConsent(false)
    setMessage('')
    setPhase('review')
    // Gọi ngay trong lần chạm nút chụp: Safari chỉ cho mở bảng chia sẻ khi còn "user activation".
    void saveToPhone(src, filename)
  }
  async function saveToPhone(src: string, filename: string) {
    try {
      const result = await savePhoto(dataUrlToBlob(src), filename)
      setMessage(result === 'shared' ? 'Đã mở bảng chia sẻ. Chọn “Lưu hình ảnh” để lưu vào Ảnh.'
        : result === 'downloaded' ? 'Ảnh đã tải về máy (thư mục Tải xuống).' : 'Chưa lưu. Bấm “Lưu vào Ảnh” khi bạn muốn lưu.')
    } catch { setMessage('Chưa lưu được ảnh. Hãy bấm “Lưu vào Ảnh” để thử lại.') }
  }
  async function submit() {
    if (submitting.current || !consent || !photo) return
    submitting.current = true
    setSending(true)
    setMessage('')
    try {
      await submitEncounterPhoto(event.id, photo.src, consent)
      setPhoto(null)
      onCameraActiveChange?.(false)
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
    {demoNearby && !arrived && <p>GPS mô phỏng · Bạn đang cách điểm gặp {mockFix.meters} m.</p>}
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
    {phase === 'unlocked' && <div className="encounter-actions">
      <button type="button" className="button button-primary" onClick={openCamera}><Camera size={17}/>{arrived ? `Chụp ảnh check-in cùng ${mascot.name}` : 'Mở camera AR'}</button>
      <ArMascotButton mascot={mascot} onActiveChange={onCameraActiveChange} />
    </div>}
    {(phase === 'camera' || phase === 'review') && <PhotoDialog onClose={exitCamera} busy={sending}>
      {phase === 'camera' && <EncounterCamera eventId={event.id} mascot={mascot} onClose={exitCamera} onCapture={reviewPhoto} />}
      {phase === 'review' && photo && <div className="encounter-review">
        <div className="encounter-review-heading"><h2>Ảnh cùng {mascot.name}</h2>
          <button type="button" aria-label="Đóng ảnh" disabled={sending} onClick={exitCamera}><X /></button></div>
        <img className="encounter-preview" src={photo.src} alt={`Ảnh vừa chụp cùng ${mascot.name}`}/>
        <div className="encounter-review-actions">
          <div className="encounter-actions">
            <button type="button" className="button button-primary" onClick={() => void saveToPhone(photo.src, photo.filename)}><Download size={17}/>Lưu vào Ảnh</button>
            <button type="button" className="button button-quiet" disabled={sending} onClick={openCamera}><RefreshCw size={16}/>Chụp lại</button>
          </div>
          <p>iPhone: chọn “Lưu hình ảnh” trong bảng chia sẻ để ảnh vào app Ảnh. Android: chọn Ảnh hoặc Lưu.</p>
          <label className="encounter-consent"><input type="checkbox" checked={consent} disabled={sending} onChange={e => setConsent(e.target.checked)}/>
            Tôi đồng ý gửi ảnh này cho {event.club} để BTC duyệt và đăng vào album công khai của sự kiện.</label>
          <button type="button" className="button button-quiet" disabled={!consent || sending} onClick={() => void submit()}><Send size={16}/>{sending ? 'Đang gửi…' : 'Gửi ảnh cho CLB'}</button>
          {message && <p role="status">{message}</p>}
        </div>
      </div>}
    </PhotoDialog>}
    {phase === 'sent' && <><p role="status">Đã gửi ảnh cho {event.club} chờ duyệt.</p>
      <div className="encounter-actions">
        <button className="button button-quiet" type="button" onClick={openCamera}><Camera size={16}/>Chụp ảnh khác</button>
        <ArMascotButton mascot={mascot} onActiveChange={onCameraActiveChange} />
      </div></>}
    {phase !== 'review' && message && <p role="status">{message}</p>}
  </section>
}

function PhotoDialog({ children, onClose, busy }: { children: ReactNode; onClose: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="encounter-dialog" aria-label="Chụp ảnh cùng mascot"
    onCancel={e => { e.preventDefault(); if (!busy) onClose() }}>{children}</dialog>
}

type CameraProps = { eventId: string; mascot: MascotAsset; onClose: () => void; onCapture: (image: string) => void }

function EncounterCamera({ eventId, mascot, onClose, onCapture }: CameraProps) {
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const stage = useRef<ReturnType<typeof createEncounterStage> | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [selfie, setSelfie] = useState(false)
  const [status, setStatus] = useState<CameraStatus>('loading')
  const [placed, setPlaced] = useState(false)
  const [canWalk, setCanWalk] = useState(false)
  const [panel, setPanel] = useState<CameraPanel>('none')
  const [loopMotion, setLoopMotion] = useState<'walk' | null>(null)
  const [error, setError] = useState('')
  const { paused } = useContext(MotionContext)
  const animatingSpeech = useRef(false)
  const groundZoom = useRef(1)
  const userZoom = useRef(1)
  const ground = useGroundAnchor({
    enabled: status === 'ready' && !selfie,
    viewport: () => overlay.current ? { width: overlay.current.clientWidth, height: overlay.current.clientHeight } : null,
    onFoot: foot => {
      const s = stage.current
      if (!s) return
      if (!isFootVisible(foot)) {
        s.hide()
        setPlaced(false)
        return
      }
      groundZoom.current = foot.zoom
      s.place(foot.x, foot.y)
      s.setZoom(userZoom.current * foot.zoom)
      setPlaced(true)
    },
  })
  const onSpeakingChange = useCallback((speaking: boolean) => {
    if (speaking && !paused) {
      setLoopMotion(null)
      animatingSpeech.current = true
      stage.current?.play('talk')
    } else if (animatingSpeech.current) {
      animatingSpeech.current = false
      stage.current?.play(null)
    }
  }, [paused])
  useEffect(() => {
    stage.current?.setIdle(!paused)
    if (paused) {
      setLoopMotion(null)
      stage.current?.play(null)
    }
  }, [paused, status])

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
      setPlaced(false)
      setCanWalk(false)
      setPanel('none')
      setLoopMotion(null)
      animatingSpeech.current = false
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
      setCanWalk(false)
      setPanel('none')
      setLoopMotion(null)
      animatingSpeech.current = false
      groundZoom.current = 1
      setError('')
      if (!navigator.mediaDevices?.getUserMedia) { fail('Camera cần HTTPS hoặc localhost và trình duyệt hỗ trợ camera.'); return }
      let frontCamera = false
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 } } })
        if (cancelled) { media.getTracks().forEach(track => track.stop()); return }
        stream = media
        const track = media.getVideoTracks()[0]
        track?.addEventListener('ended', ended)
        frontCamera = (track?.getSettings().facingMode || facing) === 'user'
        setSelfie(frontCamera)
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
        setCanWalk(stage.current.hasMotion('walk'))
        // Camera trước (selfie) không có mặt sàn để neo: đứng cố định góc dưới phải.
        if (frontCamera) {
          stage.current.place(.72, .9)
          stage.current.setZoom(userZoom.current)
          setPlaced(true)
        }
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
    userZoom.current = zoomPercent / 100
    if (status === 'ready') stage.current?.setZoom(userZoom.current * groundZoom.current)
  }, [zoomPercent, status])

  const canCapture = canCaptureEncounter(status, placed)
  const hint = encounterCameraHint({ status, error, selfie, placed, groundStatus: ground.status, mascotName: mascot.name })

  function place(px: number, py: number) {
    if (status !== 'ready') return
    ground.markManualPlacement()
    groundZoom.current = 1
    stage.current?.place(px, py)
    stage.current?.setZoom(userZoom.current)
    setPlaced(true)
  }
  function capture() {
    if (!stage.current || !overlay.current || !video.current || !canCapture) return
    try {
      stage.current.render()
      onCapture(captureEncounterPhoto(video.current, overlay.current, selfie))
    } catch { setError('Chưa chụp được khung hình. Hãy đợi camera sẵn sàng rồi thử lại.') }
  }
  function play(motion: EncounterMotion) {
    animatingSpeech.current = false
    const { nextLoop, play: target } = toggleEncounterMotion(loopMotion, motion)
    setLoopMotion(nextLoop)
    stage.current?.play(target)
  }
  return <div className="encounter-camera">
    <div className="encounter-viewport">
      <video ref={video} muted playsInline aria-label="Hình ảnh trực tiếp từ camera" className={selfie ? 'mirrored' : ''} />
      <canvas key={facing} ref={overlay} aria-hidden="true" />
      {status === 'ready' && <button type="button" className="encounter-placement" aria-label={`Đặt ${mascot.name} trong khung hình`}
        onClick={e => {
          if (!e.detail) { place(.72, .88); return }
          const rect = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height
          if (!ground.reanchor(x, y)) place(x, y)
        }}/>}
    </div>
    <div className="encounter-top">
      <button type="button" className="camera-control" onClick={onClose} aria-label="Đóng camera"><X /></button>
      <button type="button" className="camera-control" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')} aria-label="Đổi camera"><SwitchCamera /></button>
    </div>
    {hint && (hint.action === 'grant'
      ? <button type="button" className="encounter-hint encounter-grant" onClick={() => void ground.grant()}>{hint.text}</button>
      : <p className="encounter-hint" role={hint.role}>{hint.text}</p>)}
    {panel === 'voice' && status === 'ready' && <div className="encounter-tools">
      <EventVoice eventId={eventId} onSpeakingChange={onSpeakingChange} />
    </div>}
    {panel === 'tools' && status === 'ready' && <div className="encounter-tools">
      <label className="encounter-size">Kích thước mascot <span aria-hidden="true">{zoomPercent}%</span>
        <input type="range" min={60} max={140} step={10} value={zoomPercent} aria-valuetext={zoomPercent + '%'}
          onChange={e => setZoomPercent(e.currentTarget.valueAsNumber)} />
      </label>
      <div className="encounter-actions">
        {canWalk && <button type="button" className="button button-quiet" aria-pressed={loopMotion === 'walk'} disabled={paused} onClick={() => play('walk')}><Footprints size={16}/>Đi bộ</button>}
        <button type="button" className="button button-quiet" disabled={paused} onClick={() => play('wave')}><Hand size={16}/>Vẫy tay</button>
        <button type="button" className="button button-quiet" disabled={paused} onClick={() => play('jump')}><ArrowUp size={16}/>Nhảy</button>
        <button type="button" className="button button-quiet" disabled={paused} onClick={() => play('dance')}><Music2 size={16}/>Nhảy múa</button>
      </div>
    </div>}
    <div className="encounter-bottom">
      <button type="button" className="camera-control encounter-talk" aria-expanded={panel === 'voice'}
        disabled={status !== 'ready'} onClick={() => { setLoopMotion(null); setPanel(current => toggleCameraPanel(current, 'voice')) }}>
        <MessageCircle size={18} aria-hidden="true" /><span>Nói chuyện</span>
      </button>
      <button type="button" className="encounter-shutter" aria-label={`Chụp ảnh cùng ${mascot.name}`}
        disabled={!canCapture} onClick={capture}><Camera size={26}/></button>
      <button type="button" className="camera-control encounter-adjust" aria-label="Tùy chỉnh mascot" aria-expanded={panel === 'tools'}
        disabled={status !== 'ready'} onClick={() => setPanel(current => toggleCameraPanel(current, 'tools'))}><SlidersHorizontal /></button>
    </div>
  </div>
}
