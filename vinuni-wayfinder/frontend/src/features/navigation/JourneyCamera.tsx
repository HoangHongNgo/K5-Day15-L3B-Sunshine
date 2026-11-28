import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronUp, Flag, LocateFixed, MapPin, type LucideIcon } from 'lucide-react'
import { Mascot, type MascotMood } from '../mascot/Mascot'
import { wayfinderApi } from '../wayfinder/wayfinderApi'
import { JourneyModeButton, type JourneyMode } from './JourneyModeButton'
import './journeyCamera.css'

type Waypoint = { label: string; meters?: number; approx?: boolean }

type Props = {
  welcome?: ReactNode
  destination: string
  waypoints: Waypoint[]
  step: number
  instruction: string
  direction: string
  icon: LucideIcon
  mood: MascotMood
  live: boolean
  onMode: (mode: JourneyMode) => void
  onStep: (step: number) => void
  onExit: () => void
}

export function JourneyCamera({ welcome, destination, waypoints, step, instruction, direction, icon: Icon, mood, live, onMode, onStep, onExit }: Props) {
  const player = useRef<HTMLVideoElement>(null)
  const locating = useRef<AbortController | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [cameraStatus, setCameraStatus] = useState('Đang mở camera…')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const waypoint = waypoints[step]
  const next = waypoints[step + 1]

  useEffect(() => {
    const video = player.current!
    let request = 0
    let stream: MediaStream | undefined
    function release() {
      request++
      stream?.getTracks().forEach(track => track.stop())
      stream = undefined
      video.srcObject = null
      locating.current?.abort()
      locating.current = null
    }
    async function open() {
      release()
      const id = request
      setBusy(false)
      setFeedback('')
      if (document.hidden) return
      setCameraStatus('Đang mở camera…')
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error()
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (id !== request) { media.getTracks().forEach(track => track.stop()); return }
        stream = media
        video.srcObject = media
        await video.play()
        if (id === request) setCameraStatus('')
      } catch (error) {
        if (id !== request) return
        release()
        setCameraStatus(error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera chưa được cấp quyền. Bạn có thể tiếp tục bằng thẻ chỉ đường.'
          : 'Chưa mở được camera. Bạn có thể tiếp tục bằng thẻ chỉ đường.')
      }
    }
    void open()
    document.addEventListener('visibilitychange', open)
    return () => { document.removeEventListener('visibilitychange', open); release() }
  }, [])

  async function locate() {
    const video = player.current
    if (!video?.videoWidth || locating.current) return
    const ctrl = new AbortController()
    locating.current = ctrl
    setBusy(true)
    setFeedback('Đang nhận diện vị trí…')
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error()
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!photo || ctrl.signal.aborted) throw new Error()
      const result = await wayfinderApi.locate(photo, undefined, ctrl.signal)
      if (!ctrl.signal.aborted) setFeedback(result.tier === 'auto' && result.label
        ? `Vị trí nhận diện: ${result.label}.` : 'Chưa rõ vị trí. Hãy hướng camera về biển phòng và thử lại.')
    } catch {
      if (!ctrl.signal.aborted) setFeedback('Chưa định vị được. Bạn vẫn có thể tự xác nhận mốc.')
    } finally {
      if (locating.current === ctrl) { locating.current = null; setBusy(false) }
    }
  }

  return <section className="walk-camera" aria-label={`Dẫn đường tới ${destination}`}>
    <video ref={player} muted playsInline autoPlay aria-label="Camera dẫn đường trực tiếp" />
    <div className="walk-top"><JourneyModeButton current="camera" onChange={onMode} /></div>
    {welcome ? <div className="walk-welcome">{welcome}{cameraStatus && <p className="walk-status" role="status">{cameraStatus}</p>}</div> : <div className="walk-controls">
      {!expanded && <div className="walk-companion">
        <div className="walk-bubble" aria-live="polite">
          <h2><Icon size={24} />{direction}</h2>
          <p>{instruction}</p>
        </div>
        <Mascot mood={mood} size={96} />
      </div>}
      <section className="walk-sheet">
        <div className="walk-summary">
          <div><small>{live ? 'Chặng' : 'Tuyến mẫu · Chặng'} {step + 1}/{waypoints.length}{(waypoint.meters != null && waypoint.meters > 0) && ` · ${waypoint.approx ? 'khoảng ' : ''}${Math.round(waypoint.meters)} m`}</small>
            <h1>{waypoint.label}</h1></div>
          <button type="button" className="walk-expand" aria-label={expanded ? 'Thu gọn các mốc' : 'Xem các mốc'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown /> : <ChevronUp />}</button>
        </div>
        {expanded ? <ol className="walk-itinerary" aria-label="Các mốc trên đường">{waypoints.map((p, i) => <li key={i} aria-current={i === step ? 'step' : undefined}>
          {i < step ? <Check size={16} /> : i === waypoints.length - 1 ? <Flag size={16} /> : <MapPin size={16} />}
          <span>{p.label}</span>{p.meters != null && p.meters > 0 && <small>{p.approx ? '≈ ' : ''}{Math.round(p.meters)} m</small>}
        </li>)}</ol> : <p className="walk-next"><Flag size={14} />{next ? `Tiếp theo · ${next.label}` : `Điểm đến · ${destination}`}</p>}
        {(cameraStatus || feedback) && <p className="walk-status" role="status">{cameraStatus || feedback}</p>}
        <div className="walk-actions">
          {step > 0 && <button type="button" className="walk-expand" aria-label="Chặng trước" onClick={() => { setFeedback(''); onStep(step - 1) }}><ChevronLeft /></button>}
          <button type="button" className="walk-confirm" onClick={() => { setFeedback(''); onStep(step + 1) }}><Check size={19} />Đã tới mốc</button>
          {live && <button type="button" className="walk-locate" disabled={busy || !!cameraStatus} onClick={() => void locate()}><LocateFixed size={18} />Định vị lại</button>}
        </div>
        {expanded && <button type="button" className="walk-end" onClick={onExit}>Kết thúc hành trình</button>}
      </section>
    </div>}
  </section>
}
