import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { requestSensorPermission, STEP_LENGTH_M, useCompass, useStepCounter } from '../../shared/lib/sensors.js'
import { ApiError, type BackendStep } from '../wayfinder/wayfinderApi'
import { ASK_RATIO, ASK_SNOOZE_RATIO, headingDelta, indoorProgress, trackingModes, type NextTurn } from './indoorProgress'
import { gpsArrival, hasOutdoorTarget, locateVideoFrame, photoMatchesWaypoint } from './waypointArrival'

/** Số bước đầu chặng dùng để chốt hướng đi gốc (người vừa rẽ xong cần vài bước để đi thẳng lại). */
const BASELINE_STEPS = 3
const TURN_HOLD_MS = 1000

export type ArrivalTracking = {
  waypoint: BackendStep
  finalNode?: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onArrival: () => void
  paused: boolean
  /** Hướng rẽ ở đầu chặng sau; dùng la bàn để nhận ra người đi đã tới chỗ rẽ. */
  nextTurn?: NextTurn | null
}

type Props = ArrivalTracking & { video?: RefObject<HTMLVideoElement | null>; cameraReady?: boolean }

export function AutoArrival({ waypoint, finalNode, enabled, onToggle, onArrival, paused, nextTurn = null, video, cameraReady }: Props) {
  const [feedback, setFeedback] = useState('')
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const advance = useEffectEvent(onArrival)
  const pdrSupported = typeof window !== 'undefined' && 'DeviceMotionEvent' in window
  const { gps, pdr, photo } = trackingModes({
    outdoorGps: hasOutdoorTarget(waypoint),
    indoorStep: waypoint.mapKind !== 'outdoor' && waypoint.meters > 0,
    motionSensor: pdrSupported,
    cameraReady: Boolean(video && cameraReady),
  })
  const needsMotionPermission = pdr && typeof DeviceMotionEvent !== 'undefined' &&
    typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function'
  const canTrack = gps || photo || pdr
  const pdrOn = enabled && pdr && visible && !paused
  const [stepCount] = useStepCounter(pdrOn)
  const heading: number | null = useCompass(pdrOn)
  const baseline = useRef<number | null>(null)
  if (pdrOn && baseline.current == null && heading != null && stepCount >= BASELINE_STEPS) baseline.current = heading
  const [promptAt, setPromptAt] = useState(ASK_RATIO)
  const walked = stepCount * STEP_LENGTH_M
  const progress = indoorProgress({ meters: waypoint.meters, walked, nextTurn, promptAt,
    turnDeg: baseline.current != null && heading != null ? headingDelta(baseline.current, heading) : null })
  const turned = pdrOn && progress.state === 'turned'

  useEffect(() => {
    if (!turned) return
    const timer = window.setTimeout(() => advance(), TURN_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [turned])

  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])

  useEffect(() => {
    setFeedback('')
    if (!enabled || !(gps || photo) || !visible || paused) return
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
  }, [enabled, paused, visible, gps, photo, waypoint, finalNode, video])

  const unavailable = video ? 'Camera chưa sẵn sàng. Bạn có thể tự xác nhận mốc.' : 'Mở chế độ Camera để tự nhận mốc bằng ảnh.'
  const label = waypoint.target.label || 'mốc tiếp theo'
  const pdrText = !pdrOn ? '' : stepCount === 0 ? 'Đang đếm bước chân… Cầm máy và bắt đầu đi.'
    : progress.state === 'turned' ? `Bạn vừa rẽ. Đang chuyển sang chặng tiếp theo…`
    : progress.state === 'near' ? `Sắp tới ${label}${nextTurn ? ', rẽ theo chỉ dẫn để tự chuyển chặng' : ''}.`
    : `Đã đi khoảng ${Math.round(walked)}/${Math.round(waypoint.meters)} m (ước tính theo bước chân).`
  function toggle(checked: boolean) {
    // iOS chỉ cho xin quyền cảm biến ngay trong lần chạm của người dùng.
    if (checked && pdr) void requestSensorPermission()
    onToggle(checked)
  }
  if (!canTrack && !enabled) return <p className="arrival-tracking-note">{unavailable}</p>
  return <div className="arrival-tracking">
    <label><input type="checkbox" checked={enabled} onChange={e => toggle(e.target.checked)} /> Tự chuyển chặng</label>
    <small aria-live="polite">{!canTrack ? unavailable : feedback || pdrText || (gps ? 'Dùng GPS ngoài trời. Ở chế độ Camera, app gửi ảnh định kỳ tại mốc cần nhận diện.'
      : pdr ? 'Trong nhà: đếm bước chân và la bàn để biết bạn đã tới mốc.' : 'Gửi ảnh camera định kỳ để nhận diện mốc.')}</small>
    {pdrOn && stepCount === 0 && needsMotionPermission &&
      <button type="button" className="button button-quiet arrival-grant" onClick={() => void requestSensorPermission()}>Bật đếm bước chân</button>}
    {pdrOn && progress.state === 'ask' && <div className="arrival-ask" role="group" aria-label="Xác nhận mốc">
      <p>Bạn đã tới {label} chưa?</p>
      <button type="button" className="button button-primary" onClick={onArrival}>Đã tới</button>
      <button type="button" className="button button-quiet" onClick={() => setPromptAt(progress.ratio + ASK_SNOOZE_RATIO)}>Chưa, đi tiếp</button>
    </div>}
  </div>
}
