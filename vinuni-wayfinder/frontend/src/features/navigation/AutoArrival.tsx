import { useEffect, useEffectEvent, useState, type RefObject } from 'react'
import { ApiError, type BackendStep } from '../wayfinder/wayfinderApi'
import { gpsArrival, hasOutdoorTarget, locateVideoFrame, photoMatchesWaypoint } from './waypointArrival'

export type ArrivalTracking = {
  waypoint: BackendStep
  finalNode?: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onArrival: () => void
  paused: boolean
}

type Props = ArrivalTracking & { video?: RefObject<HTMLVideoElement | null>; cameraReady?: boolean }

export function AutoArrival({ waypoint, finalNode, enabled, onToggle, onArrival, paused, video, cameraReady }: Props) {
  const [feedback, setFeedback] = useState('')
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const advance = useEffectEvent(onArrival)
  const gps = hasOutdoorTarget(waypoint)
  const canTrack = gps || Boolean(video && cameraReady)

  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])

  useEffect(() => {
    setFeedback('')
    if (!enabled || !canTrack || !visible || paused) return
    let active = true
    const started = Date.now()
    let firstMatch = 0
    let lastFix = 0
    function observe(match: boolean, timestamp: number) {
      if (!active || document.hidden) return
      if (!match) { firstMatch = 0; return }
      if (firstMatch && timestamp - firstMatch >= 1000 && timestamp - firstMatch <= 30000) {
        active = false
        advance()
      } else if (!firstMatch || timestamp - firstMatch > 30000) firstMatch = timestamp
    }
    if (gps) {
      if (!navigator.geolocation) { setFeedback('Thiết bị chưa hỗ trợ GPS. Bạn có thể tự xác nhận mốc.'); return }
      const watch = navigator.geolocation.watchPosition(fix => {
        if (!active || document.hidden || fix.timestamp < started || fix.timestamp <= lastFix) return
        lastFix = fix.timestamp
        const age = Date.now() - fix.timestamp
        if (age < 0 || age > 10000) { firstMatch = 0; return }
        const gpsFix = gpsArrival(waypoint, fix.coords)
        setFeedback(gpsFix.weak ? 'GPS đang yếu, chờ tín hiệu chính xác hơn để tự chuyển chặng.'
          : gpsFix.match ? 'Đang xác nhận mốc…'
          : gpsFix.distance != null ? `Còn khoảng ${Math.max(1, Math.round(gpsFix.distance))} m tới ${waypoint.target.label || 'mốc tiếp theo'}.` : '')
        observe(gpsFix.match, fix.timestamp)
      }, err => {
        if (!active) return
        firstMatch = 0
        setFeedback(err.code === 1 ? 'Chưa được cấp quyền GPS. Bạn có thể tự xác nhận mốc.' : 'Đang chờ tín hiệu GPS chính xác hơn.')
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
      return () => { active = false; navigator.geolocation.clearWatch(watch) }
    }

    let controller: AbortController | undefined
    let timer: number
    async function scan() {
      if (!active || document.hidden || !video?.current) return
      const ctrl = new AbortController()
      controller = ctrl
      const timeout = window.setTimeout(() => ctrl.abort(), 15000)
      try {
        const result = await locateVideoFrame(video.current, ctrl.signal)
        if (!active || ctrl.signal.aborted || document.hidden) return
        const match = photoMatchesWaypoint(waypoint.target.node, finalNode, result)
        setFeedback(match ? 'Đang xác nhận mốc…' : 'Hướng camera về mốc đang tới.')
        observe(match, Date.now())
      } catch (err) {
        if (!active) return
        firstMatch = 0
        if (err instanceof ApiError && err.code === 'no_index') {
          setFeedback('Máy chủ chưa có ảnh tham chiếu. Hãy tự xác nhận mốc này.')
          return
        }
        setFeedback('Chưa nhận diện được. Bạn vẫn có thể tự xác nhận mốc.')
      } finally { window.clearTimeout(timeout) }
      if (active) timer = window.setTimeout(scan, 4000)
    }
    timer = window.setTimeout(scan, 500)
    return () => { active = false; window.clearTimeout(timer); controller?.abort() }
  }, [enabled, paused, visible, gps, canTrack, waypoint, finalNode, video])

  const unavailable = video ? 'Camera chưa sẵn sàng. Bạn có thể tự xác nhận mốc.' : 'Mở chế độ Camera để tự nhận mốc bằng ảnh.'
  if (!canTrack && !enabled) return <p className="arrival-tracking-note">{unavailable}</p>
  return <div className="arrival-tracking">
    <label><input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} /> Tự chuyển chặng</label>
    <small aria-live="polite">{!canTrack ? unavailable : feedback || (gps ? 'Dùng GPS ngoài trời. Ở chế độ Camera, app gửi ảnh định kỳ tại mốc cần nhận diện.' : 'Gửi ảnh camera định kỳ để nhận diện mốc.')}</small>
  </div>
}
