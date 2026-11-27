import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Camera, Check, CheckCheck, ChevronRight, ImagePlus, Info, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react'
import { BackLink } from '../../shared/ui'
import { useEventJourney } from '../events/EventContext'
import { ApiError, prepPhotoBlob, wayfinderApi, type BackendLocateResponse } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import MascotCamera from './MascotCamera'

export function PhotoLocationPage() {
  const { getPlace, isLive } = useWayfinder()
  const { link } = useEventJourney()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const to = getPlace(params.get('to'))?.id ?? ''
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locResult, setLocResult] = useState<BackendLocateResponse | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickedSpot, setPickedSpot] = useState('')
  const [awaitingSecond, setAwaitingSecond] = useState<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    abortRef.current?.abort()
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }, [preview])

  async function runLocate(source: File | Blob | string, previous?: string) {
    if (!isLive) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLocating(true)
    setError('')
    setShowPicker(false)
    try {
      const prepared = await prepPhotoBlob(source, 512)
      if (controller.signal.aborted) return
      const res = await wayfinderApi.locate(prepared, previous, controller.signal)
      if (controller.signal.aborted) return
      setLocResult(res)
      setPickedSpot(res.tier === 'auto' ? res.spot : (res.top3[0]?.spot ?? ''))
      setAwaitingSecond(res.tier === 'second' ? res.photoId : undefined)
      setShowPicker(res.tier === 'picker')
    } catch (err) {
      if (controller.signal.aborted) return
      setLocResult(null)
      setError(err instanceof ApiError ? err.message : 'Không định vị được từ ảnh này. Hãy thử chụp lại hoặc chọn thủ công.')
    } finally {
      if (!controller.signal.aborted) setLocating(false)
    }
  }

  function selectPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Hãy chọn ảnh JPG, PNG hoặc WebP. Nếu ảnh là HEIC, hãy xuất thành JPG trước.'); e.target.value = ''; return }
    if (file.size > 10 * 1024 * 1024) { setError('Ảnh hơi lớn. Chọn ảnh dưới 10 MB để xem thử.'); e.target.value = ''; return }
    setLoading(true)
    setPreview(URL.createObjectURL(file))
    const prevId = awaitingSecond
    e.target.value = ''
    if (isLive) void runLocate(file, prevId)
  }

  function handleCameraCapture(url: string) {
    setPreview(url)
    setLoading(true)
    setError('')
    const prevId = awaitingSecond
    if (isLive) void runLocate(url, prevId)
  }

  function proceedToRoute(spot: string, label: string, sendCorrection: boolean) {
    if (sendCorrection && locResult?.photoId) {
      // Chỉ gọi /api/correct khi người dùng chủ động xác nhận/chọn vị trí.
      wayfinderApi.correct(locResult.photoId, spot).catch(() => {})
    }
    const q = new URLSearchParams({ from: spot, fromLabel: label })
    if (to) q.set('to', to)
    navigate(link(`/di-den?${q}`))
  }

  function resetCapture(keepPrevious = false) {
    abortRef.current?.abort()
    setPreview('')
    setError('')
    setLocating(false)
    if (!keepPrevious) {
      setLocResult(null)
      setAwaitingSecond(undefined)
      setShowPicker(false)
      setPickedSpot('')
    }
  }

  const pickedCandidate = locResult?.top3.find(c => c.spot === pickedSpot)

  return (
    <div className="narrow-page">
      <BackLink to={link(`/vi-tri${to ? `?to=${to}` : ''}`)}>Chọn vị trí</BackLink>
      <h1 tabIndex={-1}>Camera AR</h1>
      <p className="page-intro">{isLive ? 'Chụp ảnh hành lang xung quanh để định vị trong nhà.' : 'Trải nghiệm mascot ngay trên khung hình.'}</p>
      {!preview && <MascotCamera liveLocate={isLive} onCapture={handleCameraCapture} />}
      <div className={`camera-preview ${preview ? 'has-image' : ''}`} hidden={!preview}>
        {preview ? <><img src={preview} alt="Ảnh vị trí bạn vừa chọn" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setError('Không đọc được ảnh này. Hãy chọn một ảnh khác.'); setPreview('') }} />{loading && <span role="status" className="image-loading">Đang mở ảnh…</span>}</> : <><div className="camera-reticle"><Camera size={46} strokeWidth={1.2} aria-hidden="true" /></div><p>Đưa biển tên phòng vào khung hình</p></>}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="visually-hidden" tabIndex={-1} onChange={selectPhoto} aria-label="Chọn ảnh vị trí" />
      {error && <p className="error-message" role="alert">{error}</p>}
      {isLive && locating && <div className="locating-status" role="status"><LoaderCircle size={19} className="recognition-spinner" /><span>Đang định vị bằng máy chủ…</span></div>}

      {isLive && !locating && locResult && locResult.tier === 'auto' && !showPicker && (
        <section className="recognition-result" aria-label="Kết quả định vị">
          <div className="photo-status" role="status"><CheckCheck size={20} /><div><strong>{locResult.label}</strong><p>Độ tin cậy {Math.round(locResult.confidence * 100)}% · {locResult.ms} ms{locResult.combined ? ' (đã gộp 2 ảnh)' : ''}</p></div></div>
          <button className="button button-primary full-width" onClick={() => proceedToRoute(locResult.spot, locResult.label, false)}><Check size={18} />Đúng, bắt đầu từ đây<ArrowRight size={18} /></button>
          <button className="text-link recognition-manual" onClick={() => setShowPicker(true)}>Không phải ở đây? Chọn vị trí khác<ChevronRight size={17} /></button>
        </section>
      )}

      {isLive && !locating && locResult && (locResult.tier === 'picker' || showPicker) && (
        <section className="recognition-result" aria-label="Chọn vị trí khớp nhất">
          <fieldset className="location-candidates"><legend>Bạn đang đứng ở đâu?</legend>
            {locResult.top3.map(c => (
              <label className={`location-candidate ${pickedSpot === c.spot ? 'is-selected' : ''}`} key={c.spot}>
                <input type="radio" name="locate-candidate" value={c.spot} checked={pickedSpot === c.spot} onChange={() => setPickedSpot(c.spot)} />
                <span className="candidate-icon"><MapPin size={22} /></span>
                <span className="candidate-copy"><strong>{c.label}</strong><small>{c.votes} phiếu khớp</small></span>
                <span className="candidate-check" aria-hidden="true">{pickedSpot === c.spot ? <Check size={16} /> : <ChevronRight size={16} />}</span>
              </label>
            ))}
          </fieldset>
          <button className="button button-primary full-width" disabled={!pickedCandidate} onClick={() => pickedCandidate && proceedToRoute(pickedCandidate.spot, pickedCandidate.label, true)}><Check size={18} />Đúng, mình đang ở đây<ArrowRight size={18} /></button>
          <Link className="text-link recognition-manual" to={link(`/vi-tri${to ? `?to=${to}` : ''}`)}>Không có trong danh sách? Chọn thủ công<ChevronRight size={17} /></Link>
        </section>
      )}

      {isLive && !locating && locResult && locResult.tier === 'second' && !showPicker && (
        <section className="recognition-result" aria-label="Cần thêm một góc chụp">
          <div className="photo-status" role="status"><Info size={20} /><div><strong>Cần chụp thêm một góc khác</strong><p>Ảnh đầu chưa đủ chắc ({Math.round(locResult.confidence * 100)}%). Hãy xoay nhẹ sang hướng khác rồi chụp thêm 1 ảnh để gộp kết quả.</p></div></div>
          <div className="photo-actions">
            <button className="button button-primary" onClick={() => resetCapture(true)}><Camera size={19} />Chụp ảnh thứ hai</button>
            <button className="button button-quiet" onClick={() => setShowPicker(true)}>Xem gợi ý top 3</button>
          </div>
        </section>
      )}

      <div className="photo-actions">
        <button className="button button-quiet" onClick={() => fileRef.current?.click()}><Camera size={20} />{awaitingSecond ? 'Chọn ảnh góc thứ 2' : preview ? 'Chọn ảnh khác' : 'Chọn ảnh có sẵn'}</button>
        <Link className="button button-quiet" to={link(`/anh-mau${to ? `?to=${to}` : ''}`)}><ImagePlus size={19} />Dùng ảnh mẫu</Link>
      </div>
      {preview && <button className="text-link" onClick={() => resetCapture(false)}>Mở lại camera AR<Camera size={17} /></button>}
      {!isLive && <div className="photo-status" role="status"><Info size={20} /><div><strong>{preview ? 'Ảnh đã chọn, chưa nhận diện vị trí' : 'Bạn đang thử luồng chụp ảnh'}</strong><p>Nhận diện tự động chưa sẵn sàng. Hãy chọn điểm xuất phát để tiếp tục.</p></div></div>}
      <Link to={link(`/vi-tri${to ? `?to=${to}` : ''}`)} className="text-link">Chọn vị trí bằng tên phòng<ArrowRight size={18} /></Link>
      <p className="privacy-note"><ShieldCheck size={16} />{isLive ? 'Ảnh được thu nhỏ và xoá thông tin EXIF trước khi gửi định vị; máy chủ không lưu lại ảnh gốc.' : 'Camera và ảnh chỉ hiển thị trên thiết bị, không được tải lên. Mascot là hiệu ứng trên màn hình, chưa neo vào không gian thật.'}</p>
    </div>
  )
}
