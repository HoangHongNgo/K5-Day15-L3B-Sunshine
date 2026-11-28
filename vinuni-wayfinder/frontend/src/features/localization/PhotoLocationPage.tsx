import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ChevronRight, LoaderCircle, MapPin, X } from 'lucide-react'
import { useEventJourney } from '../events/EventContext'
import { preferredJourneyMode } from '../navigation/JourneyModeButton'
import { ApiError, prepPhotoBlob, wayfinderApi, type BackendLocateResponse } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import { afterLocate, startUrl } from './quickLocate'
import { requestSensorPermission } from '../../shared/lib/sensors.js'
import './quickLocate.css'

/** Định vị bằng một lần chụp: mở trang là camera bật, bấm chụp là định vị, chắc chắn thì vào hành trình luôn. */
export function PhotoLocationPage() {
  const { getPlace, isLive } = useWayfinder()
  const { link } = useEventJourney()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const to = getPlace(params.get('to'))?.id ?? params.get('to') ?? ''
  const manualUrl = link(`/vi-tri${to ? `?to=${encodeURIComponent(to)}` : ''}`)
  const video = useRef<HTMLVideoElement>(null)
  const request = useRef<AbortController | null>(null)
  const [camera, setCamera] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [previous, setPrevious] = useState<string | undefined>()
  const [candidates, setCandidates] = useState<BackendLocateResponse | null>(null)

  useEffect(() => {
    const player = video.current!
    let stream: MediaStream | undefined
    let cancelled = false
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) { setCamera('failed'); setMessage('Trình duyệt chưa mở được camera (cần HTTPS).'); return }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
        if (cancelled) { media.getTracks().forEach(t => t.stop()); return }
        stream = media
        player.srcObject = media
        await player.play()
        if (!cancelled) setCamera('ready')
      } catch (error) {
        if (cancelled) return
        setCamera('failed')
        setMessage(error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Bạn chưa cấp quyền camera. Hãy bật quyền rồi tải lại trang, hoặc chọn vị trí bằng tên phòng.'
          : 'Chưa mở được camera. Hãy chọn vị trí bằng tên phòng.')
      }
    }
    void Promise.resolve().then(() => { if (!cancelled) return open() })
    return () => { cancelled = true; request.current?.abort(); stream?.getTracks().forEach(t => t.stop()); player.srcObject = null }
  }, [])

  function go(spot: string, label: string, res?: BackendLocateResponse) {
    // Chỉ gửi sửa sai khi người dùng tự chọn trong danh sách (không gửi khi tự nhận).
    if (res) wayfinderApi.correct(res.photoId, spot).catch(() => {})
    navigate(link(startUrl(spot, label, to, preferredJourneyMode())))
  }

  async function shoot() {
    const player = video.current
    if (!player?.videoWidth || busy || !isLive) return
    void requestSensorPermission().catch(() => {})
    const canvas = document.createElement('canvas')
    canvas.width = player.videoWidth
    canvas.height = player.videoHeight
    canvas.getContext('2d')!.drawImage(player, 0, 0)
    const ctrl = new AbortController()
    request.current = ctrl
    setBusy(true)
    setMessage('')
    setCandidates(null)
    try {
      // Thu nhỏ ~512 px qua canvas (xoá EXIF) trước khi gửi.
      const photo = await prepPhotoBlob(canvas.toDataURL('image/jpeg', .9), 512)
      const res = await wayfinderApi.locate(photo, previous, ctrl.signal)
      if (ctrl.signal.aborted) return
      const next = afterLocate(res)
      if (next.kind === 'go') { go(next.spot, next.label); return }
      if (next.kind === 'again') {
        setPrevious(next.previous)
        setMessage('Chưa đủ chắc. Xoay sang hướng khác rồi chụp thêm một ảnh nhé.')
        return
      }
      setPrevious(undefined)
      setCandidates(res)
    } catch (err) {
      if (ctrl.signal.aborted) return
      setMessage(err instanceof ApiError ? err.message : 'Chưa định vị được. Hãy chụp lại.')
    } finally {
      if (!ctrl.signal.aborted) setBusy(false)
    }
  }

  const hint = !isLive ? 'Định vị bằng ảnh cần kết nối máy chủ Wayfinder.'
    : previous ? 'Chụp thêm một góc khác' : 'Hướng camera về hành lang hoặc biển phòng'

  return <section className="quick-locate" aria-label="Chụp ảnh để định vị">
    <video ref={video} muted playsInline autoPlay aria-label="Camera định vị" />
    <div className="quick-locate-top">
      <Link to={manualUrl} className="quick-locate-close" aria-label="Đóng camera"><X size={22} /></Link>
      {camera === 'ready' && !candidates && <p className="quick-locate-hint" role="status">{hint}</p>}
    </div>
    {camera === 'loading' && <p className="quick-locate-hint quick-locate-center" role="status">Đang mở camera…</p>}

    <div className="quick-locate-bottom">
      {message && <p className="quick-locate-message" role="status">{message}</p>}
      {candidates && <div className="quick-locate-pick" role="group" aria-label="Bạn đang ở đâu?">
        <strong>Bạn đang ở đâu?</strong>
        {candidates.top3.map(c => <button type="button" key={c.spot} onClick={() => go(c.spot, c.label, candidates)}>
          <MapPin size={18} /><span>{c.label}</span><ChevronRight size={18} />
        </button>)}
        <button type="button" className="quick-locate-retry" onClick={() => setCandidates(null)}><Camera size={18} />Chụp lại</button>
      </div>}
      {!candidates && camera !== 'failed' && <button type="button" className="quick-locate-shutter" onClick={() => void shoot()}
        disabled={camera !== 'ready' || busy || !isLive} aria-label={busy ? 'Đang định vị' : 'Chụp để định vị'}>
        {busy ? <LoaderCircle size={30} className="recognition-spinner" /> : <Camera size={30} />}
      </button>}
      {!candidates && <span className="quick-locate-caption">{busy ? 'Đang định vị…' : 'Chụp để định vị'}</span>}
      <Link to={manualUrl} className="quick-locate-manual">Chọn bằng tên phòng</Link>
    </div>
  </section>
}
